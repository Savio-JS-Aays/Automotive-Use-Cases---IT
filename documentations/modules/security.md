# Module — Security

- **Route:** `/security`
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

## Filters (redesign 2026-10-07)

- **Sidebar (global, shown on this page only):** **Department** (security incidents + phishing simulations; store `secDepartment`) and **Asset Class** (vulnerabilities; `secAsset`), plus Region and Date Range.
- **Region:** filters vulnerabilities (rows with no region count everywhere) and incidents.
- **Not filterable by region or department:** the threat feed (`it_fact_threat_daily`) and phishing totals by region.
- **URL:** `?tab=threats`, `?sinc=` (security incident drawer).

## KPIs (value only; computed in the browser by `secData.js → secKpis`, equal to `it_sec_overview.kpis` when unfiltered)

| KPI | Formula | Follows | Click |
|---|---|---|---|
| Open Critical Vulnerabilities | open, severity Critical | Region, Asset Class | table → Critical |
| Past Patch SLA | open Critical/High with due date < as-of | Region, Asset Class | table → Past SLA (all severities) |
| Patch SLA Compliance | patched in window on/before due ÷ patched in window | Region, Asset Class | — |
| Security Incidents | detected in window | Region, Department | → Security incidents |
| Median Time to Detect / Contain | median(detected − impact) / median(contained − detected), detected in window | Region, Department | — |
| Phishing Click Rate | latest campaign month: clicked ÷ sent | Department | → Threats tab |
| Threats Blocked | Σ blocked in window | — | → Threats tab |

Live (30 d, unfiltered): 2 · 8 · 55% · 12 · 49.4 h (shown 2.1 d) · 30.7 h · 5.8% · 1,34,626.

## Layout: KPI cards, then two tabs

| Tab | Visual | Detail |
|---|---|---|
| **Vulnerabilities** | **Open vulnerabilities** (`VulnBreakdown.jsx`; replaces "by age" + "by asset class") | Rows **by severity or by asset class**; bars **split by age band** (0–15 / 16–30 / 31–60 / 61–90 / 90+ d, ordinal blue) **or by severity**; checkboxes Past SLA only, Exploit available only. Right column: "n open · n past SLA (red) · avg age". Summary: open, past SLA, oldest. A row filters the list below. Live: 84 open · 29 past SLA · oldest 492 d (Low, OT device). |
| | **Open vulnerability list** (`VulnTable.jsx`) | Filters: Severity, Asset class, Patch SLA (past / within), Product, Exploit available, Search, Sort (severity, then oldest / oldest / CVSS / due soonest / most assets). "n of N open", CSV export. Data: `it_sec_vulns(p_status null, p_limit 2000)`. |
| **Threats & incidents** | **Threats by vector** (`ThreatExplorer.jsx`) | Five tiles (Intrusion attempt, Phishing email, Credential stuffing, Malware, DDoS): detected · % blocked · **got through** · **real incidents** (matching incident vector; Intrusion attempt ↔ Vulnerability exploit). Default chart: attempts that got through, per week, stacked by vector. **Select a tile → drill-down:** daily trend (Got through / Detected), **Phishing simulations** for Phishing email (monthly click vs report, latest campaign by department), and that vector's incidents (→ drawer). |
| | **Security incidents** (`SecurityIncidents.jsx`; replaces "by vector") | Group by **Vector / Department / Month**, stacked by severity (Sev 1 critical → Sev 3 moderate); **Range** this window / last 12 months; **Status** filter. Summary line; a bar filters the incident list underneath (→ drawer). Live 30 d: 12 · 3 sev 1–2 · 2 not resolved · most Credential stuffing (5); 12 months: 116, Dealer Network 43. |
| (drawer) | **Security incident** (`SecIncidentDrawer.jsx`, `?sinc=`) | Severity, status, department, region, product, lifecycle (impact → detected → contained → resolved, with time to detect / contain), and the matching threat feed on the detection day (detected · blocked · got through). |

Data: `it_sec_overview` (window + check), `it_sec_vulns`, read-only table reads of `it_fact_security_incident`, `it_fact_phishing_sim`, `it_fact_threat_daily` (12 months), `it_dim_software`, `dim_region`. No DB change.

The risk matrix and register were removed earlier (2026-10-07); `it_fact_security_risk` still feeds the Overview Top risks.

## Stories

OT devices at the plants patch ~6× slower (22 of 39 open OT vulnerabilities are past SLA); credential stuffing against the dealer portal spiked in Aug-2026 (18 incidents, 8× attack volume); phishing click rate fell from 14.3% to 5.8%.
