# PDGA C-Tier Competition Finder

Finds upcoming PDGA C-tier disc golf competitions in Uusimaa, Finland by scraping [discgolfmetrix.com](https://discgolfmetrix.com).

## What it shows

- Competition date, name, course, and location
- PDGA C-Tier badge
- Available classes (divisions)
- Player count vs. max capacity
- Registration deadline and open/closed status
- Direct link to each competition on Metrix

## Tech stack

- [Next.js](https://nextjs.org/) (App Router)
- [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS](https://tailwindcss.com/) v4
- [shadcn/ui](https://ui.shadcn.com/) components
- Deployed on [Cloudflare Pages](https://pages.cloudflare.com/)

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy to Cloudflare Pages

### Prerequisites

- A [Cloudflare](https://dash.cloudflare.com/) account
- A [GitHub](https://github.com/) account
- This repo pushed to GitHub

### Step-by-step

1. **Push your code to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/dgm-finder.git
   git branch -M main
   git push -u origin main
   ```

2. **Go to Cloudflare Dashboard**
   - Log in at [dash.cloudflare.com](https://dash.cloudflare.com/)
   - In the left sidebar, click **Workers & Pages**
   - Click **Create** (top-right)

3. **Connect your GitHub repo**
   - Click the **Pages** tab
   - Click **Connect to Git**
   - If prompted, authorize Cloudflare to access your GitHub account
   - Select the `dgm-finder` repository
   - Click **Begin setup**

4. **Configure the build**
   - **Build command:** `npx @cloudflare/next-on-pages`
   - **Deploy command:** `npx wrangler pages deploy .vercel/output/static --project-name=dgm-finder`
   - **Root directory:** `/`
   - The `wrangler.toml` in the repo configures compatibility flags

5. **Click Deploy**
   - Cloudflare will install dependencies, build, and deploy
   - Once done, you get a URL like `https://dgm-finder.pages.dev`

6. **(Optional) Custom domain**
   - Go to your project → **Settings → Custom domains**
   - Follow the DNS instructions

### Subsequent deploys

Every push to the `main` branch triggers an automatic rebuild.

## Project structure

```
src/
├── app/
│   ├── api/competitions/route.ts   Scraper API (server-side, in-memory cache)
│   ├── globals.css                 Tailwind CSS theme
│   ├── layout.tsx                  Root layout and metadata
│   └── page.tsx                    Competition table UI
├── components/ui/                  4 shadcn/ui components (badge, button, card, table)
└── lib/utils.ts                    CSS utility helper
```

## How the scraper works

1. Fetches competition listings from `discgolfmetrix.com/competitions_server.php` using search parameters: `area=Uusimaa`, `country_code=FI`, `type=C` (PDGA C-tier), next 30 days
2. Parses HTML to extract competition names, dates, locations, and player counts
3. Deduplicates sub-competitions (rounds of parent tournaments)
4. Enriches each competition by fetching its detail page for classes, course name, registration deadline, and max players
5. Results are cached in-memory for 10 minutes (`?refresh=true` bypasses the cache)

## License

MIT
