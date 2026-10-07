# Demo Notes Card — Executive Overview · Top risks

> Defaults: Last 30 Days (01–30 Sep 2026) · all regions · data as of 30 Sep 2026 (synthetic) · created 2026-10-07.
> Shows the first 6 of 10 items; "+4 more in the modules".

## Opening line (≤ 10 s)
"Instead of reading every chart, this is the to-do list: the things that need a decision this month, each linked to the page that owns it."

## What's on it (default view)
| # | Area | Item | Click → |
|---|---|---|---|
| 1–4 | Reliability | Dealer Portal 1.9× · SAP ERP 4.8× · Telematics 9.3× · **MES 30.0×** "burned its error budget" | App Reliability, service preselected |
| 5 | Cost | **ServiceNow** renewal notice due in **1 day** (auto-renews 15 Dec 2026) | Licensing, product drawer |
| 6 | Cost | **Salesforce Sales Cloud** notice due in **15 days** | Licensing, product drawer |
| (7–10, hidden) | Security | 8 critical/high vulns past SLA · register: OT patch backlog (score 20), dealer-portal credential stuffing (16), Pune 02 edge network SPOF (16) | Security |

## Points to land
- **Say:** "Reliability first, then money with a deadline, then security. Every item has a number, and one click takes you to the evidence."
- **Point at:** **MES 30×**: it was allowed 22 minutes of downtime this month and had 647. **ServiceNow**: if nobody acts by tomorrow, it auto-renews.
- **Click:** MES → App Reliability with MES preselected. Then ServiceNow → its product drawer and renewal quote.
- **Key line:** "The list ties together what the other cards hinted at: Pune MES is the operational risk; ServiceNow is the commercial deadline."
- **Proof:** built in SQL inside `it_ops_overview` (CTE `risks`) from `it_ops_service_stats`, `it_lic_portfolio`, `it_fact_vulnerability` and `it_fact_security_risk`.

## Don't say
- ❌ "Ranked by severity." Items are grouped by area (Reliability → Cost → Security), and **within Reliability the order is reversed**: the mildest (Dealer Portal 1.9×) shows first and the worst (MES 30×) last. Say: "grouped by area".
- ❌ "Security looks fine." The security items are below the fold (+4 more).
- ❌ "This follows the Vertical / Service filter." It doesn't; only Region affects the security count.

## If they ask "is this real?"
"Synthetic data, as of 30 Sep 2026. The rules are real: SLO error budget, notice-period deadline, patch SLA, risk-register score ≥ 16."

## Traps
- "Error budget" is SLO language, which was removed from the rest of the app. Be ready to explain: allowed downtime = (1 − SLO) × minutes.
- "Mostly OT devices at the plants" is fixed text in the SQL, not computed (it happens to be true in this data).
- The licence items ignore Region and the page filters (`it_lic_portfolio('{}')`).
