# 09 — Redesign Roadmap (beyond Licensing)

**Status 2026-10-01: implemented** (migrations 004–007 and the six module pages; see the table at the end). Originally written as suggestions for the next brainstorming sessions. Licensing & Subscriptions is done ([modules/licensing-and-subs.md](modules/licensing-and-subs.md)); its patterns (as-of date, `it_` tables, `it_*` RPCs, `useRpc`, drawers, URL state, validated palette) carry over to everything below.

## Cross-cutting fixes (do first; every module benefits)

| # | Change | Why |
|---|---|---|
| 1 | **Fixed as-of date** for all IT data (reuse `it_license_config` or add `it_config`); bound every window `[as_of − N, as_of]` | Today "Last 7 Days" is 91% future-dated rows |
| 2 | **`it_dim_service`** (SRV001–010 → name, owning team, tier, `it_dim_software` link, site/region) | Services have no names, and IT facts have no region; this gives incidents, alerts and deployments a working region filter |
| 3 | **Point `fact_app_metrics` at `it_dim_software`** (IT-owned, so allowed) and stop hashing names | Removes the fake software names layered on vehicle duty cycles |
| 4 | **Regenerate IT-owned facts** consistently, with stories: resolution after open, `mttr_minutes` = timestamp diff, one metric row per app-day, alerts on their incident's date/service, deployments that cause some incidents | Every KPI is currently uniform noise |
| 5 | Move all module maths into `it_*` RPCs; extend KpiCard deltas/sparklines everywhere | 3 s anon timeout; consistent formulas |
| 6 | Wire RLS read-only and revoke anon writes on the existing IT facts | Public key can currently modify them |

## Module ideas

| Module | KPIs | Charts / matrices / tables | Drill-down |
|---|---|---|---|
| **Executive Overview** | IT scorecard (Reliability · Change · Security · Cost · Data), SLO attainment %, error budget remaining, P1 count vs prior period, licence ACV and shelfware (from Licensing) | Service × day **availability heatmap**; top-5 risks list; scorecard tiles linking to modules | Tile → module; heatmap cell → incidents that day |
| **App Reliability** | SLO attainment per service, error-budget burn rate, p95 latency (new column), MTTA / MTTR by priority, **alert noise ratio** (alerts ÷ incidents, from the unused `fact_alerts`) | SLO table with budget bars; MTTR distribution by priority; alert → incident funnel; replace the "financial risk" chart with a cost-of-downtime table driven by `it_dim_software` | Service → incident timeline → alerts |
| **Change Impact** | **DORA**: deployment frequency, change failure rate, failed-deploy recovery time, rollback rate | Change calendar heatmap; CFR by change type; deploy → incident links via new `it_bridge_change_incident` | Deployment → caused incidents |
| **Security** | Open critical CVEs, patch-SLA compliance, MTTD / MTTC, phishing click rate, blocked threats trend | **Likelihood × impact risk matrix**; CVE ageing by severity; vector trend (new `it_fact_vulnerability`, `it_fact_security_incident`, `it_fact_threat_daily`) | CVE → affected assets / software (link to `it_dim_software`) |
| **ITSM / Service desk** (optional) | Ticket backlog, SLA met %, CSAT | Backlog ageing; channel mix (read-only from the shared `fact_service_case`) | Category → cases |

## Licensing follow-ups (small)

- Move contract PDFs to a Supabase Storage bucket (update `file_url`, fill `size_kb`).
- Edition right-sizing view: heavy-licence users with light usage (needs feature-usage data).
- Link Security CVEs and App Reliability incidents to `it_dim_software`, so the product drawer can show "incidents and vulnerabilities for this product".

## Implementation status (2026-10-01)

| Item | Status |
|---|---|
| Cross-cutting 1–6 | Done (004: config, services, reshaped facts, RLS · 005: regenerated data · 007: RPCs · KpiCard deltas + sparklines) |
| Executive Overview, App Reliability, Change Impact, Security | Done earlier (see `modules/`); unchanged by the later rethink |
| Sites & OT, Data & Integration | **Dropped** at the user's request (code in `legacy/`; migrations 004/005/007 trimmed) |
| Licensing & Subscriptions | **Rethought as a six-page suite** (migrations 008–010): Spend & Budget, Usage & Optimisation, Renewals & Contracts, Vendors, Documents & Compliance, with documents at every level |
| ITSM / Service desk | **Not built.** On inspection `fact_service_case` holds customer/vehicle service cases (customer_id, vehicle_id), not IT tickets; a real ITSM module would need new `it_fact_ticket` data. Left for a later brainstorm. |
| Licensing: product drawer Risk tab | Done (`it_lic_product_risk`) |
| Licensing: move PDFs to Supabase Storage | Not done — needs a bucket and upload with project credentials; only `file_url` would change |
| Licensing: edition right-sizing | Not done — needs feature-usage data that does not exist |
