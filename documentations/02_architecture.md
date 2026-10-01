# 02 — Technical Architecture (after the 2026-10-01 redesign)

The baseline architecture (browser-side aggregation over full-table downloads, unbounded date windows, hash-named apps) is described in [07_known_issues.md](07_known_issues.md); its code is kept under `legacy/`.

## Data flow

```
Browser ── supabase-js (publishable key) ──▶ PostgREST ──▶ Postgres public schema (shared with other verticals)
   │
   ├─ hooks/useItFilters()       global sidebar filters → { days, region } (+ module keys like service)
   ├─ hooks/useRpc(name, args)   calls lib/rpc.js; re-calls when args change (by value); keeps last data while loading
   ├─ lib/rpc.js                 supabase.rpc + 5-minute de-dup cache; BackendMissingError when a function is missing
   └─ Postgres it_* functions    ALL aggregation in SQL (SECURITY INVOKER, read-only RLS); each returns one jsonb
```

- Each module makes 1–3 RPC calls. Locally, every function returns in 1–130 ms, well inside the anon role's 3 s timeout.
- **As-of date:** `it_config.as_of_date = 2026-09-30` (ops) and `it_license_config` (licensing). Nothing uses the browser clock for data windows.
- **Windows:** `it_ops_window(p_filters)` turns `{days}` into `[as_of − days + 1, as_of]` plus the same-length prior window used for deltas.
- **Drill-down state lives in the URL** (`hooks/useUrlParam.js`: `useUrlParam`, `usePatchUrlParams`), so every drawer and filter view is linkable and survives reloads.
- Small lookups still use `lib/fetchAllRows.js` / `hooks/useRawTables.js` (regions for the sidebar, vendor/software options in Licensing).

## Routing (`src/App.jsx`)

| Path | Component | URL params |
|---|---|---|
| `/executive-overview` (default) | `overview/OverviewModule` | `cell`, `incident` |
| `/app-reliability` | `reliability/ReliabilityModule` | `service`, `incident` |
| `/change-impact` | `change/ChangeModule` | `service`, `day`, `failed`, `incident` |
| `/security` | `security/SecurityModule` | `risk` |
| `/licensing-subs`, `/spend`, `/usage`, `/renewals`, `/vendors`, `/documents` | `licensing/LicensingLayout` + `pages/*` | `vertical`, `vendor`, `category`, `sw`, `tab`, `contract`, `vendor_id`, `docs`, `month`, `dept` |

## Global filters (`store/useGlobalStore.js`)

| Key | Default | Applied to |
|---|---|---|
| `dateRange` | `Last 30 Days` (7 / 30 / 90) | every ops module; hidden on Licensing (fiscal year) |
| `regionId` | `All` + 5 regions from `dim_region` | incidents (Overview, Reliability, Change share), security incidents, OT/network vulnerabilities, licensing seats/spend. Service metrics, deployments and pipelines are global; each page says so. |

The old Model filter and Asset View were removed (nothing used them).

## Shared components (`src/components/`)

| Component | Purpose |
|---|---|
| `DashboardLayout` | dark top nav (scrolls sideways on phones), filter sidebar (stacks on top on phones) |
| `Panel`, `PageHeader` | card with title, help tooltip, actions; page title with the window and comparison text |
| `KpiCard` | value + optional `sub`, `delta` / `deltaTone`, `spark` (sparkline), `onClick` |
| `Sparkline` | tiny SVG trend (decorative; the tile states the value) |
| `StatusBadge`, `PriorityBadge` | status always with icon + text |
| `Heatmap` | rows × columns grid of buttons with tooltips and legend (availability heatmap, deployment calendar) |
| `Funnel` | ordinal funnel bars |
| `Drawer` | accessible slide-over (Esc, focus trap, returns focus, full-screen on phones) |
| `IncidentDrawer`, `IncidentsTable` | incident lifecycle / alerts / causing deployment; incident list with CSV export |
| `LoadError` | set-up guidance when migrations are missing |
| `ChartCard`, `ToolTip` | used by Licensing |

## Libraries (`src/lib/`)

`rpc.js` (cache, errors) · `format.js` (₹ K/L/Cr, %, dates) · `chartTheme.js` (validated dataviz palette, status colours, availability ramp, axis/tooltip styles) · `csv.js` · `dateUtils.js` (`rangeToDays`) · `supabaseClient.js` · `fetchAllRows.js`.

## Chart rules

One y-axis per chart (no dual axes); categorical colours in fixed order (≤ 3 in scatter/small multiples); sequential ramps for magnitude (availability, deployments, vulnerability age); status colours reserved and paired with labels; legends whenever there are 2+ series; hover tooltips everywhere.

## Security posture

All IT-owned tables (`fact_*` IT facts and every `it_*` table) have RLS with a read-only policy, and INSERT/UPDATE/DELETE/TRUNCATE are revoked from `anon` and `authenticated` (migrations 001, 004, 006). Default privileges still grant ALL on new tables, so every future `it_` migration must repeat this.
