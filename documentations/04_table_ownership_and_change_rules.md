# 04 — Table Ownership and Schema Change Rules

The Supabase `public` schema is shared by the IT, Telematics, Warranty, Sales, Logistics and Service-desk apps. The redesign may change the schema only within the rules below. They match the user's instruction and the Warranty team's `Warranty/docs/schema/change-guidelines.md`.

## The three rules

| # | Object class | Allowed | Not allowed |
|---|---|---|---|
| 1 | **New tables / views / materialized views / functions** | Create, populate, index, add RLS. Prefix IT-only objects with **`it_`** (e.g. `it_dim_service`, `it_fact_license`, `it_v_incident_enriched`, `it_rpc_exec_kpis`). | — |
| 2 | **Shared tables** (used by another vertical) | Add new **nullable** columns (or columns with a default) and fill **only those new columns**. | Renaming or retyping columns, changing constraints, updating or deleting existing values or rows, inserting rows that change row counts other apps see, dropping anything, NOT NULL without a default, FKs that reject existing rows. |
| 3 | **IT-owned tables** | Anything: retype, rename, add constraints, FKs and indexes, regenerate data, truncate and reseed. | — (log every change in [schema/changelog.md](schema/changelog.md)) |

## Classification

### IT-owned — modify freely

| Table | Rows | Used by app today | Evidence nobody else uses it |
|---|---|---|---|
| fact_app_metrics | 5,000 | Exec Overview, App Reliability, IT-OT | Only appears in Telematics/Warranty schema dumps and docs, never in their `src/` |
| fact_incidents | 1,500 | Exec Overview, Change Impact, IT-OT | same |
| fact_alerts | 6,000 | — | same |
| fact_deployments | 2,250 | Change Impact | same |
| fact_batch_jobs | 2,000 | — | same |
| fact_network_events | 5,000 | — | same |
| fact_data_quality | 730 | — | Same. It is about telemetry packets, so **confirm with the Telematics owner before regenerating** (Telematics code does not read it today). |

Warranty's `table-ownership.md` lists all of the above as "Other domain → IT operations", which agrees.

### Shared — add columns only

| Table | Why shared | IT implication |
|---|---|---|
| **dim_application** | `dim_vehicle.application_id` → Telematics uses it as the vehicle **duty cycle** filter via `v_vehicle_context` (4 hooks + layout) | Do **not** turn it into a software catalogue. Create `it_dim_application` (or `it_dim_service`) instead. `fact_app_metrics` is IT-owned, so its FK can be repointed to the new IT table. |
| dim_date, dim_region, dim_location, dim_customer, dim_vehicle, dim_v_model, dim_dealer | Used by every vertical | Join freely, add columns only if truly needed (prefer an `it_` bridge table) |
| fact_sales_transaction and the other Sales/Logistics/Service tables | Other domains | Read-only for IT (e.g. business-impact overlays) |

## Recommended pattern for the redesign

- New IT dimensions: `it_dim_service` (SRV001…; name, owning team, tier, linked `it_application_id`, business vertical, region/site) and `it_dim_application` (software catalogue: SAP S/4HANA, Salesforce, Xentry, DMS, MES…).
- New facts where data doesn't exist: licensing (`it_fact_license_*`), security (`it_fact_security_incident`, `it_fact_vulnerability`), change linkage (`it_bridge_change_incident`) and so on.
- Regenerate IT-owned facts (rule 3) so they are internally consistent: resolution after open, `mttr_minutes` = timestamp diff, date_id = timestamp date, data ending at a fixed "as-of" date.
- Put KPI maths in Postgres (`it_v_*` views, `it_*` RPC functions) to stay under the anon role's 3 s statement timeout. That is the approach Warranty took.

## Checklist for every schema change

1. Check the table's class above.
2. Write it as a numbered, re-runnable migration: `documentations/schema/migrations/NNN_it_description.sql`.
3. New tables: `ENABLE ROW LEVEL SECURITY` + a `FOR SELECT USING (true)` policy, and `REVOKE INSERT, UPDATE, DELETE … FROM anon` (default privileges grant ALL to anon).
4. Index every FK and filter column the app queries (`date_id`, `service_id`, `application_id`, `location_id`).
5. Log it in [schema/changelog.md](schema/changelog.md) (date, migration, tables, class, reason).
6. Update [05_data_profile.md](05_data_profile.md) and the affected module doc.

## Status after the redesign (2026-10-01)

- `fact_app_metrics` no longer has an FK to the shared `dim_application`; IT services live in `it_dim_service` (→ `it_dim_software`). `dim_application` was not modified.
- New IT-owned objects: licensing (`it_license_config`, `it_dim_vendor`, `it_dim_software`, `it_fact_contract`, `it_fact_entitlement`, `it_fact_license_usage_monthly`, `it_fact_license_assignment`, `it_fact_software_spend_monthly`, `it_license_document`), operations (`it_config`, `it_dim_service`, `it_bridge_change_incident`), security (`it_fact_vulnerability`, `it_fact_security_incident`, `it_fact_threat_daily`, `it_fact_phishing_sim`, `it_fact_security_risk`), function `it_hash01`, and all `it_lic_*`, `it_ops_*`, `it_rel_*`, `it_chg_*`, `it_sec_*`, `it_site_*`, `it_data_*` RPCs.
- Shared tables used only as FK targets / joins: `dim_date`, `dim_region`, `dim_location`. No shared table was altered and no rows were added to one.

- 2026-10-01 (later): Sites & OT and Data & Integration were dropped, so 004/005 no longer touch `fact_batch_jobs`, `fact_network_events` or `fact_data_quality`; their data and schema stay as originally found. 008–010 add `it_fact_invoice` and extend the `it_` licensing tables.
