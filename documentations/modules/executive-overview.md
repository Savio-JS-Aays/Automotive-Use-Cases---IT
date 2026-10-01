# Module — Executive Overview

- **Route:** `/executive-overview` (default)
- **Code:** `src/modules/overview/OverviewModule.jsx`
- **Data:** `it_ops_overview(p_filters)`, `it_ops_incidents(p_filters, p_date)`, `it_ops_incident_detail(id)` (migration 007). Redesigned 2026-10-01; the old page is in `legacy/`.
- **Filters:** global Date Range (7/30/90 days ending at the as-of date 2026-09-30) and Region. URL state: `?cell=SRV002|2026-09-12` (heatmap drill), `?incident=INC00585`.

## Scorecard (5 tiles, each links to its module)

| Area | Score (0–100) | Status rule | Headline |
|---|---|---|---|
| Reliability | % of services meeting their availability SLO | good ≥ 90%, warning ≥ 70%, else critical | "6 of 10 services meet SLO" |
| Change | 100 × (1 − change failure rate) | good ≤ CFR target (15%), warning ≤ target + 10 pts | CFR % |
| Security | patch-SLA compliance % (vulns patched in window) | good if 0 critical/high past SLA, warning ≤ 3 | count past SLA |
| Cost | licence utilisation % (from `it_lic_kpis`) | good ≥ 85%, warning ≥ 75% | utilisation |
| Data | min(pipeline success, telemetry completeness) × 100 | good ≥ 97%, warning ≥ 93% | both values |

## KPIs

| KPI | Formula | Extra |
|---|---|---|
| SLO Attainment | services with availability ≥ SLO ÷ services | pts vs prior window; sparkline = portfolio availability per day |
| Error Budget Remaining | 1 − Σ downtime ÷ Σ allowed downtime; allowed = (1 − SLO) × days × 1440 per service | negative = overspent |
| P1 Incidents | count, priority 1, opened in window (region filter) | Δ vs prior; open now; sparkline = P1+P2 per day |
| Median Time to Resolve | median(resolution − open) of resolved incidents opened in window | % vs prior |
| Cost of Downtime | Σ downtime min × `it_dim_service.cost_of_downtime_inr_per_min` | |
| Licence Contract Value / Shelfware | from `it_lic_kpis` (region-apportioned) | |
| Open Incidents | status = Active at the as-of date | P1/P2 among them |

## Visuals

- **Service availability by day** — heatmap, rows = 10 services, columns = days; colour = availability bucket (neutral ≥ 99.95%, then one orange ramp to < 98%). Each cell is a button: it opens a drawer listing that service's incidents on that day; selecting one opens the incident drawer (lifecycle, alerts, causing deployment).
- **Top risks** — ranked list built in SQL: services that overspent their error budget ("burned N× its error budget"), licence notice deadlines ≤ 30 d, critical/high vulns past SLA, pipelines < target − 5 pts, register risks with L × I ≥ 16. Each links to the owning module (with the service/product/job pre-selected).

## Values at 30 days to 2026-09-30 (unfiltered)

SLO attainment 60% (SAP, Dealer Portal, MES, Telematics miss) · error budget −17% · 8 P1 (prior 4) · MTTR 11.1 h (−26%) · downtime cost ₹6.28 Cr · 4 open incidents.
