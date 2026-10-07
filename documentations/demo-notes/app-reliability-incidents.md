# Demo Notes Card — App Reliability · Incidents by priority, Incidents table and drill-downs

> Defaults: Last 30 Days (01–30 Sep 2026; prior 02 Aug–31 Aug) · all regions · Incident Priority = All · data as of 30 Sep 2026 (synthetic) · created 2026-10-07.

> On App Reliability these visuals are on the **Incidents** tab (default).

## Opening line (≤ 10 s)
"This is where we go from 'how many incidents' to 'which one, when, why, and was it our own release'."

## 1 · Incidents by priority — **48** (+9 vs 39)
- **Say:** "48 incidents, 19 of them P1/P2. 80% of the resolved ones were fixed inside their target."
- **Point at the stats:** median fix 11.1 h · **within target 80% (35 of 44 resolved)** · **open now 4** · top cause Network (15; Software is also 15).
- **Click:** toggle **P1** (it also sets the sidebar filter): 8 P1s · median 3.7 h vs a 4 h target · **5 of 8 within target**.
- **Per day:** spike on **28 Sep (5)** and **30 Sep (4)**; 5 of the 8 P1s fall between 19 and 24 Sep.
- **By service:** **MES 9**, Telematics 7, CRM 6. Click **MES** → the table shows only MES (Pune 02 network incidents).
- **Key line:** "Two clicks: from 48 incidents to the 3 MES P1s at one plant."

## 2 · Incidents table
- **Say:** "Every incident with its priority, cause, how fast we picked it up and fixed it, and where."
- **Point at:** "open" in amber = still unresolved (4). "from DEP…" under a title = caused by our own release (5 this month). Plant/dealer names in *Where* (17 incidents have a site).
- **Export CSV** gives the filtered list.

## 3 · Drill-down: the incident panel (show **INC00559**)
- **Find it:** priority **P1** → per day **04 Sep** → *Telematics — errors after deployment*.
- **Lifecycle:** deployed 16:01 → impact 20:05 → **detected 20:11 (MTTD 6 min)** → opened 20:13 → **acknowledged 20:17 (MTTA 4 min)** → resolved 00:53 (**MTTR 4.7 h**, just over the 4 h P1 target).
- **Caused by deployment:** **DEP01451**, Infra change, 2 PRs, **fixed forward (no rollback)**, link confidence 70%.
- **Alerts (7):** first Critical alert at 20:11 = the detection time; 5 Critical, 2 High.
- **Key line:** "That one release explains Telematics' worst day: 280 minutes of P1 at 60% weighting = 168 minutes down = **88.3% availability on 4 Sep**, exactly what the health chart shows."

## Traps
- "Within target" is per incident; the median can be inside target while individual P1s miss it.
- "Top cause" shows the first of a tie (Network 15 = Software 15).
- MTTR / within-target exclude the 4 open incidents.
- Causal and link confidence (70%) are **synthetic scores**, not a model output. Don't call them ML.
- Region and Incident Priority filter this whole section. There is no Vertical / Service filter on this page: Overview → Details passes `service`, but that only preselects the Daily service health chart, not the incident list (use the By service bar).
