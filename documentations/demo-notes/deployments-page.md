# Demo Notes Card — Deployments (formerly Change Impact) · KPI cards, charts and drill-down

> Defaults: Last 30 Days (01–30 Sep 2026; prior 02 Aug–31 Aug) · all services · all change types · all regions · data as of 30 Sep 2026 (synthetic) · updated 2026-10-07: page renamed **Deployments** (`/deployments`); **Service** and **Change Type** are now sidebar filters and drive every card and chart; new Lead time and Rollback-or-fix-forward charts.

## Opening line (≤ 10 s)
"These are the four DORA measures plus two of ours: how often we ship, how fast, how often it breaks, and how fast we recover."

## 1 · Deployment Frequency — **2.97 / day** (89 deployments, −15.9% vs prior)
- **Say:** "Around three production releases a day across our ten business services."
- **Key line:** "Down from August, when Dealer Portal ran a release wave."
- **Don't say:** "Every service deploys three times a day." It's the portfolio total; per service it's roughly a couple a week.

## 2 · Change Failure Rate — **5.6%** (5 of 89; target ≤ 15%; was 13.2%)
- **Say:** "About one release in twenty causes a problem, well inside our 15% target and down sharply from August's 13%."
- **Key line:** "August's spike was the Dealer Portal wave; September is back to normal."
- **Click the card:** the table filters to the **5 failed** deployments: Telematics 04 and 22 Sep, CRM 04 and 10 Sep, Dealer Portal 20 Sep. All 5 caused an incident.

## 3 · Failed Deploy Recovery — **1.6 h** (+31% vs prior)
- **Say:** "When a release fails, we typically restore service in about an hour and a half."
- **How:** rollback time if rolled back, else when the incidents it caused were resolved.
- **If asked why it rose:** fewer failures (5), so one fix-forward weighs more. Telematics DEP01451 was fixed forward over about 9 h.
- **Don't say:** "We recover within an hour of noticing." It's measured **from the deploy time**, not from detection.

## 4 · Lead Time · Code — **36.5 h** (−26%; prior about 50 h)
- **Say:** "A code change reaches production in about a day and a half, down a quarter."
- **Key line:** "Code lead time has nearly halved over the 18-month history" (about 64 h → 35 h).
- **Don't say:** "All changes take 37 h." **Code** changes only; config is hours, infra 1–3 days.

## 5 · Rollback Rate — **3.4%** (3 of 89; was 9.5%)
- **Say:** "3 of the 5 failed releases were rolled back; the other 2 were fixed forward."

## 6 · Change-Induced Incidents — **10.4%** (5 of 48 incidents; was 30.7%)
- **Say:** "One incident in ten was caused by our own release, down from almost a third in August."
- **Click:** a red day in the calendar → its deployments → the caused-incident chip → incident panel (e.g. INC00559).

## Filter demo (20 s)
- Sidebar Change Type = **Infra** → 0.67/day · **CFR 15.0% (right at target)** · lead time 52.6 h. "Infra changes are rarer, slower and riskier."
- Sidebar Service = **Dealer Portal** + Date Range **Last 90 Days** → the August release wave.

## Traps
- Only **Change-Induced Incidents** follows Region; the deployment cards are global.
- Change failure rate and rollback rate both divide by deployments **excluding rollbacks**.
- A release failing near the window end may have no recovery time yet (censored).
- Lead time is **Code only**.
- The data is synthetic: failure odds per type (Code 11%, Config 7%, Infra 13%) fall about 35% over the history, and the Dealer Portal wave in August 2026 was injected on purpose.
- Unfiltered, the browser-computed cards equal `it_chg_overview` (checked 2026-10-07).
- **Data quirk:** DEP01501 (Telematics, 22 Sep) was rolled back after **35 min**, but the incident it caused opened 2 h *after* the rollback and was fixed 3.7 h after deploy. Recovery counts the rollback (35 min). Don't use this one as the recovery example; use **DEP01451** (fixed forward, about 9 h).

---

# Charts, calendar and drill-down

> The page has two tabs under the KPI cards: **Release performance** (failure rate, per week, lead time, rollback or fix forward) and **Calendar & log** (calendar + table). Clicking the Change Failure Rate card jumps to Calendar & log with the 5 failed releases listed.

## Change failure rate (one bar per service or change type)
- **Say:** "Red would mean above our 15% target; nothing is red this month."
- **Point at:** CRM 13% (2 of 16), Telematics 11% (2 of 18), Dealer Portal 8% (1 of 12).
- **Click:** **By change type** → Infra highest (15%). Click a bar → the whole page filters to it.

## Deployments per week
- **Say:** "About 18 releases a week; the busiest was the week of 7 Sep (25, 1 failed)."
- **Click:** **Colour by: Change type** to show the mix; click a week → the table lists it.

## Lead time for changes (Distribution / Trend · This window / Last 12 months)
- **Say:** "How long a change takes from first commit to production, by type."
- **Window medians:** Code **36.5 h** (42), Config 14.4 h (27), Infra 52.6 h (20).
- **Click:** **Trend + Last 12 months** → "Code lead time more than halved: **81.9 h in Oct 2025 → 36.5 h in Sep 2026**." Infra stays around 47 h.
- **Don't say:** "All changes got faster." Config and Infra are flat; the gain is Code.

## Rollback or fix forward
- **Window:** 5 failed · **3 rolled back (median 64 min)** · **2 fixed forward (median 8.8 h)**, about 8× slower. Bars are per deployment; click one → its drawer (DEP01451 is the long red bar).
- **Last 12 months:** 87 failed · 48 rolled back (55%) **median 87 min** · 39 fixed forward (45%) **median 10.1 h** → "**Rolling back restores service about 7× faster.**"
- **Key line:** "Policy recommendation: roll back first, fix later."
- **Don't say:** "Fixing forward is always worse." Some failures can't be rolled back (e.g. data or infra changes); the data shows the typical cost.

## Deployment calendar
- **Say:** "A normal calendar: each day says how many releases went out and how many failed."
- **Point at:** 89 releases on 25 of 30 days · busiest **Wed 2 Sep (7)** · **4 days with a failure** (4 Sep had 2) · only 4% at weekends.
- **Click:** **Failures only** → just the red days; click **4 Sep** → the table shows that day's 6 deployments.

## Deployment drill-down (select a deployment ID)
- **Show DEP01451** (Telematics, 4 Sep): Infra, fixed forward, caused **INC00559 (P1)**. The timeline shows deploy 16:01 → incident 20:13 → resolved 00:53; availability that day **88.33%**.
- **Key line:** "From a calendar day to the release, to the outage it caused, to the hours of downtime: three clicks."
