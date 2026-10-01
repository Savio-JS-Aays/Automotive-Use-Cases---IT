-- 001_it_licensing_schema.sql
-- IT Licensing & Subscriptions: new IT-owned tables (prefix it_).
-- Touches no existing table. The only shared table referenced is dim_region (FK, read-only join).
-- Re-runnable: drops and recreates the it_ licensing objects (and their data; re-run 002 afterwards).

begin;

drop table if exists public.it_license_document cascade;
drop table if exists public.it_fact_software_spend_monthly cascade;
drop table if exists public.it_fact_license_assignment cascade;
drop table if exists public.it_fact_license_usage_monthly cascade;
drop table if exists public.it_fact_entitlement cascade;
drop table if exists public.it_fact_contract cascade;
drop table if exists public.it_dim_software cascade;
drop table if exists public.it_dim_vendor cascade;
drop table if exists public.it_license_config cascade;

-- Deterministic pseudo-random number in [0,1) from a text seed. Used by the seed so data is reproducible.
drop function if exists public.it_hash01(text);
create function public.it_hash01(seed text)
returns numeric
language sql immutable parallel safe
set search_path = ''
as $$ select (('x' || substr(md5(seed), 1, 8))::bit(32)::bigint & 2147483647)::numeric / 2147483648 $$;

create table public.it_license_config (
  key         text primary key,
  value       text not null,
  description text
);

create table public.it_dim_vendor (
  vendor_id       text primary key,
  vendor_name     text not null,
  vendor_category text,
  risk_tier       text check (risk_tier in ('Low', 'Medium', 'High')),
  support_tier    text,
  hq_country      text
);

create table public.it_dim_software (
  software_id       text primary key,
  software_name     text not null,
  short_name        text not null,          -- compact label for charts
  vendor_id         text not null references public.it_dim_vendor (vendor_id),
  category          text not null,
  deployment        text check (deployment in ('SaaS', 'On-prem', 'Hybrid')),
  business_vertical text not null,
  criticality_tier  int check (criticality_tier between 1 and 3),
  business_owner    text,
  description       text
);

create table public.it_fact_contract (
  contract_id          text primary key,
  software_id          text not null references public.it_dim_software (software_id),
  vendor_id            text not null references public.it_dim_vendor (vendor_id),
  contract_name        text not null,
  start_date           date not null,
  end_date             date not null,
  auto_renew           boolean not null default false,
  notice_period_days   int not null default 60,
  billing_frequency    text check (billing_frequency in ('Monthly', 'Quarterly', 'Annual')),
  annual_value_inr     numeric(14, 2) not null,
  original_currency    text not null default 'INR',
  uplift_cap_pct       numeric(5, 2),
  status               text not null check (status in ('Active', 'Expired', 'Terminated')),
  cost_center_vertical text,
  procurement_owner    text,
  check (end_date > start_date)
);

create table public.it_fact_entitlement (
  entitlement_id       text primary key,
  contract_id          text not null references public.it_fact_contract (contract_id),
  software_id          text not null references public.it_dim_software (software_id),
  edition              text not null,
  license_metric       text not null check (license_metric in ('Named user', 'Concurrent user', 'Device', 'Employee')),
  seats_purchased      int not null check (seats_purchased >= 0),
  unit_price_inr_month numeric(12, 2) not null,
  unique (software_id, edition)
);

-- Monthly usage snapshot per software x edition x region.
-- seats_allocated = the region's share of the purchased entitlement (so the region filter can work).
create table public.it_fact_license_usage_monthly (
  software_id      text not null references public.it_dim_software (software_id),
  edition          text not null,
  region_id        varchar(50) not null references public.dim_region (region_id),
  month_start      date not null check (extract(day from month_start) = 1),
  seats_allocated  int not null,
  seats_assigned   int not null,
  seats_active_90d int not null,
  seats_active_30d int not null,
  primary key (software_id, edition, region_id, month_start),
  foreign key (software_id, edition) references public.it_fact_entitlement (software_id, edition),
  check (seats_active_30d <= seats_active_90d and seats_active_90d <= seats_assigned)
);

-- One row per assigned seat at the as-of date. Employee identity is a synthetic alias only.
create table public.it_fact_license_assignment (
  assignment_id   text primary key,
  software_id     text not null references public.it_dim_software (software_id),
  edition         text not null,
  employee_alias  text not null,
  department      text not null,
  region_id       varchar(50) not null references public.dim_region (region_id),
  assigned_date   date not null,
  last_login_date date,
  status          text not null check (status in ('Active', 'Inactive 30-90d', 'Dormant', 'Never used')),
  foreign key (software_id, edition) references public.it_fact_entitlement (software_id, edition)
);

create table public.it_fact_software_spend_monthly (
  software_id   text not null references public.it_dim_software (software_id),
  region_id     varchar(50) not null references public.dim_region (region_id),
  month_start   date not null check (extract(day from month_start) = 1),
  budget_inr    numeric(14, 2) not null,
  actual_inr    numeric(14, 2),          -- null for months after the as-of date
  invoice_count int not null default 0,
  note          text,
  primary key (software_id, region_id, month_start)
);

create table public.it_license_document (
  document_id    text primary key,
  contract_id    text not null references public.it_fact_contract (contract_id),
  doc_type       text not null check (doc_type in ('MSA', 'Order Form', 'SOW', 'DPA', 'SLA', 'Renewal Quote', 'Invoice')),
  title          text not null,
  version        text not null,
  effective_date date,
  file_url       text not null,          -- relative path served by the app (public/contracts/...)
  file_type      text not null default 'pdf',
  size_kb        int,
  is_current     boolean not null default true,
  is_signed      boolean not null default false,
  uploaded_at    timestamptz not null default now()
);

-- Indexes for FK and filter columns
create index it_ix_software_vendor      on public.it_dim_software (vendor_id);
create index it_ix_contract_software    on public.it_fact_contract (software_id);
create index it_ix_contract_end         on public.it_fact_contract (end_date);
create index it_ix_entitlement_contract on public.it_fact_entitlement (contract_id);
create index it_ix_usage_month          on public.it_fact_license_usage_monthly (month_start, region_id);
create index it_ix_assign_sw_login      on public.it_fact_license_assignment (software_id, last_login_date);
create index it_ix_assign_region        on public.it_fact_license_assignment (region_id);
create index it_ix_spend_month          on public.it_fact_software_spend_monthly (month_start, region_id);
create index it_ix_document_contract    on public.it_license_document (contract_id);

-- Security: read-only for the public (anon) key. Default privileges grant ALL to anon, so revoke writes explicitly.
do $$
declare t text;
begin
  foreach t in array array[
    'it_license_config', 'it_dim_vendor', 'it_dim_software', 'it_fact_contract', 'it_fact_entitlement',
    'it_fact_license_usage_monthly', 'it_fact_license_assignment', 'it_fact_software_spend_monthly', 'it_license_document'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy it_public_read on public.%I for select using (true)', t);
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);
  end loop;
end $$;

commit;
