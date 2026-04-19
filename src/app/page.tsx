'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  CalendarDays,
  MapPin,
  Users,
  ExternalLink,
  RefreshCw,
  Trophy,
  Clock,
  AlertTriangle,
  Target,
  Loader2,
  Disc3,
} from 'lucide-react';

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

interface ApiResponse {
  success: boolean;
  competitions: Competition[];
  totalFound: number;
  searchParams?: {
    location: string;
    tier: string;
    dateRange: string;
    source: string;
  };
  fetchedAt?: string;
  message?: string;
  error?: string;
  _stale?: boolean;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function formatTime(timeStr: string): string {
  if (!timeStr) return '';
  return timeStr;
}

function daysUntil(dateStr: string): number | null {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    return Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  } catch {
    return null;
  }
}

function RegistrationBadge({ comp }: { comp: Competition }) {
  if (comp.registrationOpen && comp.registrationEnd) {
    return (
      <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs">
        Open until {comp.registrationEnd}
      </Badge>
    );
  }
  if (comp.registrationOpen) {
    return <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs">Open</Badge>;
  }
  if (comp.registrationEnd) {
    return (
      <Badge className="bg-amber-100 text-amber-800 text-xs">
        Deadline: {comp.registrationEnd}
      </Badge>
    );
  }
  return <Badge variant="outline" className="text-xs">See Metrix</Badge>;
}

function FillBar({ current, max }: { current: number; max: number | null }) {
  if (!max || max <= 0) return null;
  const pct = Math.min(100, (current / max) * 100);
  return (
    <div className="flex items-center gap-1.5 mt-1">
      <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-500' : 'bg-emerald-500'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] text-gray-400 whitespace-nowrap">
        {Math.round(pct)}%
      </span>
    </div>
  );
}

export default function Home() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchCompetitions = useCallback(async (refresh = false) => {
    if (refresh) setIsRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const url = refresh ? '/api/competitions?refresh=true' : '/api/competitions';
      const res = await fetch(url);
      const json: ApiResponse = await res.json();
      if (!json.success) setError(json.error || 'Failed to load competitions');
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchCompetitions(); }, [fetchCompetitions]);

  const competitions = data?.competitions || [];
  const totalFound = data?.totalFound || 0;

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 via-emerald-50/20 to-gray-100">
      {/* Header */}
      <header className="border-b bg-white/90 backdrop-blur-md sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-2 rounded-lg shadow-md">
                <Disc3 className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">
                  PDGA C-Tier Competitions
                </h1>
                <p className="text-sm text-gray-500">
                  Uusimaa, Finland &middot; Next 30 days &middot; discgolfmetrix.com
                </p>
              </div>
            </div>
            <Button
              onClick={() => fetchCompetitions(true)}
              disabled={loading || isRefreshing}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${(loading || isRefreshing) ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Search info banner */}
        <Card className="border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50">
          <CardContent className="py-4">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              <div className="flex items-center gap-1.5 text-gray-700">
                <MapPin className="h-4 w-4 text-emerald-600" />
                <span>Uusimaa, Finland</span>
              </div>
              <div className="flex items-center gap-1.5 text-gray-700">
                <Trophy className="h-4 w-4 text-emerald-600" />
                <span>PDGA C-Tier</span>
              </div>
              <div className="flex items-center gap-1.5 text-gray-700">
                <CalendarDays className="h-4 w-4 text-emerald-600" />
                <span>Next 30 days</span>
              </div>
              <div className="flex items-center gap-1.5 font-semibold text-emerald-700">
                <Target className="h-4 w-4" />
                <span>{totalFound} competition{totalFound !== 1 ? 's' : ''} found</span>
              </div>
              {data?._stale && (
                <div className="flex items-center gap-1.5 text-amber-600">
                  <AlertTriangle className="h-4 w-4" />
                  <span>Showing cached data (fetch failed)</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Loading state */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="relative mb-6">
              <Loader2 className="h-12 w-12 text-emerald-600 animate-spin" />
            </div>
            <p className="text-lg text-gray-700 font-semibold">
              Fetching PDGA C-Tier competitions...
            </p>
            <p className="text-sm text-gray-500 mt-1 max-w-md text-center">
              Querying Disc Golf Metrix for PDGA C-tier events in Uusimaa.
              This takes a few seconds.
            </p>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <Card className="border-red-200 bg-red-50/50">
            <CardContent className="py-8 text-center">
              <AlertTriangle className="h-10 w-10 text-red-500 mx-auto mb-3" />
              <h3 className="text-lg font-semibold text-red-800 mb-1">Failed to Load Competitions</h3>
              <p className="text-sm text-red-600 mb-4 max-w-md mx-auto">{error}</p>
              <Button onClick={() => fetchCompetitions(true)} variant="outline" className="gap-2">
                <RefreshCw className="h-4 w-4" /> Try Again
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Empty state */}
        {!loading && !error && competitions.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <CalendarDays className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-700 mb-2">No PDGA C-Tier Competitions Found</h3>
              <p className="text-sm text-gray-500 max-w-lg mx-auto">
                No PDGA C-tier competitions were found in Uusimaa in the next 30 days.
                The data is fetched live from discgolfmetrix.com.
              </p>
              <p className="text-xs text-gray-400 mt-2">
                {data?.fetchedAt && `Last checked: ${new Date(data.fetchedAt).toLocaleString()}`}
              </p>
              <Button onClick={() => fetchCompetitions(true)} variant="outline" className="mt-4 gap-2">
                <RefreshCw className="h-4 w-4" /> Refresh
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Results table */}
        {!loading && !error && competitions.length > 0 && (
          <>
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">Upcoming PDGA C-Tier Events</CardTitle>
                    <CardDescription>
                      Click any competition name to view details on Disc Golf Metrix
                    </CardDescription>
                  </div>
                  {data?.fetchedAt && (
                    <p className="text-xs text-gray-400">
                      Updated: {new Date(data.fetchedAt).toLocaleTimeString()}
                    </p>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                        <TableHead className="w-[160px] min-w-[140px]">
                          <div className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" /> Date</div>
                        </TableHead>
                        <TableHead className="min-w-[200px]">Competition</TableHead>
                        <TableHead className="w-[140px] min-w-[120px]">
                          <div className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> Place</div>
                        </TableHead>
                        <TableHead className="w-[200px] min-w-[160px]">Classes</TableHead>
                        <TableHead className="w-[110px] min-w-[100px]">
                          <div className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Players</div>
                        </TableHead>
                        <TableHead className="w-[160px] min-w-[140px]">
                          <div className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Reg. Deadline</div>
                        </TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {competitions.map((comp, idx) => {
                        const days = daysUntil(comp.date);
                        return (
                          <TableRow key={comp.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}>
                            <TableCell>
                              <div className="flex flex-col gap-0.5">
                                <span className="font-medium text-sm whitespace-nowrap">{formatDate(comp.date)}</span>
                                {comp.time && (
                                  <span className="text-xs text-gray-400">{formatTime(comp.time)}</span>
                                )}
                                {days !== null && (
                                  <span className={`text-xs font-medium ${
                                    days === 0 ? 'text-blue-600' :
                                    days < 0 ? 'text-gray-400' :
                                    days <= 3 ? 'text-orange-600' :
                                    days <= 7 ? 'text-emerald-600' :
                                    'text-gray-500'
                                  }`}>
                                    {days === 0 ? 'Today!' : days < 0 ? `${Math.abs(days)}d ago` : `In ${days}d`}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <a
                                href={comp.metrixUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-semibold text-sm text-emerald-700 hover:text-emerald-900 hover:underline leading-snug"
                              >
                                {comp.name}
                              </a>
                              <Badge className="bg-violet-600 hover:bg-violet-700 text-white text-[10px] mt-1 px-1.5 py-0 font-semibold">
                                C - PDGA
                              </Badge>
                              {comp.course && (
                                <p className="text-xs text-gray-500 mt-0.5">{comp.course}</p>
                              )}
                              {comp.description && (
                                <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-1">{comp.description}</p>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-start gap-1">
                                <MapPin className="h-3.5 w-3.5 text-gray-400 mt-0.5 shrink-0" />
                                <span className="text-sm text-gray-600">{comp.location || comp.place || '—'}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {comp.classes.length > 0
                                  ? comp.classes.map((c, i) => (
                                      <Badge key={i} variant="outline" className="text-xs font-normal px-1.5 py-0">
                                        {c}
                                      </Badge>
                                    ))
                                  : <span className="text-xs text-gray-400 italic">—</span>
                                }
                              </div>
                            </TableCell>
                            <TableCell>
                              <div>
                                <span className="font-semibold text-sm">
                                  {comp.registeredCount || '—'}
                                </span>
                                {comp.maxRegistrants && (
                                  <span className="text-gray-400 text-sm">/{comp.maxRegistrants}</span>
                                )}
                                <FillBar current={comp.registeredCount} max={comp.maxRegistrants} />
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-0.5">
                                {comp.registrationEnd ? (
                                  <span className="text-sm">{comp.registrationEnd}</span>
                                ) : (
                                  <span className="text-xs text-gray-400">See Metrix</span>
                                )}
                                {comp.registrationOpen && (
                                  <span className="text-xs font-medium text-emerald-600">Open</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <a
                                href={comp.metrixUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center w-7 h-7 rounded-md hover:bg-gray-100 transition-colors"
                                title="View on Metrix"
                              >
                                <ExternalLink className="h-3.5 w-3.5 text-gray-400" />
                              </a>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <p className="text-center text-xs text-gray-400 mt-4">
              Data sourced from{' '}
              <a
                href="https://discgolfmetrix.com/?u=competitions_all"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-gray-600"
              >
                discgolfmetrix.com
              </a>
              . Registration details may change — always verify on the Metrix page.
            </p>
          </>
        )}
      </main>

      <footer className="border-t bg-white/60 py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-xs text-gray-400">
          PDGA C-Tier Disc Golf Competition Finder — Uusimaa, Finland
        </div>
      </footer>
    </div>
  );
}
