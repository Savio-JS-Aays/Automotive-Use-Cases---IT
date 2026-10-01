# Module — Licensing & Subscriptions (suite)

Rethought 2026-10-01 as a six-page suite that is the centre of the IT app. Documents are linked at every level (product, contract, vendor, renewal, invoice).

- **Routes:** `/licensing-subs` (Overview), `/spend`, `/usage`, `/renewals`, `/vendors`, `/documents` (all under `/licensing-subs/`)
- **Code:** `src/modules/licensing/` — `LicensingLayout.jsx` (section header, sub-nav, shared filters, hosts every drawer), `LicensingContext.js` (filters, `open.product / contract / vendor / docs`), `pages/*`, `drawers/*`, `charts/*`, `tables/*`, `DocumentList.jsx`, `constants.js`
- **Data:** Postgres RPCs `it_lic_*` (migrations 003 and 010) over IT-owned `it_` tables (001, 008). The earlier single-page version is in `legacy/src/modules/LicensingModule.single-page.jsx`.
- **Audience:** CIO, IT finance, software asset management (SAM), procurement, vendor management

## Conventions

- As-of date `2026-09-30` (`it_license_config`); Indian FY Apr–Mar; all money in ₹ (`lib/format.js`).
- Shared filters on every page (URL params): **Vertical**, **Vendor**, **Category**, plus the global **Region** (seats and spend are regional; contract values are apportioned by seat share). The global Date Range is hidden here.
- **URL-backed drill-downs** (open from any page, survive reload): `?sw=SW05&tab=Spend` product · `?contract=CT-…` · `?vendor_id=V05` · `?docs=` with `contract:CT-…`, `vendor:V05`, `invoice:INV-…`, `software:SW05`, `doc_type:Renewal Quote`, `missing` (gaps) or `all` · `?month=` spend month · `?dept=` usage department.

## Data model

| Table | Rows | Notes |
|---|---|---|
| it_license_config | 8 | as-of, FY start, thresholds |
| it_dim_vendor | 13 | + payment terms, preferred, certifications, account-team role |
| it_dim_software | 15 | catalogue with category, deployment, vertical, tier |
| it_fact_contract | 23 | 15 active + 8 expired predecessors (`predecessor_contract_id`), `renewal_quote_inr` on 5 |
| it_fact_entitlement | 19 | contract × edition |
| it_fact_license_usage_monthly | 1,710 | product × edition × region × month |
| it_fact_license_assignment | 19,476 | seat-level, synthetic employee alias |
| it_fact_software_spend_monthly | 1,800 | accrual view, budget vs actual |
| **it_fact_invoice** | 76 | cash view: one per billing period since Apr-2025, status Paid / Due / Overdue / Disputed |
| it_license_document | 164 | contract-, vendor- and invoice-level; `expiry_date` for vendor security assessments |

## Pages

### Overview
KPIs: Annual Contract Value · FY spend to date vs budget (+ forecast) · Utilisation · Shelfware · Savings at renewal (12 mo) · Renewals in 90 d (+ decisions due, uplift exposure) · True-up risk · Cost per active user. Action cards (decisions due, disputed/overdue invoices, critical documentation gaps) · value-for-money matrix · renewal timeline · spend by category · top savings at renewal · documentation gaps · subscription register (CSV).

### Spend & Budget
KPIs: spend to date · **full-year forecast vs FY budget** · growth vs last year · monthly run-rate · invoices due · invoices held up. Visuals: spend vs budget (monthly / cumulative + forecast; click a month for its products) · this FY vs last FY by month · **vendor Pareto** (bars on one ₹ axis, cumulative share as labels) · spend vs budget by vertical (click filters the suite) · spend by region. Tables: **budget variance by product** (forecast vs budget, YoY; CSV) · **invoice register** (status chips, invoice **PDF** and contract links, status filter, CSV).

### Usage & Optimisation
KPIs: utilisation · active users · dormant seats · unassigned seats · reclaimable now · saving at renewal · true-up risk · cost per active user. Visuals: seat funnel · utilisation trend · **utilisation heatmap product × month** · **product × region heatmap** (cells open the product) · seats by department (active / inactive / dormant; click filters the reclaim list). Tables: **optimisation opportunities** (per edition: recommended seats = ⌈active 90 d × 1.1⌉, reduction, saving at renewal, true-up, action; CSV) · reclaim candidates (CSV).

### Renewals & Contracts
KPIs: renewals in 90 d · decisions due ≤ 30 d · renewals in 12 months · **uplift exposure** (quote, else uplift cap) · quotes awaiting signature · auto-renew share. Visuals: renewal timeline (12 / 24 months) · renewal value by quarter (by recommended action) · uplift exposure by contract. Tables: **decision queue** (notice deadline, quote vs current, uplift, utilisation, action, **Quote PDF**) · **contract register** including expired contracts and the renewal chain (← predecessor / → successor).

### Vendors
KPIs: vendors · top-3 concentration · high-risk vendor spend · vendors needing attention · vendors without certifications. Visuals: vendor spend concentration · risk tier × contract-value grid (vendor names are links) · certification coverage. Table: **vendor register** (risk, products, annual value and share, FY spend, next renewal, payment terms, security-assessment status, documents).

### Documents & Compliance
KPIs: documents · % fully documented · unsigned MSAs · SaaS without DPA · quotes awaiting signature · assessments needing action · disputed/overdue invoices · open gaps. Visuals: **coverage matrix** — every active contract × MSA, Order Form, SLA, DPA, SOW, Renewal Quote, Invoices and Vendor assessment; each cell is an icon + a word (Signed / Unsigned / Awaiting / Missing / n/a) and links to the PDF or the gap. Lists: **gaps to chase** (most severe first) · **document library** (search; type and status filters; preview / open / download; chips to the product, contract and vendor).

## Drawers

| Drawer | Tabs / content |
|---|---|
| **Product** | Overview (recommendation + reasoning, contract and vendor links, entitlements) · Usage (funnel, seats by month, region split) · **Spend** (budget, forecast, invoices) · Reclaim · Risk (services, incidents, open vulnerabilities) · Documents |
| **Contract** | Terms (+ renewal quote vs current) · **History** (renewal chain with price change at each renewal) · Documents (full version timeline, signed status) · Invoices (each with PDF) |
| **Vendor** | Overview (profile, certifications, spend vs budget chart, products) · Contracts · Invoices · Documents (incl. the vendor security assessment) |
| **Documents** | Any scope above, or the gaps list |

## RPCs

003: `it_lic_cfg`, `it_lic_sw`, `it_lic_portfolio`, `it_lic_kpis`, `it_lic_spend_monthly`, `it_lic_spend_month`, `it_lic_util_trend`, `it_lic_reclaim` (now also `department`), `it_lic_product_detail`. 007: `it_lic_product_risk`. 010: `it_lic_kpis_ext` (adds forecast, run-rate, invoice, renewal-uplift and document KPIs), `it_lic_documents` (replaces 003's: contract / vendor / invoice / type / status filters), `it_lic_doc_coverage`, `it_lic_doc_gaps`, `it_lic_spend_breakdown`, `it_lic_budget_variance`, `it_lic_invoices`, `it_lic_usage_matrix`, `it_lic_department_usage`, `it_lic_optimisation`, `it_lic_renewals`, `it_lic_contracts`, `it_lic_contract_detail`, `it_lic_vendors`, `it_lic_vendor_detail`. All run in under 50 ms locally.

## Formulas (new in 010)

| Measure | Formula |
|---|---|
| Full-year forecast | spend to date + mean(last 3 actual months) × months left in the FY |
| Forecast vs budget | forecast ÷ FY budget − 1 |
| Uplift exposure | (renewal quote, else annual value × (1 + uplift cap)) − annual value, contracts ending within 12 months |
| Recommended seats | ⌈seats active in 90 days × 1.1⌉ per edition; saving = (purchased − recommended)⁺ × unit price × 12 |
| Fully documented | active contracts with no required document missing or unsigned ÷ active contracts |
| Required documents | MSA and Order Form always; SLA for SaaS/Hybrid; DPA for SaaS; SOW for on-prem; Renewal Quote when the contract ends within 120 days |
| Assessment status | valid; expiring ≤ 90 d; expired; missing |
| Gap severity | critical: missing MSA/DPA, unsigned agreement, disputed invoice, expired/missing assessment; warning: quote awaiting signature, overdue invoice, assessment expiring |

## Documents (PDFs)

164 synthetic PDFs in `public/contracts/` (contracts and their order forms / SLAs / DPAs / SOWs / quotes, one PDF per invoice, vendor security assessments, and the historical documents of expired contracts), generated by `scripts/generate-contract-docs.mjs` from `scripts/contract-docs.json` (export: `scripts/contract-docs-manifest.sql`). Every page is watermarked "SYNTHETIC DEMO DOCUMENT — not a real agreement"; the buyer is fictional and no vendor branding is used. The generator rebuilds the folder on each run. To move to Supabase Storage later, upload the files and update `it_license_document.file_url`.

## Seeded stories (deterministic, 002 and 009)

| Story | Where it shows |
|---|---|
| Teamcenter utilisation fell 83% → 53% | matrix *Optimise*, heatmap, optimisation (55 Author seats to cut, ₹1.39 Cr/yr) |
| Tableau Viewer at ~40% | matrix *Review*, optimisation (₹59 L/yr) |
| Autodesk: 172 seats on 150; true-up invoice Aug-26; spend +37% vs budget | true-up KPI, funnel, invoice register, budget variance |
| ServiceNow (notice in 1 d) and Salesforce (15 d) auto-renew; Salesforce +28% at the last renewal and a quote at +7% | decision queue, contract History, uplift exposure |
| Keyloop: unsigned MSA draft, 3 invoices disputed, security assessment expired Aug-26, no certifications | coverage matrix, gaps, vendor drawer, invoice register |
| Oracle TMS: Jun-26 invoice overdue (PO reconciliation); assessment expiring in 46 d | invoice register, coverage matrix |
| Zendesk (SaaS) has no DPA; Autodesk and Zendesk have no vendor assessment | gaps, coverage matrix |
| Manufacturing budgeted ~6% below run-rate (+10.2% over) | spend by vertical |
