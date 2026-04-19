import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const DGM_BASE = 'https://discgolfmetrix.com';
const CACHE_MS = 10 * 60 * 1000; // 10 minutes

const SEARCH_AREA = 'Uusimaa';
const SEARCH_COUNTRY = 'FI';
const SEARCH_TYPE = 'C'; // PDGA C-tier

// In-memory cache (works on any platform — Cloudflare, Vercel, Node, etc.)
let cache: { data: string; timestamp: number } | null = null;

interface Competition {
  id: string;
  name: string;
  date: string;
  time: string;
  course: string;
  place: string;
  location: string;
  description: string;
  classes: string[];
  maxRegistrants: number | null;
  registeredCount: number;
  registrationStart: string | null;
  registrationEnd: string | null;
  registrationOpen: boolean;
  metrixUrl: string;
}

async function fetchWithTimeout(url: string, timeoutMs = 20000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DGM-Finder/1.0)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function parseDateStr(raw: string): string {
  const m = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return raw;
  const y = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

function parseTimeStr(raw: string): string {
  const m = raw.match(/(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
}

function parseListingHtml(html: string): Competition[] {
  const competitions: Competition[] = [];
  const compRegex = /<a\s+href="\/(\d+)"[^>]*class="gridlist"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = compRegex.exec(html)) !== null) {
    const id = match[1];
    const block = match[2];

    const nameM = block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
    const rawName = nameM ? nameM[1].trim() : '';
    const name = rawName.replace(/&rarr;/g, '\u2192').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ');

    const dateM = block.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d{1,2}:\d{2})/);
    const dateOnlyM = !dateM ? block.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})\s*-\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/) : null;

    let date = '';
    let time = '';
    if (dateM) {
      date = parseDateStr(dateM[1]);
      time = parseTimeStr(dateM[2]);
    } else if (dateOnlyM) {
      date = parseDateStr(dateOnlyM[1]);
    }

    const courseM = block.match(/icon_flag_triangle[\s\S]*?<\/svg>\s*([\s\S]*?)<\/li>/i);
    const course = courseM
      ? courseM[1].replace(/<[^>]+>/g, '').trim().replace(/&rarr;/g, '\u2192').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
      : '';

    const locM = block.match(/icon_location[\s\S]*?<\/svg>\s*([\s\S]*?)<\/li>/i);
    const place = locM ? locM[1].replace(/<[^>]+>/g, '').trim() : '';

    const plM = block.match(/Players:\s*(\d+)/i);
    const registeredCount = plM ? parseInt(plM[1]) : 0;

    const regM = block.match(/Registration open until\s+([\s\S]*?)<\/li>/i);
    const registrationEnd = regM ? regM[1].replace(/<[^>]+>/g, '').trim() : null;
    const registrationOpen = block.includes('Registration open');

    const descM = block.match(/icon_speech[\s\S]*?<\/svg>\s*([\s\S]*?)<\/li>/i);
    const description = descM ? descM[1].replace(/<[^>]+>/g, '').trim() : '';

    competitions.push({
      id, name, date, time, course, place,
      location: place, description,
      classes: [], maxRegistrants: null, registeredCount,
      registrationStart: null, registrationEnd, registrationOpen,
      metrixUrl: `${DGM_BASE}/${id}`,
    });
  }

  return competitions;
}

function deduplicateComps(comps: Competition[]): Competition[] {
  const isSub = (name: string) => {
    if (!name.includes('\u2192') && !name.includes('→')) return false;
    const afterArrow = name.split(/[→\u2192]/).slice(1).join('').trim();
    return /\d/.test(afterArrow) || /^(Kierros|etapp|Round|Lohko|Osakilpailu)/i.test(afterArrow);
  };

  const groups = new Map<string, Competition[]>();
  for (const c of comps) {
    const base = c.name.split(/\s*[→\u2192]\s*/)[0].trim();
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base)!.push(c);
  }

  const result: Competition[] = [];
  for (const [, members] of groups) {
    const parents = members.filter(c => !isSub(c.name));
    if (parents.length > 0) {
      parents.sort((a, b) => b.registeredCount - a.registeredCount);
      result.push(parents[0]);
    } else {
      members.sort((a, b) => b.registeredCount - a.registeredCount);
      result.push(members[0]);
    }
  }

  return result;
}

async function enrichCompetition(comp: Competition): Promise<void> {
  try {
    const html = await fetchWithTimeout(`${DGM_BASE}/${comp.id}`, 15000);

    // --- Extract classes ---
    const classSet = new Set<string>();

    const divTableIdx = html.indexOf('<th>Division</th>');
    if (divTableIdx > -1) {
      const tableStart = html.lastIndexOf('<table', divTableIdx);
      const tableEnd = html.indexOf('</table>', divTableIdx);
      if (tableStart > -1 && tableEnd > -1) {
        const tableHtml = html.substring(tableStart, tableEnd + 8);
        const leagueRegex = /<span class="league">([^<]+)<\/span>/gi;
        let lm;
        while ((lm = leagueRegex.exec(tableHtml)) !== null) {
          const code = lm[1].trim();
          if (/^(OR|AND|NOT)$/i.test(code)) continue;
          if (code.length >= 2 && code.length <= 10) {
            classSet.add(code);
          }
        }
      }
    }

    if (classSet.size === 0) {
      const selectRegex = /<select[^>]*name="class(?:_option)?"[^>]*>([\s\S]*?)<\/select>/i;
      const selectMatch = selectRegex.exec(html);
      if (selectMatch) {
        const optionRegex = /<option[^>]*>([^<]+)<\/option>/gi;
        let optMatch;
        while ((optMatch = optionRegex.exec(selectMatch[1])) !== null) {
          const text = optMatch[1].trim();
          if (!text || text === '(Choose class)' || text.length < 2) continue;
          if (/^(Dansk|Deutsch|Eesti|English|Espa|Fran|Ísl|Latvi|Liet|Norsk|Polski|Suomi|Svensk|Русс|日本)/.test(text)) continue;
          classSet.add(text);
        }
      }
    }

    if (classSet.size === 0) {
      const leagueAnywhere = /<span class="league">([^<]+)<\/span>/gi;
      let lm2;
      while ((lm2 = leagueAnywhere.exec(html)) !== null) {
        const code = lm2[1].trim();
        if (code.length >= 2 && code.length <= 10) {
          classSet.add(code);
        }
      }
    }

    comp.classes = [...classSet];

    // --- Extract metadata from main-header-meta section ---
    let searchFrom = 0;
    while (true) {
      const metaStart = html.indexOf('class="main-header-meta"', searchFrom);
      if (metaStart === -1) break;
      const metaEnd = html.indexOf('</ul>', metaStart);
      if (metaEnd === -1) break;
      const metaHtml = html.substring(metaStart, metaEnd + 5);
      const metaText = metaHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

      if (comp.maxRegistrants === null) {
        const maxM = metaText.match(/Maximum number of players:\s*(\d+)/i);
        if (maxM) comp.maxRegistrants = parseInt(maxM[1]);
      }

      const regCountM = metaText.match(/number of registered players:\s*(\d+)/i);
      if (regCountM) {
        const count = parseInt(regCountM[1]);
        if (count > comp.registeredCount) comp.registeredCount = count;
      }

      if (!comp.registrationStart) {
        const regStartM = metaText.match(/Registration start:\s*([\d\/\s:+\-Z]+)/i);
        if (regStartM) comp.registrationStart = regStartM[1].trim();
      }

      if (!comp.registrationEnd) {
        const regEndM = metaText.match(/Registration end:\s*([\d\/\s:+\-Z]+)/i);
        if (regEndM) comp.registrationEnd = regEndM[1].trim();
      }

      searchFrom = metaEnd + 5;
    }

    // --- Extract course name from detail page ---
    const courseLinkM = html.match(/<a\s+href="\/course\/\d+"[^>]*>([^<]+)<\/a>/i);
    if (courseLinkM) {
      comp.course = courseLinkM[1]
        .replace(/&rarr;/g, '\u2192')
        .replace(/&amp;/g, '&')
        .replace(/&nbsp;/g, ' ')
        .trim();
    }

    // --- Fallback registration date patterns ---
    if (!comp.registrationEnd) {
      const regEndM = html.match(/registration_end['":\s]+['"]?(\d{1,2}\/\d{1,2}\/\d{2,4}[^'"]*)/i);
      if (regEndM) comp.registrationEnd = regEndM[1].trim();
    }
    if (!comp.registrationStart) {
      const regStartM = html.match(/registration_start['":\s]+['"]?(\d{1,2}\/\d{1,2}\/\d{2,4}[^'"]*)/i);
      if (regStartM) comp.registrationStart = regStartM[1].trim();
    }

    if (comp.maxRegistrants === null) {
      const maxPatterns = [
        /max[\s_]*players[^<]{0,30}:?\s*(\d+)/i,
        /maximum[^<]{0,30}players[^<]{0,10}:?\s*(\d+)/i,
        /max[\s_]*participant[^<]{0,20}:?\s*(\d+)/i,
      ];
      for (const pat of maxPatterns) {
        const maxM = pat.exec(html);
        if (maxM) {
          comp.maxRegistrants = parseInt(maxM[1]);
          break;
        }
      }
    }

  } catch (err) {
    console.error(`Failed to enrich competition ${comp.id}:`, err);
  }
}

async function fetchCompetitions(date1: string, date2: string): Promise<Competition[]> {
  const allCompetitions: Competition[] = [];
  const seenIds = new Set<string>();

  const addComps = (comps: Competition[]) => {
    let newCount = 0;
    for (const comp of comps) {
      if (!seenIds.has(comp.id)) {
        seenIds.add(comp.id);
        allCompetitions.push(comp);
        newCount++;
      }
    }
    return newCount;
  };

  for (let page = 0; page < 5; page++) {
    try {
      const params = new URLSearchParams({
        name: '',
        date1,
        date2,
        country_code: SEARCH_COUNTRY,
        area: SEARCH_AREA,
        type: SEARCH_TYPE,
        from: String(page * 30 + 1),
        to: String((page + 1) * 30),
      });

      const url = `${DGM_BASE}/competitions_server.php?${params}`;
      const html = await fetchWithTimeout(url, 15000);
      const comps = parseListingHtml(html);
      const newC = addComps(comps);
      console.log(`[DGM] Page ${page}: ${comps.length} competitions, ${newC} new (total: ${allCompetitions.length})`);

      if (comps.length === 0 || (newC === 0 && page > 0)) break;
    } catch (err) {
      console.error(`[DGM] Page ${page} failed:`, err);
      break;
    }
    await new Promise(r => setTimeout(r, 500));
  }

  return allCompetitions;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get('refresh') === 'true';

  // Check in-memory cache
  if (!forceRefresh && cache && Date.now() - cache.timestamp < CACHE_MS) {
    const cached = JSON.parse(cache.data);
    if (cached.success) return NextResponse.json(cached);
  }

  try {
    const today = new Date();
    const future = new Date(today);
    future.setDate(future.getDate() + 30);
    const date1 = today.toISOString().split('T')[0];
    const date2 = future.toISOString().split('T')[0];

    console.log(`[DGM] Fetching PDGA C-tier, area=${SEARCH_AREA}, ${date1} to ${date2}`);

    let competitions = await fetchCompetitions(date1, date2);
    console.log(`[DGM] Found ${competitions.length} raw competitions`);

    const beforeDedup = competitions.length;
    competitions = deduplicateComps(competitions);
    console.log(`[DGM] Dedup: ${beforeDedup} → ${competitions.length}`);

    competitions = competitions.filter(c => {
      if (!c.date) return true;
      return c.date >= date1 && c.date <= date2;
    });

    const batchSize = 5;
    for (let i = 0; i < competitions.length; i += batchSize) {
      const batch = competitions.slice(i, i + batchSize);
      await Promise.all(batch.map(c => enrichCompetition(c)));
      console.log(`[DGM] Enriched ${Math.min(i + batchSize, competitions.length)}/${competitions.length}`);
      if (i + batchSize < competitions.length) {
        await new Promise(r => setTimeout(r, 300));
      }
    }

    competitions.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date.localeCompare(b.date);
    });

    const output = {
      success: true,
      competitions,
      totalFound: competitions.length,
      searchParams: {
        area: SEARCH_AREA,
        country: 'Finland',
        tier: 'PDGA C-Tier',
        dateRange: `${date1} to ${date2}`,
        source: 'discgolfmetrix.com',
      },
      fetchedAt: new Date().toISOString(),
    };

    // Update cache
    cache = { data: JSON.stringify(output), timestamp: Date.now() };

    return NextResponse.json(output);
  } catch (error) {
    console.error('[DGM] Fetch error:', error);

    // Return stale cache if available
    if (cache) {
      try {
        const stale = JSON.parse(cache.data);
        return NextResponse.json({ ...stale, _stale: true, _error: error instanceof Error ? error.message : 'Fetch failed' });
      } catch { /* no cache */ }
    }

    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch', competitions: [], totalFound: 0 },
      { status: 500 }
    );
  }
}
