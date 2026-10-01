# IT Enterprise Dashboard — Documentation

Baseline documentation of the IT vertical app ("Fleet Command" / `enterprise-dashboard`) as it stood on **2026-10-01**, written ahead of the redesign.

## Reading order

| # | File | What it covers |
|---|---|---|
| 01 | [01_project_overview.md](01_project_overview.md) | Purpose, stack, how to run, folder layout, status of each module |
| 02 | [02_architecture.md](02_architecture.md) | Data flow, routing, global filters, shared components, styling |
| 03 | [03_database_schema.md](03_database_schema.md) | Full schema reference: every table, key, FK, view, RLS policy, with an ER diagram |
| 04 | [04_table_ownership_and_change_rules.md](04_table_ownership_and_change_rules.md) | Which tables IT owns, which are shared, and what each class allows |
| 05 | [05_data_profile.md](05_data_profile.md) | What is actually in the IT tables: row counts, ranges, value distributions, data-quality defects |
| 06 | [06_kpi_formula_catalog.md](06_kpi_formula_catalog.md) | Every KPI and chart in one table: formula, source, real/mock |
| 07 | [07_known_issues.md](07_known_issues.md) | Bugs and data defects, ranked by severity |
| 08 | [08_glossary.md](08_glossary.md) | IT-ops and automotive terms used in the app |
| 09 | [09_redesign_roadmap.md](09_redesign_roadmap.md) | Suggested KPIs, charts and drill-downs for the remaining modules |
| — | [modules/](modules/) | One file per module: data sources, KPIs, charts, formulas, issues |
| — | [schema/changelog.md](schema/changelog.md) | Log of every schema change made during the redesign |
| — | [schema/migrations/](schema/migrations/README.md) | Numbered `it_` migrations and how to apply them |

## Module docs

| Module | Route | File |
|---|---|---|
| Executive Overview | `/executive-overview` | [modules/executive-overview.md](modules/executive-overview.md) |
| App Reliability | `/app-reliability` | [modules/app-reliability.md](modules/app-reliability.md) |
| Change Impact | `/change-impact` | [modules/change-impact.md](modules/change-impact.md) |
| Security | `/security` | [modules/security.md](modules/security.md) |
| Licensing & Subscriptions | `/licensing-subs` | [modules/licensing-and-subs.md](modules/licensing-and-subs.md) |

## Key facts in one paragraph

React 19 + Vite SPA on a **shared** Supabase Postgres. Redesigned on 2026-10-01 around a **Licensing & Subscriptions suite** (six pages: Overview, Spend & Budget, Usage & Optimisation, Renewals & Contracts, Vendors, Documents & Compliance) with documents linked at every level. Overview, App Reliability, Change Impact and Security remain as built earlier; Sites & OT and Data & Integration were dropped (code in `legacy/`). Everything reads IT-owned data through `it_*` Postgres RPCs (migrations 001–010 in [schema/migrations/](schema/migrations/README.md), tested locally, **to be applied to the shared DB**) and is anchored to an as-of date of 2026-09-30. Services are named in `it_dim_service`, linked to the software catalogue `it_dim_software`; the shared `dim_application` is no longer used. Docs 03–05 and 07 also record the pre-redesign baseline.
