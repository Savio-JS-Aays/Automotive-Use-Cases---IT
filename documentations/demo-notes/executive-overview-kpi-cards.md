# Demo Notes Card — Executive Overview · KPI cards

> Defaults: Last 30 Days (01–30 Sep 2026; prior = 02 Aug–31 Aug) · all regions / verticals / services · data as of 30 Sep 2026 (synthetic).
> Updated 2026-10-07: priority is now the global sidebar filter **Incident Priority** (default All; the card and MTTR follow it; it carries over to App Reliability). The card itself has no pills or click-to-cycle.

## Opening line (10 s)
"Five numbers: three about keeping the business running, two about what we pay for software. Use the Vertical and Service filters top right to switch the whole strip to any part of the business."

---

## 1 · Incidents by priority — **All: 48** (P1 8 · P2 11 · P3 15 · P4 14 · P1 + P2 19)
- **Say:** "48 incidents this month." Set **Incident Priority = P1** in the sidebar: "8 were business-critical." Point out that **Median Time to Resolve switches to P1 (3.7 h)** too.
- **Point at / click:** **Details →** opens App Reliability; the P1 filter carries over to its KPI cards and **Incidents by priority**:
  1. Stats: **8 vs 4** last window · **median P1 fix 3.7 h vs a 4 h target** · % within target · open now with top cause.
  2. **Per day**: the P1 cluster from 19 Sep to 25 Sep.
  3. **By service**: **MES ×3** (Pune 02 plant network) and Telematics ×2 (both after a deployment). Click MES to filter the table.
  4. Click an incident to show its lifecycle, alerts and the deployment that caused it.
  5. Optional: switch the toggle to **All** to show the full mix stacked P1 red → P4 grey.
- **Key line:** "This isn't spread across the estate. It's one plant's network."
- **Proof (where from):** `fact_incidents` via `it_ops_incidents`; Overview filters to scope in the browser; App Reliability compares the current and prior windows by open date.
- **Don't say:** "P1s doubled, so reliability collapsed." 8 vs 4 is a small sample (≈5% chance at an unchanged rate).

## 2 · Median Time to Resolve — **11.1 h**
- **Say:** "When something breaks, it's typically fixed in about 11 hours. We use the median so a few long low-priority tickets don't distort it."
- **Follows the Incident Priority filter** (title shows "· P1"). P1 = 3.7 h, P2 = 6.8 h, P3 = 14.3 h, P4 = 39.4 h.
- **If asked about the trend:** it's 15.0 h last window, but **P1 (3.7 h) and P2 (6.8 h) are unchanged**. The gain is in P3/P4. Details are in App Reliability → Time to resolve, grouped by priority.
- **Proof:** median of `mttr_minutes` = resolution − open, resolved incidents only.
- **Don't say:** "We fix critical incidents faster." Also: still-open incidents are excluded, so the number is optimistic.

## 3 · Cost of Downtime — **₹6.28 Cr**
- **Say:** "Outage minutes turned into rupees, using an agreed per-minute value for each service."
- **Key line:** "Two-thirds is **MES: 647 minutes at ₹65,000 a minute ≈ ₹4.2 Cr**. The same Pune story as the P1 card."
- **Proof:** Σ (1440 − uptime_minutes) × `it_dim_service.cost_of_downtime_inr_per_min`. Downtime is modelled from P1 (60% of duration) and P2 (15%) incidents.
- **Don't say:** "We lost ₹6.28 crore." It's an estimate of exposure. Also: the Region filter does **not** change this card.

## 4 · Licence Contract Value — **₹69.76 Cr** · utilisation 87.3%
- **Say:** "Our annual software commitment across 15 active contracts. 87% of purchased seats were used in the last 30 days, just above our 85% target."
- **Proof:** Σ active contract `annual_value_inr` (split by seat share when a region is picked); utilisation = 17,584 active ÷ 20,140 purchased.
- **Don't say:** "Regional invoices." Regions are apportioned by seats. Also: the Date Range doesn't change this card (it's a 30 Sep snapshot).

## 5 · Licence Shelfware — **₹8.27 Cr**
- **Say:** "₹8.3 Cr a year buys seats nobody uses: ₹2.6 Cr never assigned, ₹5.7 Cr assigned but idle for 90+ days."
- **Key line:** "Biggest single piece: **Teamcenter, ₹2.3 Cr, utilisation down to 53%**." Then go to Licensing → Usage.
- **Don't say:** "Savings we can bank now." It's recoverable at renewal or by reassigning seats.

---

## If they ask "is this real?"
"It's a realistic synthetic dataset for a truck OEM, frozen at 30 Sep 2026. In production the same model reads the ITSM, monitoring and licence-management systems."

## Filter demo (optional, 20 s)
Vertical = **Manufacturing** → 3 P1 · 7.3 h · ₹4.35 Cr · ₹10.75 Cr licences (68.8% utilisation) · ₹2.68 Cr shelfware.
"Same strip, now it's the plant view."

## Traps
- Region changes P1 and MTTR but not Cost of Downtime.
- Date Range doesn't change the licence cards.
- "Vertical" means the *service's* vertical on incident cards and the *software's* vertical on licence cards.
- The scorecard tiles above the cards still use SLO attainment and ignore Vertical / Service.
