# IT migrations

**Status: 001–010 are applied to the shared database (2026-10-01).** Only re-run a file deliberately; see the order rules below.

Run in order in the Supabase SQL editor (Dashboard → SQL Editor → paste → Run), or with `psql` over a direct connection. Each file is wrapped in a transaction and is re-runnable.

If you ever need the pre-redesign rows of the four tables 004 empties, they are in `enterprise-dashboard/legacy/db-backup-2026-10-01/*.csv` (load with `\copy … from … csv header` after re-creating the original columns).

| # | File | What it does |
|---|---|---|
| 001 | `001_it_licensing_schema.sql` | Drops and recreates the `it_` licensing tables (only `it_` objects), RLS read-only |
| 002 | `002_it_licensing_seed.sql` | Truncates and reseeds them (deterministic; about 25k rows) |
| 003 | `003_it_licensing_rpc.sql` | Creates the `it_lic_*` RPC functions and reloads the PostgREST schema cache |
| 004 | `004_it_ops_foundation.sql` | `it_config`, `it_dim_service`, change→incident bridge; reshapes the IT-owned facts; read-only RLS on all IT tables. **Truncates** fact_app_metrics, fact_incidents, fact_alerts, fact_deployments (not the batch-job, network or data-quality tables) |
| 005 | `005_it_ops_seed.sql` | Regenerates those four facts consistently |
| 006 | `006_it_security.sql` | Security tables + seed |
| 007 | `007_it_ops_rpc.sql` | RPCs for Overview, Reliability, Change, Security and the licensing Risk tab |
| 008 | `008_it_lic_suite_schema.sql` | Licensing suite: `it_fact_invoice`, contract renewal chain and quote, vendor attributes, vendor- and invoice-level documents |
| 009 | `009_it_lic_suite_seed.sql` | Invoices (76), 8 expired predecessor contracts, renewal quotes, vendor assessments and the stories |
| 010 | `010_it_lic_suite_rpc.sql` | 17 RPCs for the six licensing pages and drawers |

Re-running 001 wipes the licensing data, so always run 002 and 003 after it. Re-running 004 empties the four IT facts, so always run 005 after it (then 007). Re-running 001 or 002 empties the licensing tables including the 008/009 data (002 truncates with cascade), so re-run 008 (after 001), 009 and 010 afterwards. Safe full order: 001 → 010.

> 004 deletes the current (random, inconsistent) rows of IT-owned tables. Nothing outside IT reads them (checked in Telematics and Warranty `src/`), and the profile of the old data is kept in `../../05_data_profile.md`. Take a Supabase backup first if you want to keep the old rows.

## Check after applying

```sql
select count(*) from it_fact_license_assignment;            -- 19476
select it_lic_kpis('{}')->>'acv';                            -- 697608000
select it_lic_kpis('{}')->>'decisions_due';                  -- 2
select count(*) from fact_incidents;                         -- 601
select it_ops_overview('{"days":30}')->'kpis'->>'slo_attainment';   -- 0.6000
select count(*) from it_fact_vulnerability;                  -- 569
select count(*) from it_fact_invoice;                        -- 76
select it_lic_kpis_ext('{}')->>'doc_gaps';                   -- 16
```

Then open `/licensing-subs`. If the page says "Licensing data is not set up yet", PostgREST hasn't reloaded its schema cache: run `notify pgrst, 'reload schema';`.

## Contract PDFs

The 164 PDFs in `public/contracts/` match the seeded `it_license_document` rows (contracts, invoices, vendor assessments). If the seed's documents change, refresh the manifest and regenerate them:

1. `psql "$DB" -tA -f scripts/contract-docs-manifest.sql > scripts/contract-docs.json` (any DB with 001–002 and 008–009 applied, local or shared)
2. `node scripts/generate-contract-docs.mjs`

## Local test stack (how 001–010 were verified)

```bash
docker run -d --name it-lic-test -e POSTGRES_PASSWORD=test -p 54329:5432 public.ecr.aws/supabase/postgres:17.6.1.166
# load the real IT tables + dim_date/dim_region/dim_location/dim_application (DDL from enterprise-dashboard/schema.sql), then:
docker exec -i it-lic-test psql -U postgres -h localhost -v ON_ERROR_STOP=1 < 001_it_licensing_schema.sql   # likewise 002 … 007
```
