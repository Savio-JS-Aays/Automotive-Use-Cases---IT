# Module — Executive Overview

- **Route:** `/executive-overview` (default)
- **Code:** `src/modules/overview/OverviewModule.jsx`
- **Data:** `it_ops_overview(p_filters)`, `it_ops_incidents(p_filters, p_date)`, `it_ops_incident_detail(id)` (migration 007). Redesigned 2026-10-01; the old page is in `legacy/`.
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
| P1 Incidents | priority-1 incidents opened in the window. Δ vs the prior window; sub = open now (status Active), P1/P2 among them; sparkline = P1+P2 per day | `it_ops_incidents({days: 365, region}, p_limit 5000)`, filtered to the services in scope and split by `open_time` into the current and prior windows |
| Median Time to Resolve | median `mttr_minutes` ÷ 60 of resolved incidents opened in the window; % vs prior | same |
| Cost of Downtime | Σ `downtime_cost` of the services in scope | `it_rel_overview.services` |
| Licence Contract Value (sub: utilisation) / Licence Shelfware | `it_lic_kpis_ext` with `{region, vertical}`, or `{region, software}` = the product behind the selected service. In-house services (Telematics Ingest) show "—" | licensing RPCs |

Services in scope: the selected service, else every `it_dim_service` row of the selected vertical, else all. Verticals listed = the union of `it_dim_service.business_vertical` and `it_dim_software.business_vertical`. Unfiltered, the cards match `it_ops_overview.kpis` exactly (checked live 2026-10-07).

## Visuals

- **Service availability by day** — heatmap, rows = 10 services, columns = days; colour = availability bucket (neutral ≥ 99.95%, then one orange ramp to < 98%). Each cell is a button: it opens a drawer listing that service's incidents on that day; selecting one opens the incident drawer (lifecycle, alerts, causing deployment).
- **Top risks** — ranked list built in SQL: services that overspent their error budget ("burned N× its error budget"), licence notice deadlines ≤ 30 d, critical/high vulns past SLA, pipelines < target − 5 pts, register risks with L × I ≥ 16. Each links to the owning module (with the service/product/job pre-selected).

## Values at 30 days to 2026-09-30

Unfiltered: 8 P1 (prior 4) · MTTR 11.1 h (−26%) · downtime cost ₹6.28 Cr · 4 open incidents.
Manufacturing: 3 P1 · MTTR 7.3 h · downtime ₹4.35 Cr · licence ₹10.75 Cr (utilisation 68.8%), shelfware ₹2.68 Cr.
