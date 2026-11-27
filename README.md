# PatentPulse — IP Litigation Monitoring & Analytics

A **functional study clone** of a patent-litigation analytics platform (inspired by the public layout and
workflows of ipverse.greyb.com), rebuilt from scratch with **original branding, original code and an
independent data pipeline**. No trademarked assets, logos, or proprietary data from any commercial
platform are used — live case records are ingested from **free public court APIs** (CourtListener /
RECAP), and historical baseline data for forums without a free feed is clearly labeled synthetic.

Track US district-court patent suits, PTAB trials, UPC actions, EPO oppositions, ITC Section 337
investigations and SEP/FRAND disputes — with live dashboards, full-text search, analytics, watchlists and
an admin console backed by a real database and REST API.

> **Disclaimer** — Records are labeled by origin (`courtlistener`, `uspto-ptab`, `seed`/`synthetic`,
> `manual`). Live US district-court dockets are real public court data mirrored from PACER via
> CourtListener; other forums run on a fictional sample baseline until a free public feed is wired in.
> This project is an independent engineering prototype and is not affiliated with, endorsed by, or
> connected to any commercial litigation-analytics provider.

---

## Repository layout

Plain-source repository — the complete application tree is committed directly (no archives, no
restore step). Clone and run:

```bash
git clone https://github.com/kaustubhadixit/casepulse.git
cd casepulse
bun install && bun run db:push && bun run db:seed
bun run dev
```

---

## Features

### Case-type workspaces (mirrors the reference product's navigation)

| Workspace | Route | Description |
| --- | --- | --- |
| US Patent Litigations | `#/litigations` | District-court infringement suits with search, court/status/tech/date filters, sorting and pagination |
| PTAB Case Tracker | `#/ptab` | IPR / PGR / CBM petitions, institution decisions, final written decisions |
| Unified Patent Court | `#/upc` | UPC infringement actions across local & central divisions |
| UPC Analytics | `#/upc/analytics` | Jurisdiction-locked dashboard: filings trend, divisions, plaintiffs, defendants, action types |
| Patent Oppositions | `#/oppositions` | EPO oppositions (Art. 99 EPC) with outcomes |
| ITC Investigations | `#/itc` | Section 337 investigations, ALJ determinations |
| SEP Litigation | `#/sep` | Standard-essential patent & FRAND disputes |

### Intelligence layers

- **Live IP Activity Feed** — new filings + docket events, pushed over SSE the moment the engine ingests them (ticker + home panel)
- **Global Analytics** (`#/analytics`) — monthly filing trends, top courts, top plaintiffs/defendants, technology mix, status distribution, NPE vs operating-company share
- **Patents in Litigation** (`#/patents`) — most-asserted patents with assertion histories
- **Companies** (`#/companies`) — plaintiff/defendant profiles, exposure stats, top opponents, counsel, portfolios
- **Law Firm Analytics** (`#/law-firms`) — caseload by side + monthly EPO opposition filings (10-month trend)
- **Litigation News** (`#/news`) — verdicts, settlements, institution decisions generated from the pipeline
- **Watchlist** — any signed-in user can track cases; statuses update as data refreshes
- **Admin Console** (`#/admin`) — full case CRUD (create/edit/delete with dialogs), data-sync control and audit log

### Live data pipeline — continuous, change-driven, near real time

The original platform refreshes from proprietary litigation feeds. This clone replaces that with a
**continuously-running live engine on free public APIs** (`src/lib/live.ts`). There is no refresh
schedule: the engine watches upstream **change cursors** and fetches exactly when the data changes.

| Lane | Source | What it provides | Trigger |
| --- | --- | --- | --- |
| Change cursor | **CourtListener RECAP core API** (`date_modified__gt`) | Every modification to tracked dockets — new filings, judge assignments, terminations | budget-aware poll: ~1/min hot, ≤ 15 min idle |
| New filings | **CourtListener RECAP search** (`filed_after`, patent-infringement match) | Brand-new patent complaints with full party lists | same tick, deduplicated by docket id |
| PTAB | **USPTO Open Data Portal — PTAB API** | Real PTAB/AIA trial proceedings (IPR/PGR) | activates when `USPTO_PTAB_KEY` is set |
| Enrichment | **USPTO PatentsView** | Patent bibliographic data (title/assignee/abstract) for asserted patents | on demand during ingestion |
| Fallback | **Built-in synthetic generator** | Labeled sample filings across all six forums so the feed never goes dark | demo mode only (no upstream key configured) |

How "almost live" works:

1. **Change cursor** — RECAP's `date_modified__gt` filter returns only dockets modified after our
   persisted cursor (survives restarts). When PACER data is mirrored upstream, we see it on the next
   poll — seconds to minutes later.
2. **Adaptive, budget-aware cadence** — planned around the free token plan (5 req/min · 50/hour ·
   125/day): ~1 request/min while changes flow, gradual backoff to ≤ 15 min when idle, snap back
   to hot the instant anything changes. A request ledger (4/min · 40/hour · 110/day caps with
   headroom) makes 429s structurally impossible; nudges, catch-up pagination and build-time
   backfills all fit inside the plan. Tunable via `LIVE_MIN_INTERVAL_MS` / `LIVE_MAX_INTERVAL_MS`.
3. **Traffic-driven nudges** — every read API call (`/api/feed`, `/api/cases`, `/api/stats`) may
   trigger an immediate upstream check, so the pipeline is effectively always watching under load.
4. **SSE push** — `GET /api/live/stream` streams `case:new` / `case:update` events to browsers; every
   mounted view refetches instantly (no polling storms, no refresh button). The header shows a
   **LIVE / WATCHING / DEMO** badge with engine telemetry.
5. **Serverless-safe** — on read-only deployments (Vercel + embedded SQLite snapshot) the same engine
   holds fresh records in a per-instance in-memory overlay merged into reads. The
   `/api/sync/pulse` cron in `vercel.json` is only a keep-warm tick — data still moves strictly on
   change. Point `DATABASE_URL` at Turso/Postgres for persistent writes.
6. **Manual check** — Admin Console / `#/data-sources` → "Refresh now", or `POST /api/sync`.

Every ingested record carries its origin in `Case.source` (`courtlistener | uspto-ptab | synthetic`),
and `GET /api/sources` reports live health, key status and engine telemetry. Drop any of the keys
into `.env` and that source goes live — no code changes.

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, TypeScript, Turbopack dev) |
| UI | Tailwind CSS 4 + shadcn/ui (New York) + lucide-react |
| Charts | **Custom dependency-free SVG components** (trend chart with crosshair, sparklines, bar lists, share bars) |
| Typography | Fraunces (display serif) · Geist Sans (UI) · JetBrains Mono (tabular data) |
| State | React hooks + context (auth), hash-based client router |
| Database | SQLite via Prisma ORM (`db/custom.db`) |
| Auth | Cookie sessions + scrypt password hashing (Node crypto, zero external deps) |
| Validation | zod on every route (query params + request bodies) |
| Runtime | Node 20+ or Bun |

Single-page architecture: the whole experience lives in the `/` route with hash-based views
(`#/litigations`, `#/case/<id>`, …) and a complete REST API under `/api/*`.

---

## Design system — three curated palettes

The UI ships with **three hand-tuned color combinations**, switchable at runtime from the header
(persisted in `localStorage`, no flash on reload):

| Theme | Mood | Palette |
| --- | --- | --- |
| **Oxford** (default) | light editorial — law-journal / broadsheet | warm paper `#F6F3EC` · oxford blue `#2B4468` · brass `#B0884C` |
| **Midnight** | dark terminal — financial-data desk | deep ink `#12151D` · gold `#E0AF4A` · teal `#57A8A0` |
| **Verde** | dark botanical | forest ink `#182219` · verdigris `#7FB39A` · copper `#B0714A` |

Design language: serif masthead + display headings, uppercase micro-labels, tabular-numeral data
tables, hairline borders, a live filings ticker, sharp 2px radii and theme-aware status badges —
all driven by CSS variables so every chart and badge re-colors instantly with the palette.

---

## Performance & security

**Latency**

- In-memory TTL cache with stampede protection (`src/lib/cache.ts`) in front of every aggregate:
  `/api/stats` ~5 ms, `/api/sources` ~4 ms warm (was ~3.5 s hitting upstream probes)
- The live engine runs **non-blocking** in the background — read endpoints never wait for ingestion, and SSE push replaces client polling
- Slim Prisma projections + parallel `Promise.all` aggregations, NPE share computed via SQL `groupBy`
- HTTP `Cache-Control` (`max-age` + `stale-while-revalidate`) on all public GETs; `no-store` on auth
- Charts are hand-rolled SVG — no chart library in the client bundle

**Sanitisation**

- zod validation on every query string (enum whitelists, length caps, regex dates) and every request body
- Per-IP sliding-window rate limits on all routes (auth: 10/min, writes: 30/min, sync: 6/min)
- Parameterized Prisma queries only; no `dangerouslySetInnerHTML` anywhere
- Security headers (`X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`), `poweredByHeader` off
- httpOnly + sameSite session cookies; generic auth errors; write-guard on read-only serverless deploys

---

## Quickstart (local)

```bash
# 1. Install dependencies
bun install            # or: npm install

# 2. Configure environment
cp .env.example .env   # defaults work out of the box
# Optional: add COURTLISTENER_TOKEN (free) for live federal dockets

# 3. Create the database schema
bun run db:push

# 4. Seed the historical baseline (620+ cases, parties, patents, events, news)
bun run db:seed

# 5. (Optional) Backfill real dockets from CourtListener (needs the token)
bun scripts/backfill-cl.ts 6    # fetch ~6 pages of real dockets (needs the token)

# 6. Start the dev server
bun run dev            # or: npm run dev
```

Open <http://localhost:3000>.

### Demo accounts

| Role | Email | Password |
| --- | --- | --- |
| Admin (CRUD + sync) | `admin@patentpulse.demo` | `Admin123!` |
| Analyst (watchlist) | `demo@patentpulse.demo` | `Demo123!` |

### Useful scripts

```bash
bun run db:push       # apply prisma/schema.prisma to SQLite
bun run db:seed       # regenerate the synthetic dataset
bun run db:reset      # reset + re-apply
bun run lint          # eslint
```

---

## REST API

All endpoints are relative to the app root. Session auth uses the `pp_session` httpOnly cookie;
admin writes require `role=ADMIN`; `/api/sync` also accepts an `x-cron-key` header.

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/api/auth/register` | Create account `{email, password, name?}` |
| POST | `/api/auth/login` | Sign in `{email, password}` |
| POST | `/api/auth/logout` | Sign out |
| GET | `/api/auth/me` | Current user |
| GET | `/api/cases` | List/search cases — `q, jurisdiction, court, status, tech, party, from, to, sort, page, pageSize`; returns rows + pagination + filter facets |
| POST | `/api/cases` | **(admin)** Create case (parties/patents auto-created from names/numbers) |
| GET | `/api/cases/:id` | Case detail: parties, counsel, patents, timeline, related cases, watch state |
| PUT | `/api/cases/:id` | **(admin)** Update fields (status changes logged as docket events) |
| DELETE | `/api/cases/:id` | **(admin)** Delete case (cascades) |
| GET | `/api/patents` | Patents ranked by assertion count — `q, tech, sort, page` |
| GET | `/api/patents/:id` | Patent detail + assertion history |
| GET | `/api/parties` | Companies — `q, type, sort, page` with plaintiff/defendant splits |
| GET | `/api/parties/:slug` | Company profile: stats, recent cases, top opponents, counsel, portfolio |
| GET | `/api/law-firms` | Firm analytics incl. 10-month EPO opposition trend |
| GET | `/api/stats` | Overview KPIs — `jurisdiction?` |
| GET | `/api/stats/trends` | Chart series — `jurisdiction?, months?` |
| GET | `/api/feed` | Live activity feed (filings + events), triggers scheduled sync |
| GET | `/api/news` | News — `category?, limit?` |
| GET | `/api/sources` | Data-source registry + live health for the sync pipeline |
| GET/POST/DELETE | `/api/watchlist` | User watchlist (auth required) |
| GET/POST | `/api/sync` | Sync logs / run refresh (admin or `x-cron-key`) |
| GET | `/api/health` | Liveness + DB check |

Try it:

```bash
curl "http://localhost:3000/api/cases?jurisdiction=UPC&status=Active&pageSize=5"
curl -X POST "http://localhost:3000/api/sync" -H "x-cron-key: $SYNC_CRON_KEY"
```

---

## Deploy to Vercel

The repo is Vercel-ready with a **build-time database bootstrap**:

1. Import the repo at <https://vercel.com/new> — **name the project `litpulse`** (the framework
   auto-detects Next.js; Bun is used because `bun.lock` is present).
2. Set the environment variable `COURTLISTENER_TOKEN` (free token from
   <https://www.courtlistener.com/profile/>) so the build can bake real dockets into the snapshot.
   `DATABASE_URL` can stay unset — the build script defaults it to `file:./db/custom.db`.
3. Deploy. The `vercel:build` script runs `prisma generate` → `prisma db push` → seed → CourtListener
   backfill → `next build`, and `outputFileTracingIncludes` bundles the resulting SQLite snapshot plus
   the Prisma engine into the serverless functions.

The Vercel deployment is **read-only by design** (embedded SQLite snapshot): every page, search and
chart works; sign-in, watchlists and sync writes return a friendly 503 because serverless disks are
ephemeral. For a writable deployment, point `DATABASE_URL` at any hosted database (Turso, Neon,
Supabase…) — everything else stays the same. The daily cron in `vercel.json` is a no-op on read-only
deploys; run the sync locally or from any always-on host instead.

---

## Keep-alive & external pings (optional)

The engine is continuous by itself: on a long-running server (local, Docker, VPS) its in-process
loop polls the change cursor 24/7. On serverless, `vercel.json` schedules a daily keep-warm tick
(`GET /api/sync/pulse` at 03:00 UTC) — between visits the traffic-driven nudges and SSE
connections carry the continuous cadence.

**Self-hosted keep-alive / external trigger** — add a crontab entry if you want one anyway:

```cron
* * * * * curl -fsS http://localhost:3000/api/sync/pulse >/dev/null
```

Force an immediate full check (admin):

```bash
curl -X POST http://localhost:3000/api/sync -H "x-cron-key: change-me"
```

---

## Project structure

```
prisma/
  schema.prisma        # User, Session, Case, Party, CaseParty, Patent, CasePatent,
                       # LawFirm, CaseLawFirm, CaseEvent, NewsItem, WatchlistItem, SyncLog
  seed.ts              # synthetic data generator (deterministic PRNG)
src/
  app/
    api/               # REST endpoints (auth, cases, patents, parties, law-firms,
                       # stats, feed, news, sources, watchlist, sync, health)
    layout.tsx         # root layout + theme provider + toaster
    page.tsx           # mounts the app shell (single route)
    globals.css        # Tailwind + the three-palette theme system (Oxford / Midnight / Verde)
  components/app/      # hash router, auth context, app shell + all views
  lib/
    api-guard.ts       # rate limiting, zod query validation, cache headers, write guards
    auth.ts            # session cookie auth helpers
    cache.ts           # in-memory TTL cache with stampede protection
    caseService.ts     # shared case query/serialization logic
    constants.ts       # jurisdictions, statuses, theme-aware colors
    db.ts              # Prisma client singleton (+ serverless-safe SQLite path resolution)
    password.ts        # scrypt hash/verify
    sources/index.ts   # upstream adapters: CourtListener RECAP, USPTO PTAB, PatentsView
    sync.ts            # multi-source live data-refresh engine + backfill + fallback chain
scripts/
  backfill-cl.ts       # one-shot CourtListener historical backfill
.env.example
vercel.json            # build-time DB bootstrap + daily cron for the sync endpoint
```

## Data model highlights

- **Case** — docket number, title, jurisdiction (6 forums), court, judge, status, cause, tech area,
  damages, filing/closed dates, provenance (`courtlistener | uspto-ptab | seed | synthetic | manual`)
- **Party / CaseParty** — NPEs, operating companies, universities; roles adapt per forum
  (PLAINTIFF/DEFENDANT, PETITIONER/RESPONDENT, OPPONENT/PROPRIETOR)
- **Patent / CasePatent** — US & EP formats, assertion counts derived across cases
- **CaseEvent** — full docket timeline (filing → answer → Markman → trial → verdict/settlement…)
- **SyncLog** — audit trail of every pipeline run

## License

MIT — see [LICENSE](./LICENSE).
