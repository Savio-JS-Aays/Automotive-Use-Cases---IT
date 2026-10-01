# 05 — Data Profile (IT tables)

> This is the profile of the **original** data, kept as the baseline. Migration 005 replaces these rows with consistent, regenerated data (see [03 §8](03_database_schema.md) and the module docs for the new figures). Defects D1–D9 and D12 no longer apply after 005; D10–D11 are solved by `it_dim_service` and the planted stories. `fact_data_quality` keeps its original data.

Profiled 2026-10-01 via the REST API with the publishable key (read-only). All tables were downloaded in full.

## Row counts and date coverage

| Table | Rows | Date range | Rows after 2026-10-01 (future) |
|---|---|---|---|
| dim_application | 8 | — | — |
| fact_app_metrics | 5,000 | 2025-01-01 → 2026-12-31 | 621 |
| fact_incidents | 1,500 | 2025-01-01 → 2026-12-31 | 194 |
| fact_alerts | 6,000 | 2025-01-01 → 2026-12-31 | — |
| fact_deployments | 2,250 | 2025-01-01 → 2026-12-31 | — |
| fact_batch_jobs | 2,000 | 2025-01-02 → 2026-12-31 | — |
| fact_network_events | 5,000 | 2025-01-01 → 2026-12-31 | — |
| fact_data_quality | 730 | 2025-01-01 → 2026-12-31 (daily) | 91 |
| fact_sales_transaction | 5,566 | 2025-06-10 → 2026-09-23 | 0 |

In the 30 days before 2026-10-01 there are 198 metric rows, 67 incidents, 89 deployments and 240 alerts.

## Distributions

**fact_app_metrics** — per app: 604–652 rows. uptime_minutes 1380–1439 (mean 1409.8 → 97.9%). total_transactions 1,029–49,999 (mean 25,490). failed 1–2,468 (mean 651 → 2.55%). latency 15–350 ms (mean 183).

**fact_incidents** — priority 1/2/3/4 = 398/374/356/372. Status Resolved 1,266 / Active 234. BU: Logistics 312, Sales 309, Finance 302, HR 296, Manufacturing 281. Root cause: Software 318, External 302, Hardware 301, Change 297, Network 282. mttr_minutes 15–299 (mean 157). causal_confidence 50–99.

**fact_alerts** — severity Critical 1,541 / Low 1,508 / High 1,486 / Medium 1,465; 10 services ~600 each.

**fact_deployments** — Code 757 / Rollback 753 / Config 740; pr_count 1–4 uniform; ~225 per service.

**fact_batch_jobs** — Success 87.9% / Failed 7.8% / Running 4.4%; duration 5–179 min.

**fact_network_events** — Scanner 2,019, IoT Gateway 1,006, Switch 996, Edge Router 979; ping 5–250 ms uniform; disconnects 0–11 uniform.

**fact_data_quality** — expected 0.5M–5.0M packets/day; valid ≈ 96%.

## Data-quality defects (all IT-owned, so all fixable by regeneration)

| # | Defect | Measured | Effect on app |
|---|---|---|---|
| D1 | Incidents resolve before they open | 645 / 1,500 (43%); worst −21 h | MTTR from timestamps is understated and can go negative |
| D2 | `mttr_minutes` ≠ resolution − open | matches in 3 / 1,500 | Two "MTTR" truths. Last 90 days: 2.34 h (timestamps) vs 2.60 h (column) |
| D3 | `status='Active'` rows have a resolution_time | 234 / 234 | "Active" is meaningless; MTTR includes open incidents |
| D4 | `fact_app_metrics.timestamp` date ≠ `date_id` | 4,994 / 5,000 | Ambiguous event time |
| D5 | Duplicate app-days, missing app-days | 1,659 dupes; ~85% of app-days missing | Uptime averages per *row*, not per day; daily charts are sparse |
| D6 | `api_requests` ≡ `total_transactions`; failed ≡ total − successes | 5,000 / 5,000 | "API reliability" = 100 − "error rate"; two KPIs show the same thing |
| D7 | Data runs to 2026-12-31 | 621 metrics, 194 incidents in the future | "Last 7 Days" KPIs dominated by future rows (see 07 #1) |
| D8 | Alerts barely relate to their incident | same date 3/6,000; same service 616/6,000 | Alert → incident drill-down would look broken |
| D9 | No causal signal between deployments and Change incidents | 57% of Change incidents had a same-service deploy in prior 48 h vs 60% of non-Change | Change Impact can't show "changes cause outages" |
| D10 | Uniform random distributions everywhere | priorities, BUs, causes, severities all ~equal | No story: no worst app, no bad week, no hotspot |
| D11 | `dim_application.business_vertical` is nonsense for IT | "Tanker Transport" → HR | IT-OT "Manufacturing" filter never matches |
| D12 | `time_id` has impossible values | e.g. 1588, 1669 | Unusable as HHMM |

## What the app shows today (formulas replayed against live data, as of 2026-10-01)

| Window | Tier-1 metric rows (future) | IT Health Score | Incidents counted (future-dated) | MTTR (ts) | Error rate | Change-induced rate |
|---|---|---|---|---|---|---|
| Last 7 Days | 247 (230) | 97.74% | 213 (194) | 3.16 h | 2.61% | 16.6% |
| Last 30 Days | 300 (230) | 97.80% | 261 (194) | 2.78 h | 2.60% | 18.0% |
| Last 90 Days | 462 (230) | 97.80% | 384 (194) | 2.34 h | 2.58% | 17.5% |

Because the data is uniform noise, KPIs barely move between windows.
