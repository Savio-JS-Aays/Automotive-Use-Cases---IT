-- 009_it_lic_suite_seed.sql
-- Deterministic seed for the licensing suite (after 008). Re-runnable: undoes its own rows first.
--
-- Stories
--   * Keyloop (unsigned MSA): invoices from Jul-2026 are Disputed; its vendor security assessment expired Aug-2026
--   * Oracle TMS: the Jun-2026 quarterly invoice is Overdue (PO reconciliation)
--   * Autodesk: true-up invoice for 22 over-deployed seats (Aug-2026)
--   * Oracle and Salesforce assessments expire within 90 days; Autodesk and Zendesk have none on file
--   * Zendesk (SaaS) has no data processing agreement on file
--   * 8 products show a renewal chain (expired predecessor contract) with the price change at renewal

begin;

-- ---------------------------------------------------------------------------
-- Undo previous run of this file
-- ---------------------------------------------------------------------------
delete from public.it_license_document where invoice_id is not null or doc_type = 'Security Assessment'
   or contract_id in (select contract_id from public.it_fact_contract where status = 'Expired');
delete from public.it_fact_invoice;
update public.it_fact_contract set predecessor_contract_id = null, renewal_quote_inr = null;
delete from public.it_fact_contract where status = 'Expired';

-- ---------------------------------------------------------------------------
-- Vendors
-- ---------------------------------------------------------------------------
update public.it_dim_vendor v set payment_terms_days = x.terms, preferred = x.pref, certifications = x.certs, account_team = x.team
from (values
  ('V01', 45, true,  '{ISO 27001,SOC 2}'::text[],  'Strategic account team'),
  ('V02', 30, true,  '{ISO 27001,SOC 2}'::text[],  'Strategic account team'),
  ('V03', 60, true,  '{ISO 27001,IEC 62443}'::text[], 'Industry account team'),
  ('V04', 30, true,  '{ISO 27001}'::text[],        'Group IT (intra-group)'),
  ('V05', 30, false, '{}'::text[],                 'Reseller partner'),
  ('V06', 45, true,  '{ISO 27001,SOC 2}'::text[],  'Strategic account team'),
  ('V07', 30, true,  '{ISO 27001,SOC 2}'::text[],  'Licensing partner (CSP)'),
  ('V08', 30, false, '{SOC 2}'::text[],            'Customer success team'),
  ('V09', 45, false, '{ISO 27001}'::text[],        'Strategic account team'),
  ('V10', 30, true,  '{SOC 2}'::text[],            'Reseller partner'),
  ('V11', 30, true,  '{SOC 2}'::text[],            'Reseller partner'),
  ('V12', 30, false, '{}'::text[],                 'Reseller partner'),
  ('V13', 30, false, '{SOC 2}'::text[],            'Customer success team')
) x(vendor_id, terms, pref, certs, team)
where v.vendor_id = x.vendor_id;

-- ---------------------------------------------------------------------------
-- Predecessor (expired) contracts: renewal history
-- ---------------------------------------------------------------------------
create temp table s_pred (contract_id text, software_id text, start_date date, end_date date, factor numeric) on commit drop;
insert into s_pred values
  ('CT-2021-101', 'SW01', '2021-04-01', '2024-03-31', 0.82),
  ('CT-2020-102', 'SW02', '2020-11-15', '2023-11-14', 0.78),
  ('CT-2021-103', 'SW03', '2021-07-01', '2024-06-30', 0.86),
  ('CT-2022-105', 'SW05', '2022-04-01', '2025-03-31', 0.74),
  ('CT-2021-107', 'SW07', '2021-01-01', '2023-12-31', 0.70),
  ('CT-2021-108', 'SW08', '2021-04-01', '2024-03-31', 0.80),
  ('CT-2020-110', 'SW10', '2020-12-21', '2023-12-20', 0.88),
  ('CT-2022-112', 'SW12', '2022-06-01', '2025-05-31', 0.83);

insert into public.it_fact_contract (contract_id, software_id, vendor_id, contract_name, start_date, end_date, auto_renew,
  notice_period_days, billing_frequency, annual_value_inr, original_currency, uplift_cap_pct, status, cost_center_vertical,
  procurement_owner, predecessor_contract_id, renewal_quote_inr)
select p.contract_id, c.software_id, c.vendor_id,
       s.software_name || ' subscription ' || to_char(p.start_date, 'YYYY') || '-' || to_char(p.end_date, 'YY'),
       p.start_date, p.end_date, false, c.notice_period_days, c.billing_frequency,
       round(c.annual_value_inr * p.factor), c.original_currency, c.uplift_cap_pct, 'Expired',
       c.cost_center_vertical, c.procurement_owner, null, null
from s_pred p
join public.it_fact_contract c on c.software_id = p.software_id and c.status = 'Active'
join public.it_dim_software s on s.software_id = p.software_id;

update public.it_fact_contract c set predecessor_contract_id = p.contract_id
from s_pred p where c.software_id = p.software_id and c.status = 'Active';

-- Historical documents of the expired contracts (superseded, signed)
insert into public.it_license_document (document_id, contract_id, doc_type, title, version, effective_date, file_url, is_current, is_signed, uploaded_at)
select c.contract_id || '-' || d.suffix, c.contract_id, d.doc_type, d.title_prefix || s.software_name || ' (' || to_char(c.start_date, 'YYYY') || '-' || to_char(c.end_date, 'YY') || ')',
       '1.0', c.start_date, '/contracts/' || c.contract_id || '/' || c.contract_id || '-' || d.suffix || '.pdf',
       false, true, (c.start_date + time '10:00')::timestamptz
from public.it_fact_contract c
join public.it_dim_software s using (software_id)
cross join (values ('MSA', 'MSA', 'Master Subscription Agreement - '), ('OF1', 'Order Form', 'Order Form - ')) d(suffix, doc_type, title_prefix)
where c.status = 'Expired';

-- ---------------------------------------------------------------------------
-- Renewal quotes on the contract (where a quote document exists)
-- ---------------------------------------------------------------------------
update public.it_fact_contract c set renewal_quote_inr = round(c.annual_value_inr * (1 + c.uplift_cap_pct / 100))
where exists (select 1 from public.it_license_document d where d.contract_id = c.contract_id and d.doc_type = 'Renewal Quote');

-- ---------------------------------------------------------------------------
-- Invoices: one per billing period of each active contract, Apr-2025 .. as-of (billed in advance)
-- ---------------------------------------------------------------------------
create temp table s_inv on commit drop as
select c.contract_id, c.software_id, c.vendor_id, s.software_name, c.billing_frequency,
       ps::date as period_start,
       (ps + case c.billing_frequency when 'Monthly' then interval '1 month' when 'Quarterly' then interval '3 months' else interval '1 year' end - interval '1 day')::date as period_end,
       round(c.annual_value_inr * case c.billing_frequency when 'Monthly' then 1 / 12.0 when 'Quarterly' then 0.25 else 1 end, 2) as amount,
       v.payment_terms_days
from public.it_fact_contract c
join public.it_dim_software s using (software_id)
join public.it_dim_vendor v on v.vendor_id = c.vendor_id
cross join lateral generate_series(c.start_date::timestamp, timestamp '2026-09-30',
  case c.billing_frequency when 'Monthly' then interval '1 month' when 'Quarterly' then interval '3 months' else interval '1 year' end) ps
where c.status = 'Active' and ps >= timestamp '2025-04-01';

insert into public.it_fact_invoice (invoice_id, contract_id, software_id, vendor_id, description, period_start, period_end,
  invoice_date, due_date, paid_date, amount_inr, tax_inr, status, note)
select 'INV-' || i.software_id || '-' || to_char(i.period_start, 'YYYYMMDD'), i.contract_id, i.software_id, i.vendor_id,
       i.software_name || ' — ' || case i.billing_frequency
         when 'Monthly' then to_char(i.period_start, 'Mon YYYY')
         when 'Quarterly' then 'quarter from ' || to_char(i.period_start, 'DD Mon YYYY')
         else 'annual subscription ' || to_char(i.period_start, 'DD Mon YYYY') || ' – ' || to_char(i.period_end, 'DD Mon YYYY') end,
       i.period_start, i.period_end, i.period_start, i.period_start + i.payment_terms_days,
       case when x.status = 'Paid' then greatest(i.period_start, i.period_start + i.payment_terms_days - floor(public.it_hash01(i.contract_id || i.period_start::text || 'pd') * 12)::int) end,
       i.amount, round(i.amount * 0.18, 2), x.status, x.note
from s_inv i
cross join lateral (
  select case
           when i.software_id = 'SW05' and i.period_start >= date '2026-07-01' then 'Disputed'
           when i.software_id = 'SW10' and i.period_start between date '2026-06-01' and date '2026-06-30' then 'Overdue'
           when i.period_start + i.payment_terms_days > date '2026-09-30' then 'Due'
           else 'Paid' end as status,
         case
           when i.software_id = 'SW05' and i.period_start >= date '2026-07-01' then 'Payment withheld until the master agreement is signed'
           when i.software_id = 'SW10' and i.period_start between date '2026-06-01' and date '2026-06-30' then 'Awaiting purchase-order reconciliation'
         end as note
) x;

-- Autodesk true-up (matches the Aug-2026 spend line)
insert into public.it_fact_invoice values
  ('INV-SW13-TRUEUP-202608', 'CT-2024-013', 'SW13', 'V12', 'Autodesk Inventor & AutoCAD — true-up for 22 seats over entitlement',
   date '2025-01-15', date '2026-08-31', date '2026-08-20', date '2026-09-19', date '2026-09-15',
   22 * 7400 * 12, round(22 * 7400 * 12 * 0.18, 2), 'Paid', 'Annual licence compliance true-up');

-- One document per invoice (replaces the single "latest invoice" placeholder from 002)
delete from public.it_license_document where doc_type = 'Invoice';
insert into public.it_license_document (document_id, contract_id, vendor_id, invoice_id, doc_type, title, version, effective_date,
                                        file_url, is_current, is_signed, uploaded_at)
select 'DOC-' || i.invoice_id, i.contract_id, i.vendor_id, i.invoice_id, 'Invoice', 'Invoice ' || i.invoice_id || ' - ' || i.description,
       '1.0', i.invoice_date, '/contracts/' || i.contract_id || '/' || i.invoice_id || '.pdf', true, false,
       (i.invoice_date + time '09:00')::timestamptz
from public.it_fact_invoice i;

-- ---------------------------------------------------------------------------
-- Vendor security assessments (vendor-level documents with an expiry date)
-- ---------------------------------------------------------------------------
insert into public.it_license_document (document_id, contract_id, vendor_id, doc_type, title, version, effective_date, expiry_date,
                                        file_url, is_current, is_signed, uploaded_at)
select 'SA-' || v.vendor_id, null, v.vendor_id, 'Security Assessment',
       'Vendor Security Assessment ' || to_char(x.eff, 'YYYY') || ' - ' || v.vendor_name, '1.0', x.eff, x.eff + 365,
       '/contracts/vendors/SA-' || v.vendor_id || '.pdf', true, true, (x.eff + time '10:00')::timestamptz
from public.it_dim_vendor v
join (values
  ('V01', date '2026-03-10'), ('V02', date '2025-12-01'), ('V03', date '2026-02-18'), ('V04', date '2026-05-05'),
  ('V05', date '2025-08-01'), ('V06', date '2026-04-22'), ('V07', date '2026-01-14'), ('V08', date '2026-06-09'),
  ('V09', date '2025-11-15'), ('V10', date '2026-03-30'), ('V11', date '2026-02-02')
) x(vendor_id, eff) using (vendor_id);           -- V12 Autodesk and V13 Zendesk: none on file

-- Zendesk: DPA missing
delete from public.it_license_document where document_id = 'CT-2024-015-DPA';

commit;

analyze public.it_fact_invoice, public.it_license_document, public.it_fact_contract;
