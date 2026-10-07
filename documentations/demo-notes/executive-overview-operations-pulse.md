# Demo Notes Card — Executive Overview · Operations pulse

> Defaults: Last 30 Days (01–30 Sep 2026) · all regions / verticals / services · data as of 30 Sep 2026 (synthetic) · updated 2026-10-07 (full analysis; Telematics link confirmed).

## Opening line (≤ 10 s)
"One picture of the whole IT estate. Same grid, five lenses: every row is a service, an asset class or a product, every column a day."

## Toggle order to show (≈ 60 s total)

### 1 · Availability — "19 service-days below 99.5%"
- **Say:** "Darker orange means more downtime. Most of the grid is grey, which is good."
- **Point at:** Telematics on **04 Sep (88.3%)**, the worst day, and the MES row through late September.
- **Click:** an orange cell → that day's incidents → open one.
- **Proof:** `fact_app_metrics.uptime_minutes ÷ 1440` per service per day.

### 2 · Incidents — "48 incidents · 8 service-days with a P1"
- **Say:** "Same grid, now coloured by the worst incident that day. Red is P1."
- **Key line:** "The red cells line up with the orange cells in the Availability view. Outages drive downtime."
- **Click:** a red cell → the incident list for that day.

### 3 · Change — "89 deployments · 5 failed (6%)"
- **Say:** "Blue is a clean release, red is a failed one."
- **Point at:** the 5 failed releases: **Telematics 04 Sep** and **22 Sep**, **CRM 04 Sep** and **10 Sep**, **Dealer Portal 20 Sep**. Every one is linked to the incident it caused.
- **Click:** Telematics 04 Sep → Deployments for that day → DEP01451 → caused **INC00559 (P1)**, fixed in 4.7 h.
- **Key line:** "Telematics' worst day, 88% available on 4 Sep, was caused by a release at 16:01 that day. It's on record, not guesswork."

### 4 · Security — "past-SLA critical/high: 7 → 8"
- **Say:** "Critical and high vulnerabilities that missed their patch deadline, by asset type."
- **Key line:** "**OT devices at the plants** are dark every single day. That's the patch backlog on line controllers."
- **Click:** → Security.

### 5 · Licences — "6 of 15 products below 85%"
- **Say:** "Licences are measured monthly, so this view is by month."
- **Point at:** **Tableau** (lowest, about 40%) and **Teamcenter** going steadily darker over the year (83% → 53%).
- **Click:** a product → its usage drawer in Licensing.

## If they ask "is this real?"
"Synthetic but realistic data for a truck OEM, frozen at 30 Sep 2026. The grid itself is generic: it works on any ITSM, monitoring, CI/CD, vulnerability-scanner or SAM feed."

## Filter demo (optional)
Vertical = **Manufacturing** → Availability shows only Teamcenter and MES. Security drops to **5** past-SLA vulnerabilities at 30 Sep. Licences shows only Manufacturing products.

## Traps
- **Change** ignores Region: deployments are global. The summary line says so.
- **Security** rows are asset classes, not services. Vulnerabilities with no region count in every region.
- **Licences** is **monthly** and 12 months long, not the 30-day window.
- The colour scales differ by view (each has its own legend). Don't compare "darkness" across views.
- **Don't say:** "Every red day in Change caused the downtime on that day." Only claim causation where the deployment → incident link exists (incident drawer / `it_bridge_change_incident`), as it does for Telematics 04 Sep.
