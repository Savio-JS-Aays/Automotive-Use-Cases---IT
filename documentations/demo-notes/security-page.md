# Demo Notes Card — Security · KPI cards, vulnerabilities, threats and incidents

> Defaults: Last 30 Days (01–30 Sep 2026) · all regions / departments / asset classes · data as of 30 Sep 2026 (synthetic) · created 2026-10-07 (redesign).

## Opening line (≤ 10 s)
"Security in two halves: the holes we still have to patch, and the attacks we're stopping or not."

## KPI cards (value only)
- **2 open critical · 8 past patch SLA · 55% patched on time.** Click **Past Patch SLA** → the list of overdue items.
- **12 security incidents · detected in about 2 days · contained in about 31 hours.**
- **Phishing click rate 5.8%** (was 14.3% in Apr 2025). **1.35 lakh threats blocked.**
- **Filter demo:** sidebar Asset Class = **OT device** → 0 critical but **5 of the 8 overdue** are OT. Department = **Dealer Network** → 6 incidents, phishing clicks **9.6%** (worst department).

## Vulnerabilities tab
- **Say:** "84 open, 29 past their patch deadline. The oldest has been open 492 days, on a plant OT device."
- **Click:** **By asset class** → OT device has the most overdue items; tick **Exploit available only**.
- **Click a row** → the list filters to it; sort by **Highest CVSS** or **Due soonest**; Export CSV.
- **Don't say:** "29 critical items are overdue." 29 is all severities; the KPI's 8 is Critical + High.

## Threats & incidents tab
- **Tiles:** "Intrusion attempts are the biggest volume (92,791), but 99.97% are blocked. Phishing lets the most through (47) and caused 4 real incidents."
- **Click Phishing email** → daily got-through trend, then the **phishing simulations**: click rate fell from 14.3% to 5.8%; latest campaign worst in **Dealer Network (10%)**. Then the 4 phishing incidents → open **SEC-0152** (mailbox compromise, Microsoft 365, still open, took 2.9 days to detect).
- **Security incidents chart:** this window: Credential stuffing leads (5, 2 of them Sev 1). Switch to **Last 12 months + Department** → **Dealer Network 43 of 116**.
- **Key line:** "Controls stop 99.9% of attempts; the risk is the handful that get through, mostly phishing and credential attacks on the dealer network."

## Traps
- The threat feed has **no region or department**: tiles don't change with those filters.
- "Real incidents" maps threat vectors to incident types (Intrusion attempt ↔ Vulnerability exploit). Lost device and Insider misuse incidents have no threat feed.
- MTTD shows **2.1 d** (= 49.4 h).
- The data is synthetic (OT backlog, credential-stuffing spike in Aug 2026, falling phishing click rate are planted stories).
