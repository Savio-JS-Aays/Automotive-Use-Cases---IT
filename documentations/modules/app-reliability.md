# Module — App Reliability

- **Route:** `/app-reliability` (`?service=SRV006` preselects that service in the daily charts, `?prio=1|2|3|4|12` preselects the incident explorer and scrolls to it (the Overview incident card's Details link), `?incident=` opens an incident)
- **Code:** `src/modules/reliability/ReliabilityModule.jsx`
- **Data:** `it_rel_overview`, `it_rel_daily`, `it_ops_incidents`, `it_ops_incident_detail`; per-service maths in `it_ops_service_stats(from, to, region)` (migration 007).
- **Scope notes:** service metrics are global; incidents follow the Region filter.

## Services (it_dim_service)

SRV001 SAP ERP · SRV002 Dealer Portal · SRV003 CRM · SRV004 Xentry GW · SRV005 Teamcenter · SRV006 MES · SRV007 TMS · SRV008 Workday · SRV009 ServiceNow · SRV010 Telematics Ingest. Each has a tier, availability SLO (99.0–99.95%), p95 latency SLO, cost of downtime per minute and a link to `it_dim_software`.

## Layout (2026-10-07): KPI cards, then two tabs (`?tab=`)

| Tab | Contents |
|---|---|
| **Incidents** (default) | Incidents by priority (stats, per day, by service) → Incidents table → incident drawer · Time to resolve |
| **Service health & alerts** (`?tab=health`) | Daily service health (availability / p95 toggle) · Alert → incident funnel · Alert noise · Cost of downtime |

The Incidents KPI card and the Overview "Details" link (`?focus=incidents`) switch to the Incidents tab and scroll to the explorer.

## KPIs (portfolio)

**Cards show value only** (2026-10-07): no sub-text, no "vs prior" chips, no Availability sparkline. Formulas and help tooltips are unchanged.

**Incident Priority (global sidebar filter, 2026-10-07):**
- **Follows it:** Median Time to Acknowledge, Median Time to Resolve, Incidents, and the Incidents-by-priority explorer. Card titles show the priority, e.g. "· P1".
  - These three are computed in the browser from `it_ops_incidents` rows (current and prior window).
  - Unfiltered they equal `it_rel_overview.kpis`: 105.5 min, 11.1 h, 48.
- **Unaffected:** Availability, Alert Noise and Cost of Downtime (service-level metrics).
- **Linking:** the explorer's priority toggle and the Overview incident card set the same global filter. Overview "Details" opens `?focus=incidents`; a legacy `?prio=` is applied to the global filter.

The SLO-based KPIs (SLO attainment, error budget, 7-day burn, days over p95 SLO) and the Service SLOs table were removed on 2026-10-07 at the user's request. `it_rel_overview` still returns those fields; the page ignores them. The Executive Overview is unchanged.

| KPI | Formula |
|---|---|
| Availability | Σ uptime ÷ (days × 1440) per service, averaged across services |
| Median Time to Acknowledge | median(acknowledged − opened) |
| Median Time to Resolve | median(resolved − opened), resolved incidents |
| Alert Noise | alerts with no incident ÷ alerts (Δ in pts vs prior) |
| Cost of Downtime | Σ downtime minutes × cost per minute |
| Incidents | opened in window (region filter) |

## Visuals

| Visual | Detail |
|---|---|
| **Incidents by priority** (`IncidentExplorer.jsx`, added 2026-10-07 after the KPI cards; it replaces the plain Incidents panel) | The former Overview P1 pop-up, merged in with the same colours and layout and without the pace chart.<br>• Priority toggle: All / P1 / P2 / P3 / P4 / P1 + P2 (URL `?prio`).<br>• Stats: incidents this window vs prior, median time to resolve (with target), % resolved within target, open now with top cause.<br>• **Per day**: stacked by priority (P1 red, P2 orange, P3 amber, P4 grey, `PRIORITY_COLOR` in `chartTheme.js`).<br>• **By service**: stacked by priority.<br>• Clicking a day or service bar filters the **Incidents** table below; removable chips, CSV export, a row opens the incident drawer.<br>• Data: `it_ops_incidents` for two windows (`days × 2`), split by open date; the current-window rows also feed Time to resolve.<br>• The **Incidents** KPI card scrolls here. |
| **Daily service health** (2026-10-07; replaces the separate Daily availability and Daily p95 latency panels) | One line chart with a **metric toggle (Availability / p95 latency)** and one shared service picker: All services, or compare up to 3 (colour follows the service). `it_rel_daily` per service; `?service=` preselects. Global (no region). |
| Time to resolve | horizontal bars of **median hours to resolve**, value labels; group by Priority (with target in the label) / Service / Root cause; filters Service and Priority (+ Clear). Tooltip: count and % resolved within target (P1 4 h, P2 8 h, P3 24 h, P4 72 h). Computed in the browser from `it_ops_incidents` (`p_limit` 1000, status *Resolved*) |

## Alerts and downtime cost (2026-10-07)

| Visual | Detail |
|---|---|
| **Alert → incident funnel** (`AlertPanels.jsx`) | Four simple bars, with the conversion written between stages: Alerts raised → Became an incident (% real, n noise) → Distinct incidents (alerts per incident) → **P1 / P2 incidents** (or the global Incident Priority, e.g. "P1 incidents"). **Filters: Service, Alert severity** (shared with Alert noise) + Clear. Data: `fact_alerts` rows for the window, read directly (read-only RLS), joined in the browser to the incidents' priority. Unfiltered it equals `it_rel_overview.funnel`: 290 → 164 → 48 → 19. |
| **Alert noise** (`AlertPanels.jsx`) | 100% bars, became an incident (blue) vs noise (amber), **by service** (sorted noisiest first) or **by alert severity**. Right column: noise % · noise/alerts. Selecting a service bar filters the funnel. Live: 126/290 = 43%; Xentry GW 85%, ServiceNow 73%, MES 17%; by severity Critical 0%, High 30%, Medium 45%, Low 69%. Alerts have no region or priority. |
| **Cost of downtime** (`DowntimeCost.jsx`) | Toggle **By service**: ₹ bars with "₹ · minutes × ₹/min" (`it_rel_overview.services`, exact). Or **By day**: daily ₹ from `it_ops_overview.heatmap` ((1 − availability) × 1440 × cost per minute); the tooltip lists the services that day. Live: ₹6.28 Cr, MES 67%; worst day 20 Sep (₹1.09 Cr). Global (no region / priority). |
