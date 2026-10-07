# Module — Change Impact (DORA)

- **Route:** `/change-impact` (`?service=`, `?from=` / `?to=` YYYY-MM-DD, `?type=`, `?failed=1`, `?incident=`; the old `?day=` still works as from = to)
- **Code:** `src/modules/change/ChangeModule.jsx`
- **Data:** `it_chg_overview` (KPIs, calendar), `it_chg_deployments` (fetched once per window with `p_limit` 2000 — ≤ ~270 rows at 90 days — and filtered/aggregated in the browser for the CFR chart, the weekly trend and the table), `it_ops_incident_detail` (migration 007). Deployments are global; the change-incident share follows the Region filter.

## How change and incidents are linked

`fact_deployments` now has `deploy_time`, `status` (Success/Failed), `lead_time_hours` and `rollback_of`. Every incident with root cause *Change* is linked to the failed deployment that caused it in `it_bridge_change_incident` (with a confidence score). Rollbacks are deployments of type *Rollback* pointing at the failed one.

## KPIs (Δ vs the prior window)

| KPI | Formula |
|---|---|
| Deployment Frequency | deployments (excl. rollbacks) ÷ days |
| Change Failure Rate | failed ÷ deployments (target ≤ 15%, `it_config.cfr_target`) |
| Failed Deploy Recovery | median(rollback time, else latest resolution of the caused incidents − deploy time), failed deployments |
| Lead Time for Changes | median `lead_time_hours` of Code deployments |
| Rollback Rate | rollbacks ÷ deployments |
| Change-Induced Incidents | incidents with root cause Change ÷ incidents |

## Visuals (reworked 2026-10-07)

| Visual | Detail |
|---|---|
| Deployment calendar | GitHub-style grid: one column per week (Mon start, month shown in the header), one row per weekday. Each day is a rounded square with its deployment count (rollbacks excluded) on a neutral → blue ramp (none, 1, 2–3, 4–5, 6+); a red dot marks a day with a failed deployment; dashed = outside the window. Summary line (deployments, failed, incidents caused, busiest weekday), per-weekday totals as small bars on the right, week totals underneath, and a hover/focus detail line. Click a day → table filtered to that day (click again to clear). |
| Change failure rate by service and type | Replaces the two separate CFR-by-type and CFR-by-service charts. One horizontal bar per service plus an *All services* row, sorted by CFR, target line at 15%. **All types:** bars stacked by change type (Code / Config / Infra), segment = failed of that type ÷ all the service's deployments, so segments add up to the service CFR. **One type:** that type's own CFR per service. Value + failed/deployments on the right axis; tooltip breaks down each type. Bar → focus the page on that service. |
| Deployments per week (per day for ≤ 14-day windows) | Stacked columns: successful vs failed (rollbacks in the tooltip, with the period's CFR). Shows release waves (Aug-2026 Dealer Portal) and whether failures rise with volume. Bar → table filtered to that week. |
| Deployments table | Filters: **From / To date** (bounded by the window), **Type** (Code, Config, Infra, Rollback), Failed only, Clear filters; "n of N" count; CSV export of the filtered rows. Columns: time, service, type (colour dot matches the CFR chart), status (failed → rolled back / fixed forward), PRs, lead time, caused incidents as chips → incident drawer. |

## Story in the data

Dealer Portal (SRV002) ran a release wave in Aug-2026 (34 deployments, CFR 23.5%, availability 97.95% that month); September is back to 8%. Portfolio code lead time fell from ~64 h to ~35 h over the history.
