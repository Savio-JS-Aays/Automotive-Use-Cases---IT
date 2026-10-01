# Module — Change Impact (DORA)

- **Route:** `/change-impact` (`?service=`, `?day=YYYY-MM-DD`, `?failed=1`, `?incident=`)
- **Code:** `src/modules/change/ChangeModule.jsx`
- **Data:** `it_chg_overview`, `it_chg_deployments`, `it_ops_incident_detail` (migration 007). Deployments are global; the change-incident share follows the Region filter.

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

## Visuals

| Visual | Detail |
|---|---|
| Deployment calendar | weekday × week heatmap of deployments per day (blue ordinal ramp; dashed cells are outside the window); tooltip shows failures and caused incidents; select a day to filter the table |
| CFR by type | Code / Config / Infra bars with the target line; bars above target highlighted |
| CFR by service | same; select a bar to focus the page on that service |
| Deployments table | time, service, type, status (failed → rolled back / fixed forward), PRs, lead time, caused incidents as chips → incident drawer; "Failed only" toggle |

## Story in the data

Dealer Portal (SRV002) ran a release wave in Aug-2026 (34 deployments, CFR 23.5%, availability 97.95% that month); September is back to 8%. Portfolio code lead time fell from ~64 h to ~35 h over the history.
