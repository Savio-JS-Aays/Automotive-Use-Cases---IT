# 07 — Known Issues

Ranked by how much each one damages the demo. "Fix class" says where the fix lives: **Code**, **Data** (IT-owned, regenerate freely) or **Schema** (new `it_` objects).

## Status after the redesign (2026-10-01)

The table below is the baseline found on 2026-10-01. Status of each item after Licensing (migrations 001–003) and the roadmap implementation (004–007):

| Status | Issues |
|---|---|
| **Fixed** | 1 (fixed as-of date, bounded windows, no future rows) · 2 (Security and Licensing on real tables) · 3 (`it_dim_service` / `it_dim_software`; `fact_app_metrics` no longer uses `dim_application`) · 4 (consistent lifecycle, checked by constraints) · 5 (region on incidents, sites, security; options from `dim_region`) · 7 (`it_bridge_change_incident`, DORA) · 8 (stories in the data) · 9 (`api_requests` independent of transactions) · 10 (cost per minute per service) · 11, 12 (superseded: the Sites & OT and Data & Integration modules were dropped; alerts are used, batch jobs / network events / data quality are left as found) · 13 (one metric row per service-day) · 14 (RLS read-only, anon writes revoked) · 15 (Model filter and dead Asset View removed) · 16–20 (old charts replaced) · 22 (module maths in Postgres RPCs) · 23–24, 26–27 (old modules moved to `legacy/`) · 29 (browser title) |
| **Withdrawn** | 6 (index.css was never empty) |
| **Still open** | 21 partly (dates are computed in SQL; chart labels parse ISO dates in the browser's timezone, fine in IST) · 25 (`start` script still references react-scripts) · 28 (`schema.sql` dump is stale; re-dump after applying 001–007) · 30 (no tests, no git) |
| **New limitations** | `fact_data_quality` keeps its original random data (telematics-adjacent, not regenerated) · service metrics, deployments and pipelines have no region, so the Region filter does not change them (stated on each page) · network history starts Apr-2026 · on phones the module nav scrolls sideways |

## Critical

| # | Issue | Where | Fix class |
|---|---|---|---|
| 1 | Date window has no upper bound. Seed data runs to 2026-12-31, so "Last 7 Days" counts 194 future-dated incidents out of 213 and 230 future metric rows out of 247 | every live module (`>= windowStart` only) | Code (add `<= asOf`) + Data (end at an as-of date) |
| 2 | Security page is 100% mock and **re-randomises on every filter change**. *(Licensing: fixed 2026-10-01, now on `it_` tables.)* | Security.jsx | Schema + Data + Code |
| 3 | `dim_application` is a vehicle duty-cycle table shared with Telematics, so IT software names are invented by hashing IDs, with different label lists per page | EO, AR | Schema (`it_dim_application`/`it_dim_service`) |
| 4 | Incident data is self-contradictory: 43% resolve before they open; `mttr_minutes` disagrees with timestamps; Active incidents have resolution times | fact_incidents | Data |
| 5 | Region filter is broken: no-op in most modules, and wipes all incidents on Executive Overview | all modules | Schema (link IT facts to region) + Code |
| 6 | ~~`src/index.css` is empty~~. **Withdrawn:** the file contains `@import "tailwindcss";`; the original check misread `wc -l`. | — | — |

## High

| # | Issue | Where | Fix class |
|---|---|---|---|
| 7 | No relation between deployments and incidents; Change Impact can't show causality, and there is no change-failure rate | fact_deployments | Schema + Data |
| 8 | Uniform random data: every app, BU, cause and priority is ~equal, so there is no story or outlier | all IT facts | Data |
| 9 | API Reliability ≡ 100 − Error Rate (`api_requests` = `total_transactions`) | fact_app_metrics, AR | Data |
| 10 | Financial risk weights are hash-derived and nearly identical (≈ 12,44x/min for all apps), shown in USD | AR | Schema (cost-of-downtime per app) |
| 11 | IT-to-OT module unrouted; its zones and Purdue layers are fabricated by `index % 4`; every layer always reads "Degraded" | ITtoOTHealth.jsx | Code + use fact_network_events |
| 12 | Four IT tables unused (alerts, batch jobs, network events, data quality) | — | Design |
| 13 | Duplicate and missing app-days; health averages rows, not days | fact_app_metrics | Data |
| 14 | RLS disabled and `GRANT ALL` to anon on IT tables, so the public key can modify data | DB | Schema (RLS, revoke writes) |

## Medium

| # | Issue | Where |
|---|---|---|
| 15 | Model filter has no options; Asset View unreachable (`selectAsset` never called). *(Region options now load all 5 regions from `dim_region`.)* | DashboardLayout, store |
| 16 | EO trend fixed at 30 days while KPIs follow the filter | EO |
| 17 | "Highest Failure Rates" plots counts | EO |
| 18 | P3/P4 shown as "P2 High" in Change Impact Matrix; 90-day matrix unreadable | CI |
| 19 | Finance/HR verticals have no colour in CI stacked bar; Aftersales/Corporate legend entries are empty | CI |
| 20 | Days with no data plot as 0% error (should be gaps) | AR |
| 21 | UTC day keys vs IST-naive timestamps can shift events by a day | dateUtils |
| 22 | All aggregation runs in the browser over full-table downloads; Warranty moved to RPCs because of the 3 s anon timeout | all |

## Low / hygiene

| # | Issue |
|---|---|
| 23 | `Hint`/`ModuleCard` copy-pasted into 4 modules; `getOemAppDetails` duplicated |
| 24 | `config.js` APP_ID constants are unused and wrong (APP001 is "E-Commerce & FMCG Distribution", not "Customer Portal") |
| 25 | `mockData.js`, `App.css` unused; `start` script references react-scripts |
| 26 | `apps` fetched but unused in EO and OT |
| 27 | `Array.prototype.sort` mutates memoised arrays (LS, SE) |
| 28 | `schema.sql` stale (missing Warranty/Telematics objects added since) |
| 29 | Browser title is "enterprise-dashboard"; header says "Fleet Command" (Telematics app is "Fleet Pulse") |
| 30 | No tests; not a git repository |
