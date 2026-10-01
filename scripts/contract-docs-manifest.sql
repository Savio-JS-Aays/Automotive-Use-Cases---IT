-- Exports the manifest read by scripts/generate-contract-docs.mjs (all it_license_document rows: contract-, vendor-
-- and invoice-level). Run with psql in tuples-only mode against a DB with migrations 001-002 and 008-009 applied:
--   psql "$DB" -tA -f scripts/contract-docs-manifest.sql > scripts/contract-docs.json
select jsonb_pretty(jsonb_agg(jsonb_build_object(
  'document_id', d.document_id, 'contract_id', d.contract_id, 'doc_type', d.doc_type, 'title', d.title, 'version', d.version,
  'effective_date', d.effective_date, 'expiry_date', d.expiry_date, 'file_url', d.file_url, 'is_signed', d.is_signed, 'is_current', d.is_current,
  'contract_name', c.contract_name, 'contract_status', c.status, 'start_date', c.start_date, 'end_date', c.end_date, 'auto_renew', c.auto_renew,
  'notice_period_days', c.notice_period_days, 'billing_frequency', c.billing_frequency, 'annual_value_inr', c.annual_value_inr,
  'original_currency', c.original_currency, 'uplift_cap_pct', c.uplift_cap_pct, 'procurement_owner', c.procurement_owner,
  'software_name', s.software_name, 'deployment', s.deployment, 'business_owner', s.business_owner,
  'vendor_name', v.vendor_name, 'vendor_category', v.vendor_category, 'risk_tier', v.risk_tier, 'hq_country', v.hq_country,
  'certifications', v.certifications, 'payment_terms_days', v.payment_terms_days,
  'invoice', case when i.invoice_id is null then null else jsonb_build_object(
    'invoice_id', i.invoice_id, 'description', i.description, 'period_start', i.period_start, 'period_end', i.period_end,
    'invoice_date', i.invoice_date, 'due_date', i.due_date, 'amount_inr', i.amount_inr, 'tax_inr', i.tax_inr, 'status', i.status, 'note', i.note) end,
  'entitlements', (
    select jsonb_agg(jsonb_build_object('edition', e.edition, 'metric', e.license_metric, 'seats', e.seats_purchased,
                                        'unit_price_inr_month', e.unit_price_inr_month) order by e.unit_price_inr_month desc)
    from it_fact_entitlement e where e.software_id = c.software_id)
) order by d.document_id))
from it_license_document d
left join it_fact_contract c on c.contract_id = d.contract_id
left join it_dim_software s on s.software_id = c.software_id
join it_dim_vendor v on v.vendor_id = coalesce(d.vendor_id, s.vendor_id)
left join it_fact_invoice i on i.invoice_id = d.invoice_id;
