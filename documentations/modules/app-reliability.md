# Module — App Reliability

- **Route:** `/app-reliability` (`?service=SRV006` focuses one service, `?incident=` opens an incident)
- **Code:** `src/modules/reliability/ReliabilityModule.jsx`
- **Data:** `it_rel_overview`, `it_rel_daily`, `it_ops_incidents`, `it_ops_incident_detail`; per-service maths in `it_ops_service_stats(from, to, region)` (migration 007).
- **Scope notes:** service metrics are global; incidents follow the Region filter.

## Services (it_dim_service)

SRV001 SAP ERP · SRV002 Dealer Portal · SRV003 CRM · SRV004 Xentry GW · SRV005 Teamcenter · SRV006 MES · SRV007 TMS · SRV008 Workday · SRV009 ServiceNow · SRV010 Telematics Ingest. Each has a tier, availability SLO (99.0–99.95%), p95 latency SLO, cost of downtime per minute and a link to `it_dim_software`.

## KPIs (portfolio, or the selected service)

| KPI | Formula |
|---|---|
| SLO Attainment / Availability | services meeting SLO ÷ services; availability = Σ uptime ÷ (days × 1440) |
| Error Budget Remaining | 1 − downtime ÷ ((1 − SLO) × days × 1440); shown as "N× used" when overspent. Service view adds the **7-day burn rate** = (last-7-day downtime ÷ minutes) ÷ (1 − SLO) |
| Median Time to Acknowledge | median(acknowledged − opened) |
| Median Time to Resolve | median(resolved − opened), resolved incidents |
| Alert Noise | alerts with no incident ÷ alerts (Δ in pts vs prior) |
| Cost of Downtime | Σ downtime minutes × cost per minute (replaces the old hash-based "financial risk") |
| Days over p95 Latency SLO | count of service-days with daily p95 > SLO |
| Incidents | opened in window |

## Visuals

| Visual | Detail |
|---|---|
| Service SLOs table | availability vs SLO (▼ red when missed), error-budget bar, 7-d burn, p95 vs SLO, error rate, incidents (P1/P2), MTTR, alert noise, downtime cost. Row = drill to that service. |
| Daily availability | line; dashed SLO when one service is selected |
| Daily p95 latency | line; dashed p95 SLO when one service is selected |
| Time to resolve by priority | per priority: P25–P75 box, median tick, line to P90, dashed target (4/8/24/72 h); each priority on its own scale; % within target |
| Alert → incident funnel | alerts → linked to an incident → incidents → P1/P2 |
| Incidents table | CSV export; row → incident drawer (lifecycle with MTTD/MTTA/MTTR, alert list, causing deployment and rollback) |
