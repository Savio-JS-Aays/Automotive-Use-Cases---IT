# Module — App Reliability

- **Route:** `/app-reliability` (`?service=SRV006` preselects that service in the daily charts, `?incident=` opens an incident)
- **Code:** `src/modules/reliability/ReliabilityModule.jsx`
- **Data:** `it_rel_overview`, `it_rel_daily`, `it_ops_incidents`, `it_ops_incident_detail`; per-service maths in `it_ops_service_stats(from, to, region)` (migration 007).
- **Scope notes:** service metrics are global; incidents follow the Region filter.

## Services (it_dim_service)

SRV001 SAP ERP · SRV002 Dealer Portal · SRV003 CRM · SRV004 Xentry GW · SRV005 Teamcenter · SRV006 MES · SRV007 TMS · SRV008 Workday · SRV009 ServiceNow · SRV010 Telematics Ingest. Each has a tier, availability SLO (99.0–99.95%), p95 latency SLO, cost of downtime per minute and a link to `it_dim_software`.

## KPIs (portfolio)

The SLO-based KPIs (SLO attainment, error budget, 7-day burn, days over p95 SLO) and the Service SLOs table were removed on 2026-10-07 at the user's request. `it_rel_overview` still returns those fields; the page ignores them. The Executive Overview is unchanged.

| KPI | Formula |
|---|---|
| Availability | Σ uptime ÷ (days × 1440) per service, averaged across services; sparkline = daily availability, all services |
| Median Time to Acknowledge | median(acknowledged − opened) |
| Median Time to Resolve | median(resolved − opened), resolved incidents |
| Alert Noise | alerts with no incident ÷ alerts (Δ in pts vs prior) |
| Cost of Downtime | Σ downtime minutes × cost per minute |
| Incidents | opened in window (region filter) |

## Visuals

| Visual | Detail |
|---|---|
| Daily availability | line; own service filter: *All services* or compare up to 3 services (one `it_rel_daily` call per service; colour follows the service while it stays picked; legend when > 1 line). `?service=` preselects it |
| Daily p95 latency | same as above, independent filter |
| Time to resolve | horizontal bars of **median hours to resolve**, value labels; group by Priority (with target in the label) / Service / Root cause; filters Service and Priority (+ Clear). Tooltip: count and % resolved within target (P1 4 h, P2 8 h, P3 24 h, P4 72 h). Computed in the browser from `it_ops_incidents` (`p_limit` 1000, status *Resolved*) |
| Alert → incident funnel | alerts → linked to an incident → incidents → P1/P2 |
| Incidents table | CSV export; row → incident drawer (lifecycle with MTTD/MTTA/MTTR, alert list, causing deployment and rollback) |
