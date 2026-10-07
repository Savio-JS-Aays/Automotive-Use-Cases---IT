# Module — Executive Overview

- **Route:** `/executive-overview` (default)
- **Code:** `src/modules/overview/OverviewModule.jsx`
- **Data:** `it_ops_overview(p_filters)`, `it_ops_incidents(p_filters, p_date)`, `it_ops_incident_detail(id)` (migration 007). Redesigned 2026-10-01; the old page is in `legacy/`.
- **Demo notes:** [../demo-notes/executive-overview-kpi-cards.md](../demo-notes/executive-overview-kpi-cards.md)
- **Filters:**
  - Global: Date Range (7/30/90 days ending at the as-of date 2026-09-30) and Region.
  - Page (added 2026-10-07), in the header: **Vertical** and **Service**. The Service list narrows to the chosen vertical, and picking a vertical that excludes the selected service clears it.
  - URL state: `?vertical=`, `?service=`, `?cell=SRV002|2026-09-12` (heatmap drill), `?incident=INC00585`.
  - Vertical / Service apply to the **KPI cards and the heatmap rows**. The scorecard and Top risks stay portfolio-wide, and the header note says so.

## Scorecard (5 tiles, each links to its module)

| Area | Score (0–100) | Status rule | Headline |
|---|---|---|---|
| Reliability | % of services meeting their availability SLO | good ≥ 90%, warning ≥ 70%, else critical | "6 of 10 services meet SLO" |
| Change | 100 × (1 − change failure rate) | good ≤ CFR target (15%), warning ≤ target + 10 pts | CFR % |
| Security | patch-SLA compliance % (vulns patched in window) | good if 0 critical/high past SLA, warning ≤ 3 | count past SLA |
| Cost | licence utilisation % (from `it_lic_kpis`) | good ≥ 85%, warning ≥ 75% | utilisation |
| Data | min(pipeline success, telemetry completeness) × 100 | good ≥ 97%, warning ≥ 93% | both values |

## KPIs (5 cards since 2026-10-07; SLO Attainment, Error Budget and Open Incidents removed, open count now in the P1 card)

Computed in the browser so they can follow the Vertical / Service filters. None of 004–010 accepts those filters, and no DDL was run.

| KPI | Formula | Source |
|---|---|---|
| Incidents by priority (`PriorityIncidentCard.jsx`) | count of incidents opened in the window for the selected priority. The card has **no filter of its own** (the pills and click-to-cycle were removed on 2026-10-07). It shows the count for the **global Incident Priority filter** (sidebar; default All), which also drives Median Time to Resolve (title shows "· P1" etc.) and the pulse Incidents view. **Details →** opens `/app-reliability?focus=incidents` (plus `&service=`), where the same global priority applies. The P1 pop-up (`P1Drawer`, `?p1=1`) was retired on 2026-10-07 and moved to `legacy/`. | `it_ops_incidents({days, region})`, filtered to scope in the browser |
| Median Time to Resolve | median `mttr_minutes` ÷ 60 of resolved incidents opened in the window (value only; the % vs prior was removed 2026-10-07) | same |
| Cost of Downtime | Σ `downtime_cost` of the services in scope | `it_rel_overview.services` |
| Licence Contract Value (sub: utilisation) / Licence Shelfware | `it_lic_kpis_ext` with `{region, vertical}`, or `{region, software}` = the product behind the selected service. In-house services (Telematics Ingest) show "—" | licensing RPCs |

Services in scope: the selected service, else every `it_dim_service` row of the selected vertical, else all. Verticals listed = the union of `it_dim_service.business_vertical` and `it_dim_software.business_vertical`. Unfiltered, the cards match `it_ops_overview.kpis` exactly (checked live 2026-10-07).

## Visuals

- **Operations pulse** (`OperationsPulse.jsx`; it replaced "Service availability by day" on 2026-10-07). One heatmap grammar (rows × days) across the modules, switched by a toggle. Each view has its own legend, a one-line summary and a drill-down. Follows the Overview scope where the data allows.

  | View | Rows × cols | Colour | Click | Source |
  |---|---|---|---|---|
  | Availability | services × days | availability buckets (neutral ≥ 99.95% → dark orange < 98%) | incidents that service/day (drawer) | `it_ops_overview.heatmap` |
  | Incidents | services × days | worst priority opened that day (P1 red → P4 grey, `PRIORITY_COLOR`) | same drawer | `it_ops_incidents` (current window, scoped) |
  | Change | services × days | none / deployed cleanly (blue) / ≥ 1 failed (red); rollbacks excluded; deployments are global | `/deployments?service=&from=&to=` | `it_chg_deployments` (fetched when the view opens) |
  | Security | asset class × days | critical/high vulnerabilities past patch SLA that day (due < day, discovered ≤ day, not patched by then; risk-accepted excluded; region-less vulns count in every region) | `/security` | `it_fact_vulnerability` read directly (fetched when the view opens) |
  | Licences | products × last 12 months | utilisation buckets (neutral ≥ 85% target) | product drawer on Licensing → Usage | `it_lic_usage_matrix` (vertical, or the service's product) |

- **Top risks** — ranked list built in SQL: services that overspent their error budget ("burned N× its error budget"), licence notice deadlines ≤ 30 d, critical/high vulns past SLA, pipelines < target − 5 pts, register risks with L × I ≥ 16. Each links to the owning module (with the service/product/job pre-selected).

## Values at 30 days to 2026-09-30

Unfiltered: 8 P1 (prior 4) · MTTR 11.1 h (−26%) · downtime cost ₹6.28 Cr · 4 open incidents.
Manufacturing: 3 P1 · MTTR 7.3 h · downtime ₹4.35 Cr · licence ₹10.75 Cr (utilisation 68.8%), shelfware ₹2.68 Cr.
