# Demo Notes Card — App Reliability · KPI cards

> Defaults: Last 30 Days (01–30 Sep 2026; prior 02 Aug–31 Aug) · all regions · Incident Priority = All · data as of 30 Sep 2026 (synthetic) · updated 2026-10-07: cards show the value only (no sub-text, no "vs prior", no sparkline). The prior-window figures below are for answering questions, not on screen.

## Opening line (≤ 10 s)
"Six numbers on how reliable our business services are: how available, how fast we respond, how fast we fix, how noisy our alerting is, and what outages cost."

## 1 · Availability — **99.59%**
- **Say:** "Across our 10 business services we were up 99.6% of the time."
- **Key line:** "Averages hide pain. Weighted by business cost it's **99.32%**, because MES (98.50%) is the expensive one."
- **Proof:** Σ uptime ÷ (days × 1440) per service, then a simple average across services (`it_rel_overview.services`).
- **Don't say:** "Every service is at 99.6%." MES 98.50%, Telematics 99.07%.

## 2 · Median Time to Acknowledge — **105.5 min** (prior window 40 min, not shown)
- **Say:** "How long until someone picks up an incident."
- **Click:** set **Incident Priority = P1** → **9.5 min** (prior 10.5). P1 + P2 → 15 min.
- **If asked about the trend (+164%):** "That's a mix effect. Critical incidents are picked up in under 10 minutes; the jump is P3/P4 queues."
- **Don't say:** "Our response time tripled." Not for critical incidents.

## 3 · Median Time to Resolve — **11.1 h** (prior 15.0 h, not shown)
- **Say:** "Typical time from open to fixed."
- **Click:** P1 → **3.7 h (target 4 h)**, flat vs prior. P4 → 39.4 h (−44%).
- **Key line:** "The typical P1 is fixed inside the 4-hour target, and stable vs last month. But **3 of the 8 P1s missed it**; the incident list shows which."
- **Don't say:** "All critical incidents are fixed within target." Only the median is; 5 of 8 P1s (63%) made it.

## 4 · Alert Noise — **43%** (prior 45%, not shown)
- **Say:** "Of 290 alerts this month, 126 never turned into an incident: noise that trains people to ignore alerts."
- **Point at:** worst offenders **Xentry GW 85%** and **ServiceNow 73%**. Best: MES 17%.
- **Don't say:** "Changes with Incident Priority or Region." It doesn't (alerts have no priority or region).

## 5 · Cost of Downtime — **₹6.28 Cr**
- **Same number as the Overview.** Two-thirds is MES (647 min × ₹65,000/min).
- **Don't say:** "We lost ₹6.28 Cr." It's estimated exposure. Doesn't change with Region or Priority.

## 6 · Incidents — **48**
- **Click:** the card → scrolls to **Incidents by priority** (follows the same Incident Priority filter: P1 8 · P2 11 · P3 15 · P4 14).

## Filter demo (20 s)
Sidebar **Incident Priority = P1** → cards: **9.5 min · 3.7 h · 8**; explorer switches to P1 as well. "One filter, the whole page tells the critical-incident story."

## Traps
- Availability is an **unweighted** average (Workday counts as much as MES).
- MTTA/MTTR medians pooled across priorities swing with the mix. Always offer the P1 view.
- MTTR excludes still-open incidents (4 at 30 Sep), so it's optimistic.
- Alert Noise, Availability and Cost ignore the Incident Priority filter; Availability, Noise and Cost also ignore Region.
