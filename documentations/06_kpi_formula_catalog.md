# 06 — KPI and Chart Formula Catalogue

Every number on screen after the 2026-10-01 redesign. All values are computed in Postgres RPCs (migrations 003 and 007). Windows are `[as_of − days + 1, as_of]`, with as_of = 2026-09-30 (`it_config`); "prior" = the previous window of the same length. Module docs have the detail: [modules/](modules/).

The pre-redesign catalogue (hash-named apps, random Security/Licensing data, unbounded windows) is preserved in [07_known_issues.md](07_known_issues.md) and the code under `legacy/`.

## Shared definitions

| Term | Formula |
|---|---|
| Availability | Σ uptime_minutes ÷ (days × 1440), from `fact_app_metrics` (service × day) |
| Downtime (per day) | derived in the seed from incident minutes: P1 × 0.60, P2 × 0.15 (P3/P4 = degraded, not down) |
| Allowed downtime | (1 − SLO) × days × 1440 per service |
| Error budget remaining | 1 − downtime ÷ allowed (negative = overspent; "N× used" = 1 − remaining) |
| Burn rate (7 d) | (last-7-day downtime ÷ 7-day minutes) ÷ (1 − SLO); 1 = exactly on budget |
| MTTD / MTTA / MTTR | medians of detected − impact start / acknowledged − opened / resolved − opened |
| Change failure rate | failed deployments ÷ deployments (excl. rollbacks) |
| Alert noise | alerts with no incident ÷ alerts |
| Patch SLA | Critical 15 d, High 30, Medium 60, Low 90 from discovery |

## KPIs by module

| Module | KPI | Formula | Source |
|---|---|---|---|
| Overview | Scorecard ×5 | Reliability = % services meeting SLO · Change = 100 × (1 − CFR) · Security = patch-SLA compliance · Cost = licence utilisation · Data = min(pipeline success, telemetry completeness) | `it_ops_overview` |
| Overview | SLO Attainment | services with availability ≥ SLO ÷ services | `it_ops_service_stats` |
| Overview | Error Budget Remaining | portfolio 1 − Σ downtime ÷ Σ allowed | same |
| Overview | P1 Incidents / Open Incidents | counts (region filter) | `fact_incidents` |
| Overview | Median Time to Resolve | median MTTR, resolved incidents opened in window | `fact_incidents` |
| Overview | Cost of Downtime | Σ downtime min × `cost_of_downtime_inr_per_min` | `it_dim_service` |
| Overview | Licence ACV / Shelfware | from `it_lic_kpis` | licensing tables |
| Reliability | Availability, Error Budget, 7-d Burn, MTTA, MTTR, Alert Noise, Cost of Downtime, p95 breach days, Incidents | as defined above; p95 breach = service-days with daily p95 > `slo_latency_p95_ms` | `it_rel_overview` |
| Change | Deployment Frequency | deployments ÷ days | `it_chg_overview` |
| Change | Change Failure Rate | failed ÷ deployments (target 15%) | same |
| Change | Failed Deploy Recovery | median(rollback time, else caused-incident resolution − deploy time) | same + bridge |
| Change | Lead Time | median `lead_time_hours`, Code changes | same |
| Change | Rollback Rate / Change-Induced Incidents | rollbacks ÷ deployments / Change incidents ÷ incidents | same |
| Security | Open Critical, Past Patch SLA, Patch SLA Compliance | counts; patched on time ÷ patched in window | `it_sec_overview` |
| Security | Security Incidents, MTTD, MTTC | counts; medians | `it_fact_security_incident` |
| Security | Phishing Click Rate | clicked ÷ sent, latest monthly campaign | `it_fact_phishing_sim` |
| Security | Threats Blocked | Σ blocked; block rate = blocked ÷ detected | `it_fact_threat_daily` |
| Licensing | ~45 KPIs across 6 pages (spend and forecast, utilisation and shelfware, renewals and uplift, vendors, document compliance, invoices) | see [modules/licensing-and-subs.md](modules/licensing-and-subs.md) | `it_lic_kpis_ext` and the `it_lic_*` RPCs |

## Charts and drill-downs

| Module | Visual | Drill-down |
|---|---|---|
| Overview | Service × day availability heatmap · Top risks list | cell → that day's incidents → incident drawer; risk → owning module, pre-filtered |
| Reliability | SLO table · daily availability · daily p95 · resolve time by priority (box + median + target) · alert → incident funnel · incidents table | row → service focus; incident → drawer (lifecycle, alerts, causing deployment) |
| Change | Deployment calendar (weekday × week) · CFR by type · CFR by service · deployments table | day → table filter; service bar → focus; caused incident chip → drawer |
| Security | 5 × 5 risk matrix · register · vulnerability ageing (stacked by age) · by asset class · threat small multiples · phishing trend · incidents by vector · open-vulnerability table | matrix cell → register filter |
| Licensing | see module doc; product drawer now has a **Risk** tab (services, incidents, open vulnerabilities of that product via `it_lic_product_risk`) | |

All charts: one y-axis, validated palette (`src/lib/chartTheme.js`), status colours always with a label or icon, CSV export on the main tables.
