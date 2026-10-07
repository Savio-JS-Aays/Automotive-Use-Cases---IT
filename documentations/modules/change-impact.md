# Module — Deployments (formerly Change Impact, DORA)

- **Route:** `/deployments` (renamed 2026-10-07; `/change-impact` redirects and keeps its query string). URL: `?from=`, `?to=` (YYYY-MM-DD), `?outcome=`, `?dep=` (deployment drawer), `?incident=`. Incoming `?service=` / `?ctype=` (or legacy `?type=`) are copied into the sidebar filters and removed from the URL.
- **Code:** `src/modules/change/ChangeModule.jsx`
- **Data:** `it_chg_overview` (KPIs, calendar), `it_chg_deployments` (fetched once per window with `p_limit` 2000 — ≤ ~270 rows at 90 days — and filtered/aggregated in the browser for the CFR chart, the weekly trend and the table), `it_ops_incident_detail` (migration 007). Deployments are global; the change-incident share follows the Region filter.

## How change and incidents are linked

`fact_deployments` now has `deploy_time`, `status` (Success/Failed), `lead_time_hours` and `rollback_of`. Every incident with root cause *Change* is linked to the failed deployment that caused it in `it_bridge_change_incident` (with a confidence score). Rollbacks are deployments of type *Rollback* pointing at the failed one.

## Layout (2026-10-07): KPI cards, then two tabs (`?tab=`)

| Tab | Contents |
|---|---|
| **Release performance** (default) | Change failure rate · Deployments per week · Lead time for changes · Rollback or fix forward |
| **Calendar & log** (`?tab=log`) | Deployment calendar · Deployments table |

Anything that filters the table (the failure / recovery / rollback / change-induced KPI cards, a Deployments-per-week bar) switches to **Calendar & log** and scrolls to the table. The deployment drawer (`?dep=`) opens over either tab, e.g. from a Rollback-or-fix-forward bar.

## Page filters (redesign 2026-10-07)

**Service** and **Change Type** are **global sidebar filters** (store `deployService`, `changeType`; shown only on this page) and drive **every KPI card, chart and the table**. The Change failure rate bars set them. Region applies only to the change-induced incident share (deployments have no region).

## KPIs (computed in the browser: `changeData.js → kpisFor`)

Rows: `it_chg_deployments({days × 2})` + `it_ops_incidents({days × 2})` (no region; filtered in the browser), split by date into current and prior windows. With no filters they equal `it_chg_overview.kpis` exactly (2.97/day · 5.6% · 1.57 h · 36.5 h · 3.4% · 10.4%, checked 2026-10-07). `it_chg_overview` is still read for the window and the CFR target.

| KPI | Formula | Click |
|---|---|---|
| Deployment Frequency | deployments (excl. rollbacks) ÷ days | — |
| Change Failure Rate | failed ÷ deployments; sub shows failed count + target 15% | table → outcome Failed |
| Failed Deploy Recovery | median(rollback time, else last caused incident resolved − deploy time) | table → Failed |
| Lead Time · Code | median `lead_time_hours` of Code (or of the selected Change type) | — |
| Rollback Rate | rollbacks (of in-scope deployments) ÷ deployments; sub: rolled back vs fixed forward | table → Rolled back |
| Change-Induced Incidents | incidents with root cause Change (of the selected type) ÷ incidents (Region + Service) | table → Caused an incident |

## Visuals

| Visual | Detail |
|---|---|
| **Change failure rate** (`FailureRateChart.jsx`) | One simple bar per service **or** per change type (toggle): failed ÷ deployments, blue, **red when above the 15% target** (dashed line). Right column: "13% · 2 of 16". Sort (rate / failures / volume / name), "Only with failures". A bar sets the page Service or Change type filter. Replaces the stacked by-service-and-type chart. |
| **Deployments per day / week** (`DeploymentTrend.jsx`) | Period toggle (day / week; auto by window), **Colour by Outcome** (Successful · Failed rolled back · Failed fixed forward) or **Change type**. Summary: average per period, busiest period. A bar filters the table to that period. |
| **Lead time for changes** (`LeadTimeChart.jsx`) | **Distribution** (deployments per lead-time band: < 8 h, 8–24 h, 1–2 d, 2–4 d, 4+ d, stacked by type) or **Trend** (median per week in the window / per month over 12 months, one line per type). **Range: This window / Last 12 months** (loads `it_chg_deployments({days: 365})`, about 0.4 s). Summary: median per type; with 12 months, Code first → last month (81.9 h Oct 2025 → 36.5 h Sep 2026). |
| **Rollback or fix forward** (`RecoveryChart.jsx`) | Tiles: failed releases (and how many caused an incident), rolled back n·% with median recovery, fixed forward n·% with median recovery, plus "rolling back restored service about N× faster". **This window:** one bar per failed deployment, length = hours to recover, colour = approach (same colours as the outcome stack); click → deployment drawer. **Last 12 months:** failures per month stacked by approach (tooltip medians). Live: window 3 rolled back (64 min) vs 2 fixed forward (8.8 h); 12 months 48 (87 min) vs 39 (10.1 h). Shares the Range toggle with Lead time. |
| **Deployment calendar** (`ReleaseCalendar.jsx`) | Replaces the GitHub-style grid with a **wall calendar**: a month card per month, Mon–Sun columns, each day shows the date, "**n deps**" and "**n failed**" in words (red edge), light-blue tint by volume. Summary tiles: deployments on n of N days, busiest day, days with a failure, weekend deployments. "Show: All deployments / Failures only". A day filters the table. |
| **Deployments table** | Filters: From / To, **Outcome** (All, Successful, Failed, Failed · rolled back, Failed · fixed forward, Caused an incident), **Search** (DEP / service / INC). CSV export. **Deployment ID → Deployment drawer**; incident chips → incident drawer. |
| **Deployment drawer** (`DeploymentDrawer.jsx`, `?dep=`) | Outcome chip; facts: PRs, lead time vs that type's median, time to recover, the service's availability that day (`it_rel_daily`); **"What happened"** timeline (deployed → rollback → incidents opened/resolved, each "+x after deploy"); incidents caused (→ incident drawer); rollback ↔ original links; other deployments to the same service within ±3 days (→ their drawer). No DB change needed. |

## Story in the data

Dealer Portal (SRV002) ran a release wave in Aug-2026 (34 deployments, CFR 23.5%, availability 97.95% that month); September is back to 8%. Portfolio code lead time fell from ~64 h to ~35 h over the history.
