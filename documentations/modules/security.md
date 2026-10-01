# Module — Security

- **Route:** `/security` (`?risk=4-5` filters the register to a matrix cell)
- **Code:** `src/modules/security/SecurityModule.jsx`
- **Data:** `it_sec_overview`, `it_sec_vulns` (migration 007) over the new tables from migration 006. Replaces the old `Math.random()` page.
- **Region:** security incidents and OT/network vulnerabilities carry a region; vulnerabilities without one count in every region.

## Tables (006, IT-owned, deterministic seed)

| Table | Content |
|---|---|
| `it_fact_vulnerability` | 569 vulnerabilities (`VULN-####`, no real CVE ids): severity, CVSS, exploit flag, asset class, assets affected, product/service, discovered / due / patched dates, status |
| `it_fact_security_incident` | 153 incidents: vector, severity 1–3, impact → detected → contained → resolved, region, department, product |
| `it_fact_threat_daily` | detected vs blocked per day per vector (5 vectors) |
| `it_fact_phishing_sim` | monthly campaigns × 8 departments: sent, clicked, reported |
| `it_fact_security_risk` | 14-entry risk register: likelihood, impact, owner, status, treatment, review date |

Patch SLA by severity (it_config): Critical 15 d, High 30, Medium 60, Low 90.

## KPIs (Δ vs prior window)

Open critical (and high) · Past patch SLA (critical/high open beyond due date) · Patch SLA compliance (patched in window on time ÷ patched in window) · Security incidents · Median time to detect (detected − impact start) · Median time to contain (contained − detected) · Phishing click rate (latest campaign vs previous month, with trend sparkline) · Threats blocked (block rate).

## Visuals

| Visual | Detail |
|---|---|
| Risk matrix | 5 × 5 likelihood × impact; cell colour = band (L × I: Low < 5, Medium 5–9, High 10–14, Critical ≥ 15) and a count; select a cell to filter the register |
| Risk register | title, band and score, owner, status, review date, treatment |
| Open vulnerabilities by age | stacked bars per severity by age band (0–15, 16–30, 31–60, 61–90, 90+ days; ordinal blue), past-SLA counts beneath |
| By asset class | open, past SLA, average days to close critical/high |
| Threats by vector | small multiples: weekly detections per vector (complete 7-day buckets ending at the as-of date), totals and block rate |
| Phishing simulations | clicked vs reported share by month |
| Security incidents by vector | bars, P1/P2 in tooltip |
| Open vulnerabilities table | filter by severity; overdue in red |

## Stories

OT devices at the plants patch ~6× slower (22 of 39 open OT vulnerabilities are past SLA); credential stuffing against the dealer portal spiked in Aug-2026 (18 incidents, 8× attack volume); phishing click rate fell from 14.3% to 5.8%.
