# 01 — Project Overview

## Purpose

An IT operations dashboard for a commercial-vehicle OEM (BharatBenz-style, India, INR context). It is one of several vertical demos (IT, Telematics, Warranty, plus Sales/Logistics/Service-desk data) that share one Supabase database. The IT app tells a CIO-level story:

- Are our core systems up and fast? (Executive Overview, App Reliability)
- What does the software estate cost, how much is wasted, what renews when, and are the contracts documented? (Licensing & Subscriptions — the centre of the app)
- Are we under attack? (Security)
- Are our own changes breaking things? (Change Impact)

Brand shown in the header: **Fleet Command**. Browser title: `enterprise-dashboard` (Vite default).

## Stack

| Layer | Choice | Version (package.json) |
|---|---|---|
| UI | React | 19.2 |
| Build / dev server | Vite (`@vitejs/plugin-react`) | 8.3, dev port **3000** |
| Routing | react-router-dom | 7.18 |
| Charts | Recharts | 3.10 |
| State | Zustand | 5.0 |
| Icons | lucide-react | 1.48 |
| Styling | Tailwind CSS 4 via `@tailwindcss/postcss` | 4.3 (`src/index.css` = `@import "tailwindcss";`) |
| Data | `@supabase/supabase-js`, anon/publishable key, client-side only | 2.117 |
| Lint | oxlint | 1.81 |

No TypeScript, no tests, no backend, not a git repository.

## Running

```bash
cd enterprise-dashboard
npm install
npm run dev      # http://localhost:3000
npm run build    # dist/
npm run lint     # oxlint
```

`.env` must define `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (never print or commit the values). The `start` script (`react-scripts start`) is dead: react-scripts is not installed.

## Folder layout

```
enterprise-dashboard/
  schema.sql                 pg_dump of the shared public schema (stale until re-dumped after migrations 001–010)
  index.html, vite.config.js, tailwind.config.js, postcss.config.js, .oxlintrc.json
  src/
    main.jsx, App.jsx        entry + routes (see 02)
    components/              layout, Panel, KpiCard, Sparkline, Heatmap, Funnel, Drawer, IncidentDrawer, IncidentsTable, badges
    hooks/                   useRpc, useItFilters, useUrlParam, useRawTables
    lib/                     rpc, format, chartTheme, csv, dateUtils, supabaseClient, fetchAllRows
    store/useGlobalStore.js  dateRange, regionId
    modules/                 overview/ reliability/ change/ security/ licensing/ (suite: pages/ drawers/ charts/ tables/)
  public/contracts/          synthetic contract PDFs (77)
  scripts/                   contract PDF generator + manifest
  legacy/                    pre-redesign modules (not built; safe to delete once accepted)
  documentations/            this folder
```

## Module status (2026-10-01)

| Module | Route | Data | Doc |
|---|---|---|---|
| Executive Overview | `/executive-overview` | `it_ops_overview` | [modules/executive-overview.md](modules/executive-overview.md) |
| App Reliability | `/app-reliability` | `it_rel_*`, `it_ops_*` | [modules/app-reliability.md](modules/app-reliability.md) |
| Change Impact | `/change-impact` | `it_chg_*` | [modules/change-impact.md](modules/change-impact.md) |
| Security | `/security` | `it_sec_*` | [modules/security.md](modules/security.md) |
| Licensing & Subscriptions (6 pages) | `/licensing-subs/*` | `it_lic_*` | [modules/licensing-and-subs.md](modules/licensing-and-subs.md) |

All five read live data from IT-owned tables through Postgres RPCs. **The database side (migrations 001–010) must be applied to the shared Supabase before the pages show data**; until then each page shows set-up guidance.
