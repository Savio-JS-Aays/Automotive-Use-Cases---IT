-- 008_it_lic_suite_schema.sql
-- Licensing suite: invoices, contract history, renewal quotes, vendor attributes, and documents linked at
-- vendor and invoice level (not only contract level). IT-owned tables only (all created by 001).
-- Re-runnable. Run after 001-003; re-run 009 and 010 afterwards.

begin;

-- Vendors: commercial attributes for the vendor register (no personal names: account team is a role)
alter table public.it_dim_vendor add column if not exists payment_terms_days int;
alter table public.it_dim_vendor add column if not exists preferred          boolean not null default false;
alter table public.it_dim_vendor add column if not exists certifications     text[] not null default '{}';
alter table public.it_dim_vendor add column if not exists account_team       text;

-- Contracts: renewal chain and the renewal quote on the table
alter table public.it_fact_contract add column if not exists predecessor_contract_id text;
alter table public.it_fact_contract add column if not exists renewal_quote_inr       numeric(14, 2);
alter table public.it_fact_contract drop constraint if exists it_fact_contract_predecessor_fk;
alter table public.it_fact_contract add constraint it_fact_contract_predecessor_fk
  foreign key (predecessor_contract_id) references public.it_fact_contract (contract_id);

-- Invoices (cash view; it_fact_software_spend_monthly stays the accrual view)
drop table if exists public.it_fact_invoice cascade;
create table public.it_fact_invoice (
  invoice_id   text primary key,
  contract_id  text not null references public.it_fact_contract (contract_id),
  software_id  text not null references public.it_dim_software (software_id),
  vendor_id    text not null references public.it_dim_vendor (vendor_id),
  description  text not null,
  period_start date not null,
  period_end   date not null,
  invoice_date date not null,
  due_date     date not null,
  paid_date    date,
  amount_inr   numeric(14, 2) not null,
  tax_inr      numeric(14, 2) not null,
  status       text not null check (status in ('Paid', 'Due', 'Overdue', 'Disputed')),
  note         text,
  check (period_end >= period_start and due_date >= invoice_date),
  check ((status = 'Paid') = (paid_date is not null))
);
create index it_ix_invoice_contract on public.it_fact_invoice (contract_id);
create index it_ix_invoice_date     on public.it_fact_invoice (invoice_date);
create index it_ix_invoice_status   on public.it_fact_invoice (status);

-- Documents: contract-level, vendor-level (security assessments) or invoice-level
alter table public.it_license_document alter column contract_id drop not null;
alter table public.it_license_document add column if not exists vendor_id   text;
alter table public.it_license_document add column if not exists invoice_id  text;
alter table public.it_license_document add column if not exists expiry_date date;
alter table public.it_license_document drop constraint if exists it_license_document_vendor_fk;
alter table public.it_license_document add constraint it_license_document_vendor_fk foreign key (vendor_id) references public.it_dim_vendor (vendor_id);
alter table public.it_license_document drop constraint if exists it_license_document_invoice_fk;
alter table public.it_license_document add constraint it_license_document_invoice_fk foreign key (invoice_id) references public.it_fact_invoice (invoice_id);
alter table public.it_license_document drop constraint if exists it_license_document_doc_type_check;
alter table public.it_license_document add constraint it_license_document_doc_type_check check (doc_type in
  ('MSA', 'Order Form', 'SOW', 'DPA', 'SLA', 'Renewal Quote', 'Invoice', 'Security Assessment'));
alter table public.it_license_document drop constraint if exists it_license_document_owner_ck;
alter table public.it_license_document add constraint it_license_document_owner_ck check (contract_id is not null or vendor_id is not null);
create index if not exists it_ix_document_vendor  on public.it_license_document (vendor_id);
create index if not exists it_ix_document_invoice on public.it_license_document (invoice_id);

-- Read-only for the public key
alter table public.it_fact_invoice enable row level security;
create policy it_public_read on public.it_fact_invoice for select using (true);
revoke insert, update, delete, truncate on public.it_fact_invoice from anon, authenticated;
grant select on public.it_fact_invoice to anon, authenticated;

commit;
