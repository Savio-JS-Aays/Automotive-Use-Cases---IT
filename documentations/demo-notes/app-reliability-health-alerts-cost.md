# Demo Notes Card — App Reliability · Daily service health, Time to resolve, Alert funnel, Alert noise, Cost of downtime

> Defaults: Last 30 Days (01–30 Sep 2026) · all regions · Incident Priority = All · data as of 30 Sep 2026 (synthetic) · updated 2026-10-07 (full analysis).

> On App Reliability these visuals are on the **Service health & alerts** tab.

## Opening line (≤ 10 s)
"Below the incident list: how healthy each service was day by day, how fast we fix by type, whether our alerts are worth listening to, and what downtime cost."

## 1 · Daily service health — Availability / p95 latency toggle
- **Say:** "One chart, two lenses: uptime and speed."
- **Click:** pick **MES** + **Telematics** → MES dips to **89.2% on 24 Sep** and 90.7% on 20 Sep; Telematics to **88.3% on 4 Sep**. Toggle **p95 latency**: on those same days latency jumps (MES 498 ms on 20 Sep vs a 400 ms target; Telematics 384 ms on 4 Sep vs 300).
- **Key line:** "Outages don't just stop a service; they slow it down around the outage."
- **Don't say:** "All services p95 is the fleet's p95." It's an **average of each service's p95**. Compare services individually.

## 2 · Time to resolve — median hours (Priority / Service / Root cause)
- **Say:** "Typical fix time, by priority, service or cause."
- **Click:** **Root cause** → **Change 4.7 h** (fastest: we know what we changed), Network 7.7 h, Hardware 8.0 h, Software 15.6 h, **External 19.7 h** (waiting on third parties).
- **Click:** **Service** → **TMS 39.4 h** slowest, MES 5.5 h, Telematics 5.2 h fastest.
- **Key line:** "Third-party problems take four times longer to fix than our own releases."
- **Don't say:** "TMS is our worst team." Only 4 incidents, mostly P4. Small numbers.
- ⚠️ This chart has its **own** Priority dropdown; it ignores the sidebar Incident Priority.

## 3 · Alert → incident funnel — 290 → 164 → 48 → 19
- **Say:** "290 alerts, but only 57% pointed at something real: 48 incidents, 19 of them P1/P2. About 3.4 alerts per incident."
- **Click:** Alert severity = **Low** → only 31% real, no P1/P2 at all. **Critical alerts are never noise.**
- **Key line:** "Low-severity alerts are mostly noise; that's where tuning pays."

## 4 · Alert noise — 43% overall
- **Point at:** **Xentry GW 85%** (29 of 34), **ServiceNow 73%**; MES cleanest at 17%. By severity: Critical 0%, High 30%, Medium 45%, Low 69%.
- **Click:** the Xentry bar → the funnel switches to Xentry: 34 alerts → 2 incidents.
- **Key line:** "Fix two services' alert rules and we remove half the noise" (61 of 126).

## 5 · Cost of downtime — ₹6.28 Cr
- **By service:** "MES alone is ₹4.21 Cr: 647 minutes at ₹65,000 a minute." SAP ₹0.88 Cr, Telematics ₹0.48 Cr.
- **By day:** only **15 of 30 days** had any downtime cost. Worst **20 Sep (₹1.09 Cr)** and **24 Sep (₹1.01 Cr)**, both MES. Hover to show the services.
- **Proof:** by-day sum reconciles with by-service within ₹1,200.
- **Don't say:** "We lost ₹6.28 Cr." It's estimated exposure at agreed per-minute rates.

## Traps
- Daily service health, Alert noise, the funnel and Cost ignore **Region** (service-level data; alerts have no region).
- Time to resolve has its own Priority filter; the funnel's last stage follows the sidebar Incident Priority.
- p95 "All services" = mean of per-service p95s, not a true percentile.
- Downtime cost counts only P1 (60%) and P2 (15%) incident minutes. P3/P4 cost ₹0 by design.
- The availability axis does not start at 0% (it zooms to the data), so small dips look large.
