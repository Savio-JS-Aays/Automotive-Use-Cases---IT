# 08 — Glossary

| Term | Meaning here |
|---|---|
| **Tier (1/2/3)** | Business criticality. Tier 1 = mission-critical. In today's data it is a column of `dim_application` (vehicle segments), so "Tier-1 apps" = APP004, APP006, APP007 |
| **Uptime %** | `uptime_minutes / expected minutes`. The app assumes 1440 min per metric row |
| **Availability SLO** | Target uptime (e.g. 99.9%). Not modelled today |
| **Error budget** | `(1 − SLO) × period minutes`; downtime allowance. Not modelled |
| **Error rate** | Failed ÷ total transactions |
| **Latency** | `avg_api_latency_ms`, a per-row average (no percentiles) |
| **Incident** | Unplanned service disruption (`fact_incidents`). Priority P1 Critical → P4 Low |
| **MTTR** | Mean Time To Resolve: mean(resolution − open). Two inconsistent sources today (timestamps vs `mttr_minutes`) |
| **MTTA / MTTD** | Mean time to acknowledge / detect. Not available (no ack or detect timestamps) |
| **MTTC** | Mean Time To Contain (security). Mock only |
| **MTBF** | Mean time between failures. Not computed |
| **Root cause type** | External, Change, Software, Network, Hardware |
| **Change-induced outage rate** | Share of incidents whose root cause is "Change" |
| **Change failure rate (DORA)** | Share of deployments that cause an incident or rollback. Not computable today |
| **Deployment** | `fact_deployments` row; change_type Code / Config / Rollback; `pr_count` PRs bundled |
| **Alert** | Monitoring signal (`fact_alerts`), severity Critical→Low, linked to an incident |
| **Service (SRV001–010)** | Technical service in incidents, alerts and deployments. No dimension, no names |
| **Batch job / pipeline** | Scheduled integration (`fact_batch_jobs`): ERP sync, HRIS export, CRM backup, telemetry ingest |
| **Data quality** | Valid ÷ expected telemetry packets per day (`fact_data_quality`) |
| **Network event** | Per-site device health sample (`fact_network_events`): ping, disconnects |
| **IT / OT** | Information technology (ERP, CRM…) vs operational technology (plant control: MES, SCADA, PLC) |
| **Purdue model** | ICS reference layers: L4 Enterprise/ERP, L3 Site ops/MES, L2 Supervisory/SCADA, L1 Control/PLC, L0 Process |
| **Shelfware** | Paid but unused licences |
| **Renewal exposure** | Contract value renewing within N days |
| **Business unit / vertical** | Sales, Finance, Manufacturing, HR, Logistics (in incidents) |
| **Duty cycle / application (Telematics meaning)** | Vehicle use segment such as Tanker or Mining Haulage, stored in `dim_application` |
| **Xentry** | Daimler/BharatBenz workshop diagnostic software |
| **DMS** | Dealer Management System |
| **As-of date** | Fixed "today" for a demo dataset (Warranty anchors to 2026-09-24). IT has none yet |
