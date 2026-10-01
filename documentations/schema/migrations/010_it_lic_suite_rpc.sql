-- 010_it_lic_suite_rpc.sql
-- Read-only RPCs for the Licensing suite pages (Overview, Spend & Budget, Usage & Optimisation, Renewals & Contracts,
-- Vendors, Documents & Compliance). All SECURITY INVOKER, all return jsonb. Uses it_lic_cfg() / it_lic_sw() from 003.
-- Filter contract (p_filters jsonb, keys optional): region, vertical, vendor, category, software, plus page keys
-- (contract, doc_type, doc_status, invoice, invoice_status). Region applies to seat and spend facts only.

begin;

-- ---------------------------------------------------------------------------
-- Document coverage: one row per active contract, one cell per document type
-- ---------------------------------------------------------------------------
create or replace function public.it_lic_doc_coverage(p_filters jsonb default '{}'::jsonb)
returns jsonb
language sql stable set search_path = public as $$
  with cfg as (select * from it_lic_cfg()),
  c as (
    select c.*, s.software_name, s.short_name, s.deployment, s.vendor_id as sw_vendor, v.vendor_name
    from it_fact_contract c join it_dim_software s using (software_id) join it_dim_vendor v on v.vendor_id = s.vendor_id
    where c.status = 'Active' and c.software_id in (select software_id from it_lic_sw(p_filters))
  ),
  types as (select * from (values (1, 'MSA'), (2, 'Order Form'), (3, 'SLA'), (4, 'DPA'), (5, 'SOW'), (6, 'Renewal Quote')) t(ord, doc_type)),
  cells as (
    select c.contract_id, t.ord, t.doc_type,
           case t.doc_type when 'MSA' then true when 'Order Form' then true
                           when 'SLA' then c.deployment in ('SaaS', 'Hybrid') when 'DPA' then c.deployment = 'SaaS'
                           when 'SOW' then c.deployment = 'On-prem' when 'Renewal Quote' then c.end_date <= cfg.as_of + 120 end as required,
           d.document_id, d.file_url, d.is_signed, d.version
    from c cross join types t cross join cfg
    left join lateral (
      select * from it_license_document d where d.contract_id = c.contract_id and d.doc_type = t.doc_type and d.is_current
      order by d.effective_date desc limit 1) d on true
  ),
  inv as (
    select i.contract_id, count(*) n, count(*) filter (where i.status in ('Overdue', 'Disputed')) problem,
           (array_agg(d.document_id order by i.invoice_date desc))[1] latest_doc,
           (array_agg(d.file_url order by i.invoice_date desc))[1] latest_url
    from it_fact_invoice i left join it_license_document d on d.invoice_id = i.invoice_id
    group by i.contract_id
  ),
  sa as (
    select d.vendor_id, d.document_id, d.file_url, d.expiry_date
    from it_license_document d where d.doc_type = 'Security Assessment' and d.is_current
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'contract_id', c.contract_id, 'software_id', c.software_id, 'software_name', c.software_name, 'short_name', c.short_name,
    'vendor_id', c.sw_vendor, 'vendor_name', c.vendor_name, 'deployment', c.deployment, 'end_date', c.end_date,
    'cells', (select jsonb_agg(jsonb_build_object(
                'doc_type', x.doc_type, 'document_id', x.document_id, 'file_url', x.file_url, 'version', x.version,
                'status', case when x.document_id is null then case when x.required then 'missing' else 'na' end
                               when x.is_signed then 'signed'
                               when x.doc_type = 'Renewal Quote' then 'awaiting'
                               else 'unsigned' end) order by x.ord)
              from cells x where x.contract_id = c.contract_id),
    'invoices', jsonb_build_object('count', coalesce(inv.n, 0), 'problem', coalesce(inv.problem, 0),
                                   'document_id', inv.latest_doc, 'file_url', inv.latest_url,
                                   'status', case when inv.n is null then 'missing' when inv.problem > 0 then 'issue' else 'ok' end),
    'assessment', jsonb_build_object('document_id', sa.document_id, 'file_url', sa.file_url, 'expiry_date', sa.expiry_date,
                                     'status', case when sa.document_id is null then 'missing' when sa.expiry_date < cfg.as_of then 'expired'
                                                    when sa.expiry_date <= cfg.as_of + 90 then 'expiring' else 'valid' end)
  ) order by c.software_name), '[]'::jsonb)
  from c cross join cfg
  left join inv on inv.contract_id = c.contract_id
  left join sa on sa.vendor_id = c.sw_vendor
$$;

-- Gaps derived from coverage + invoices: what to chase, most severe first
create or replace function public.it_lic_doc_gaps(p_filters jsonb default '{}'::jsonb)
returns jsonb
language sql stable set search_path = public as $$
  with cov as (select jsonb_array_elements(it_lic_doc_coverage(p_filters)) r),
  g as (
    select case when cell->>'status' = 'missing' and cell->>'doc_type' in ('MSA', 'DPA') then 1
                when cell->>'status' = 'unsigned' then 1 else 2 end sev,
           jsonb_build_object(
             'severity', case when cell->>'status' = 'missing' and cell->>'doc_type' in ('MSA', 'DPA') or cell->>'status' = 'unsigned' then 'critical' else 'warning' end,
             'kind', case cell->>'status' when 'missing' then 'Missing ' || (cell->>'doc_type')
                                          when 'unsigned' then 'Unsigned ' || (cell->>'doc_type')
                                          else 'Renewal quote awaiting signature' end,
             'title', (r->>'software_name') || ' · ' || (r->>'contract_id'),
             'contract_id', r->>'contract_id', 'software_id', r->>'software_id', 'vendor_id', r->>'vendor_id',
             'document_id', cell->>'document_id', 'file_url', cell->>'file_url') item
    from cov cross join jsonb_array_elements(r->'cells') cell
    where cell->>'status' in ('missing', 'unsigned', 'awaiting')
    union all
    select distinct on (r->>'vendor_id')
           case when r->'assessment'->>'status' in ('expired', 'missing') then 1 else 2 end,
           jsonb_build_object(
             'severity', case when r->'assessment'->>'status' in ('expired', 'missing') then 'critical' else 'warning' end,
             'kind', 'Security assessment ' || (r->'assessment'->>'status'),
             'title', (r->>'vendor_name') || coalesce(' · expires ' || to_char((r->'assessment'->>'expiry_date')::date, 'DD Mon YYYY'), ''),
             'vendor_id', r->>'vendor_id', 'document_id', r->'assessment'->>'document_id', 'file_url', r->'assessment'->>'file_url')
    from cov where r->'assessment'->>'status' <> 'valid'
    union all
    select case i.status when 'Disputed' then 1 else 2 end,
           jsonb_build_object('severity', case i.status when 'Disputed' then 'critical' else 'warning' end,
             'kind', 'Invoice ' || lower(i.status), 'title', i.description || ' · ' || i.invoice_id,
             'contract_id', i.contract_id, 'software_id', i.software_id, 'vendor_id', i.vendor_id, 'invoice_id', i.invoice_id,
             'document_id', d.document_id, 'file_url', d.file_url, 'note', i.note)
    from it_fact_invoice i left join it_license_document d on d.invoice_id = i.invoice_id
    where i.status in ('Overdue', 'Disputed') and i.software_id in (select software_id from it_lic_sw(p_filters))
  )
  select coalesce(jsonb_agg(item order by sev, item->>'kind', item->>'title'), '[]'::jsonb) from g
$$;

-- ---------------------------------------------------------------------------
-- Documents (replaces 003's version): every level, more filters, linked entities
-- ---------------------------------------------------------------------------
create or replace function public.it_lic_documents(p_filters jsonb default '{}'::jsonb)
returns jsonb
language sql stable set search_path = public as $$
  with cfg as (select * from it_lic_cfg()),
  f as (select nullif(p_filters->>'contract', '') contract, nullif(p_filters->>'doc_type', '') doc_type,
               nullif(p_filters->>'doc_status', '') doc_status, nullif(p_filters->>'invoice', '') invoice,
               nullif(p_filters->>'vendor', '') vendor,
               coalesce(nullif(p_filters->>'software', ''), nullif(p_filters->>'vertical', ''), nullif(p_filters->>'category', '')) is not null as product_scoped)
  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.group_name, t.group_key, t.doc_order, t.effective_date desc), '[]'::jsonb)
  from (
    select d.document_id, d.doc_type, d.title, d.version, d.effective_date, d.expiry_date, d.file_url, d.file_type, d.size_kb,
           d.is_current, d.is_signed, d.contract_id, c.contract_name, c.status contract_status, c.end_date,
           s.software_id, s.software_name, coalesce(d.vendor_id, s.vendor_id) vendor_id, v.vendor_name,
           d.invoice_id, i.status invoice_status, i.amount_inr invoice_amount,
           coalesce(d.contract_id, 'vendor:' || d.vendor_id) group_key,
           coalesce(s.software_name, v.vendor_name) group_name,
           array_position(array['MSA','Order Form','SOW','SLA','DPA','Renewal Quote','Invoice','Security Assessment'], d.doc_type) doc_order,
           (d.expiry_date is not null and d.expiry_date <= cfg.as_of + 90) expiring
    from it_license_document d
    left join it_fact_contract c on c.contract_id = d.contract_id
    left join it_dim_software s on s.software_id = c.software_id
    join it_dim_vendor v on v.vendor_id = coalesce(d.vendor_id, s.vendor_id)
    left join it_fact_invoice i on i.invoice_id = d.invoice_id
    cross join cfg cross join f
    where (case when s.software_id is not null then s.software_id in (select software_id from it_lic_sw(p_filters))
                else not f.product_scoped and (f.vendor is null or d.vendor_id = f.vendor) end)
      and (f.contract is null or d.contract_id = f.contract)
      and (f.doc_type is null or d.doc_type = f.doc_type)
      and (f.invoice is null or d.invoice_id = f.invoice)
      and (f.doc_status is null
           or f.doc_status = 'current' and d.is_current
           or f.doc_status = 'superseded' and not d.is_current
           or f.doc_status = 'unsigned' and not d.is_signed and d.doc_type not in ('Invoice')
           or f.doc_status = 'expiring' and d.expiry_date is not null and d.expiry_date <= cfg.as_of + 90)
  ) t
$$;

-- ---------------------------------------------------------------------------
-- Spend & Budget
-- ---------------------------------------------------------------------------
create or replace function public.it_lic_spend_breakdown(p_filters jsonb default '{}'::jsonb)
returns jsonb
language sql stable set search_path = public as $$
  with cfg as (select * from it_lic_cfg()),
  sp as (
    select sp.*, s.vendor_id, v.vendor_name, s.category, s.business_vertical, g.region_name
    from it_fact_software_spend_monthly sp
    join it_dim_software s using (software_id) join it_dim_vendor v on v.vendor_id = s.vendor_id
    join dim_region g on g.region_id = sp.region_id
    where sp.software_id in (select software_id from it_lic_sw(p_filters))
      and (nullif(p_filters->>'region', '') is null or sp.region_id = p_filters->>'region')
  ),
  ytd as (select sp.* from sp, cfg where sp.month_start between cfg.fy_start and cfg.cur_month),
  vend as (
    select vendor_id, vendor_name, sum(actual_inr) actual, sum(budget_inr) budget
    from ytd group by vendor_id, vendor_name
  )
  select jsonb_build_object(
    'by_vendor', (select coalesce(jsonb_agg(jsonb_build_object('vendor_id', vendor_id, 'vendor_name', vendor_name,
                     'actual', round(actual), 'budget', round(budget), 'share', round(share, 4), 'cum_share', round(cum_share, 4))
                   order by actual desc), '[]'::jsonb)
                  from (select vend.*, actual / nullif(sum(actual) over (), 0) share,
                               sum(actual) over (order by actual desc rows unbounded preceding) / nullif(sum(actual) over (), 0) cum_share
                        from vend) z),
    'by_category', (select coalesce(jsonb_agg(jsonb_build_object('category', category, 'actual', round(a), 'budget', round(b)) order by a desc), '[]'::jsonb)
                    from (select category, sum(actual_inr) a, sum(budget_inr) b from ytd group by category) x),
    'by_region', (select coalesce(jsonb_agg(jsonb_build_object('region_id', region_id, 'region_name', region_name, 'actual', round(a), 'budget', round(b)) order by region_id), '[]'::jsonb)
                  from (select region_id, region_name, sum(actual_inr) a, sum(budget_inr) b from ytd group by region_id, region_name) x),
    'yoy', (select coalesce(jsonb_agg(jsonb_build_object('month', m.month_start, 'this_fy', round(m.a), 'last_fy', round(p.a)) order by m.month_start), '[]'::jsonb)
            from (select month_start, sum(actual_inr) a from sp, cfg where month_start between cfg.fy_start and (cfg.fy_start + interval '11 months')::date group by month_start) m
            left join (select (month_start + interval '1 year')::date month_start, sum(actual_inr) a from sp, cfg
                       where month_start between (cfg.fy_start - interval '1 year')::date and (cfg.fy_start - interval '1 month')::date group by 1) p using (month_start))
  )
$$;

create or replace function public.it_lic_budget_variance(p_filters jsonb default '{}'::jsonb)
returns jsonb
language sql stable set search_path = public as $$
  with cfg as (select * from it_lic_cfg()),
  sp as (
    select sp.software_id, sp.month_start, sum(sp.budget_inr) budget, sum(sp.actual_inr) actual
    from it_fact_software_spend_monthly sp, cfg
    where sp.software_id in (select software_id from it_lic_sw(p_filters))
      and (nullif(p_filters->>'region', '') is null or sp.region_id = p_filters->>'region')
      and sp.month_start between (cfg.fy_start - interval '1 year')::date and (cfg.fy_start + interval '11 months')::date
    group by sp.software_id, sp.month_start
  ),
  x as (
    select sp.software_id,
           sum(budget) filter (where month_start between cfg.fy_start and (cfg.fy_start + interval '11 months')::date) fy_budget,
           sum(budget) filter (where month_start between cfg.fy_start and cfg.cur_month) ytd_budget,
           sum(actual) filter (where month_start between cfg.fy_start and cfg.cur_month) ytd_actual,
           sum(actual) filter (where month_start between (cfg.fy_start - interval '1 year')::date and (cfg.cur_month - interval '1 year')::date) prior_ytd,
           avg(actual) filter (where month_start > (cfg.cur_month - interval '3 months')::date and month_start <= cfg.cur_month) run_rate,
           count(*) filter (where month_start > cfg.cur_month and month_start <= (cfg.fy_start + interval '11 months')::date) months_left
    from sp, cfg group by sp.software_id
  )
  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.forecast_variance desc nulls last), '[]'::jsonb)
  from (
    select x.software_id, s.software_name, s.short_name, s.business_vertical, s.category, v.vendor_name,
           round(x.fy_budget) fy_budget, round(x.ytd_budget) ytd_budget, round(x.ytd_actual) ytd_actual,
           round((x.ytd_actual / nullif(x.ytd_budget, 0) - 1)::numeric, 4) ytd_variance,
           round(x.ytd_actual + x.run_rate * x.months_left) forecast,
           round(((x.ytd_actual + x.run_rate * x.months_left) / nullif(x.fy_budget, 0) - 1)::numeric, 4) forecast_variance,
           round((x.ytd_actual / nullif(x.prior_ytd, 0) - 1)::numeric, 4) yoy
    from x join it_dim_software s using (software_id) join it_dim_vendor v on v.vendor_id = s.vendor_id
  ) t
$$;

create or replace function public.it_lic_invoices(p_filters jsonb default '{}'::jsonb)
returns jsonb
language sql stable set search_path = public as $$
  with cfg as (select * from it_lic_cfg())
  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.invoice_date desc, t.invoice_id), '[]'::jsonb)
  from (
    select i.invoice_id, i.contract_id, i.software_id, s.software_name, i.vendor_id, v.vendor_name, i.description,
           i.period_start, i.period_end, i.invoice_date, i.due_date, i.paid_date, i.amount_inr, i.tax_inr,
           i.amount_inr + i.tax_inr total_inr, i.status, i.note,
           case when i.status in ('Overdue', 'Disputed') then cfg.as_of - i.due_date end days_past_due,
           d.document_id, d.file_url
    from it_fact_invoice i
    join it_dim_software s using (software_id) join it_dim_vendor v on v.vendor_id = i.vendor_id
    left join it_license_document d on d.invoice_id = i.invoice_id
    cross join cfg
    where i.software_id in (select software_id from it_lic_sw(p_filters))
      and (nullif(p_filters->>'invoice_status', '') is null or i.status = p_filters->>'invoice_status')
      and (nullif(p_filters->>'contract', '') is null or i.contract_id = p_filters->>'contract')
  ) t
$$;

-- ---------------------------------------------------------------------------
-- Usage & Optimisation
-- ---------------------------------------------------------------------------
create or replace function public.it_lic_usage_matrix(p_filters jsonb default '{}'::jsonb)
returns jsonb
language sql stable set search_path = public as $$
  with cfg as (select * from it_lic_cfg()),
  u as (
    select u.*, s.short_name from it_fact_license_usage_monthly u join it_dim_software s using (software_id)
    where u.software_id in (select software_id from it_lic_sw(p_filters))
  )
  select jsonb_build_object(
    'by_month', (select coalesce(jsonb_agg(jsonb_build_object('software_id', software_id, 'short_name', short_name, 'month', month_start,
                    'util', round(a30::numeric / nullif(a, 0), 4), 'active30', a30, 'purchased', a) order by software_id, month_start), '[]'::jsonb)
                 from (select software_id, short_name, month_start, sum(seats_active_30d) a30, sum(seats_allocated) a from u
                       where nullif(p_filters->>'region', '') is null or region_id = p_filters->>'region'
                       group by software_id, short_name, month_start) x),
    'by_region', (select coalesce(jsonb_agg(jsonb_build_object('software_id', software_id, 'short_name', short_name, 'region_id', region_id,
                     'region_name', region_name, 'util', round(a30::numeric / nullif(a, 0), 4), 'active30', a30, 'purchased', a) order by software_id, region_id), '[]'::jsonb)
                  from (select u.software_id, u.short_name, u.region_id, g.region_name, sum(seats_active_30d) a30, sum(seats_allocated) a
                        from u join dim_region g using (region_id), cfg where u.month_start = cfg.cur_month
                        group by u.software_id, u.short_name, u.region_id, g.region_name) x)
  )
$$;

create or replace function public.it_lic_department_usage(p_filters jsonb default '{}'::jsonb)
returns jsonb
language sql stable set search_path = public as $$
  with cfg as (select * from it_lic_cfg())
  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.dormant_cost desc), '[]'::jsonb)
  from (
    select a.department, count(*) assigned,
           count(*) filter (where a.last_login_date >= cfg.as_of - 30) active30,
           count(*) filter (where a.last_login_date is null or a.last_login_date < cfg.as_of - cfg.dormant_days) dormant,
           coalesce(round(sum(e.unit_price_inr_month * 12) filter (where a.last_login_date is null or a.last_login_date < cfg.as_of - cfg.dormant_days)), 0) dormant_cost,
           count(distinct a.software_id) products
    from it_fact_license_assignment a
    join it_fact_entitlement e using (software_id, edition)
    cross join cfg
    where a.software_id in (select software_id from it_lic_sw(p_filters))
      and (nullif(p_filters->>'region', '') is null or a.region_id = p_filters->>'region')
    group by a.department
  ) t
$$;

create or replace function public.it_lic_optimisation(p_filters jsonb default '{}'::jsonb)
returns jsonb
language sql stable set search_path = public as $$
  with cfg as (select * from it_lic_cfg())
  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.annual_saving desc, t.trueup_cost desc), '[]'::jsonb)
  from (
    select x.*, greatest(x.purchased - x.recommended, 0) reduction,
           greatest(x.purchased - x.recommended, 0) * x.price * 12 annual_saving,
           greatest(x.assigned - x.purchased, 0) * x.price * 12 trueup_cost,
           case when x.assigned > x.purchased then 'True-up or reclaim'
                when x.purchased - x.recommended > 0 then 'Reduce at renewal'
                else 'Keep' end action
    from (
      select e.software_id, s.software_name, s.short_name, e.edition, e.unit_price_inr_month price,
             e.seats_purchased purchased, sum(u.seats_assigned) assigned, sum(u.seats_active_90d) active90, sum(u.seats_active_30d) active30,
             greatest(1, ceil(sum(u.seats_active_90d) * 1.1))::int recommended,
             c.contract_id, c.end_date, c.end_date - cfg.as_of days_to_renewal, c.end_date - c.notice_period_days notice_deadline
      from it_fact_entitlement e
      join it_dim_software s using (software_id)
      join it_fact_contract c on c.contract_id = e.contract_id
      join it_fact_license_usage_monthly u on u.software_id = e.software_id and u.edition = e.edition
      cross join cfg
      where u.month_start = cfg.cur_month and e.software_id in (select software_id from it_lic_sw(p_filters))
      group by e.software_id, s.software_name, s.short_name, e.edition, e.unit_price_inr_month, e.seats_purchased,
               c.contract_id, c.end_date, c.notice_period_days, cfg.as_of
    ) x
  ) t
$$;

-- ---------------------------------------------------------------------------
-- Renewals & Contracts
-- ---------------------------------------------------------------------------
create or replace function public.it_lic_renewals(p_filters jsonb default '{}'::jsonb, p_months int default 12)
returns jsonb
language sql stable set search_path = public as $$
  with cfg as (select * from it_lic_cfg()),
  p as (select * from jsonb_to_recordset(it_lic_portfolio(p_filters)) as x(software_id text, utilisation numeric, recommendation text,
          shelfware numeric, annual_cost numeric))
  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.days_to_notice), '[]'::jsonb)
  from (
    select c.contract_id, c.software_id, s.software_name, s.short_name, v.vendor_id, v.vendor_name,
           c.start_date, c.end_date, c.end_date - cfg.as_of days_to_renewal,
           c.end_date - c.notice_period_days notice_deadline, c.end_date - c.notice_period_days - cfg.as_of days_to_notice,
           c.auto_renew, c.uplift_cap_pct, round(c.annual_value_inr) annual_value, c.renewal_quote_inr,
           round(coalesce(c.renewal_quote_inr, c.annual_value_inr * (1 + c.uplift_cap_pct / 100)) - c.annual_value_inr) uplift_exposure,
           date_trunc('quarter', c.end_date)::date quarter,
           p.utilisation, p.recommendation, round(p.shelfware) shelfware,
           q.document_id quote_document_id, q.file_url quote_file_url, q.is_signed quote_signed,
           (select count(*) from it_license_document d where d.contract_id = c.contract_id) doc_count
    from it_fact_contract c
    join it_dim_software s using (software_id) join it_dim_vendor v on v.vendor_id = s.vendor_id
    join p on p.software_id = c.software_id
    left join it_license_document q on q.contract_id = c.contract_id and q.doc_type = 'Renewal Quote' and q.is_current
    cross join cfg
    where c.status = 'Active' and c.end_date between cfg.as_of and (cfg.as_of + make_interval(months => greatest(p_months, 1)))::date
  ) t
$$;

create or replace function public.it_lic_contracts(p_filters jsonb default '{}'::jsonb)
returns jsonb
language sql stable set search_path = public as $$
  with cfg as (select * from it_lic_cfg())
  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.status, t.end_date), '[]'::jsonb)
  from (
    select c.contract_id, c.contract_name, c.status, c.software_id, s.software_name, s.short_name, v.vendor_id, v.vendor_name,
           c.start_date, c.end_date, c.end_date - cfg.as_of days_to_renewal, c.auto_renew, c.notice_period_days, c.billing_frequency,
           round(c.annual_value_inr) annual_value, c.original_currency, c.uplift_cap_pct, c.renewal_quote_inr,
           c.predecessor_contract_id, (select n.contract_id from it_fact_contract n where n.predecessor_contract_id = c.contract_id) successor_contract_id,
           (select count(*) from it_license_document d where d.contract_id = c.contract_id) doc_count,
           exists (select 1 from it_license_document d where d.contract_id = c.contract_id and d.doc_type = 'MSA' and d.is_signed) signed_msa,
           (select count(*) from it_fact_invoice i where i.contract_id = c.contract_id) invoices,
           (select count(*) from it_fact_invoice i where i.contract_id = c.contract_id and i.status in ('Overdue', 'Disputed')) problem_invoices
    from it_fact_contract c
    join it_dim_software s using (software_id) join it_dim_vendor v on v.vendor_id = s.vendor_id
    cross join cfg
    where c.software_id in (select software_id from it_lic_sw(p_filters))
      and (coalesce((p_filters->>'include_expired')::boolean, true) or c.status = 'Active')
  ) t
$$;

create or replace function public.it_lic_contract_detail(p_contract_id text)
returns jsonb
language sql stable set search_path = public as $$
  with cfg as (select * from it_lic_cfg()),
  c as (select c.*, s.software_name, s.short_name, s.deployment, s.category, s.business_vertical, v.vendor_name, v.vendor_id vid
        from it_fact_contract c join it_dim_software s using (software_id) join it_dim_vendor v on v.vendor_id = s.vendor_id
        where c.contract_id = p_contract_id)
  select jsonb_build_object(
    'contract', (select row_to_json(x)::jsonb || jsonb_build_object(
                   'days_to_renewal', x.end_date - cfg.as_of, 'notice_deadline', x.end_date - x.notice_period_days,
                   'days_to_notice', x.end_date - x.notice_period_days - cfg.as_of) from c x, cfg),
    'entitlements', (select coalesce(jsonb_agg(jsonb_build_object('edition', e.edition, 'license_metric', e.license_metric,
                       'seats_purchased', e.seats_purchased, 'unit_price_inr_month', e.unit_price_inr_month,
                       'annual_cost', e.seats_purchased * e.unit_price_inr_month * 12) order by e.unit_price_inr_month desc), '[]'::jsonb)
                     from it_fact_entitlement e where e.contract_id = p_contract_id),
    'history', (select coalesce(jsonb_agg(jsonb_build_object('contract_id', h.contract_id, 'status', h.status, 'start_date', h.start_date,
                  'end_date', h.end_date, 'annual_value', round(h.annual_value_inr), 'change_pct', round(h.change_pct, 4))
                  order by h.start_date), '[]'::jsonb)
                from (select h.*, h.annual_value_inr / nullif(lag(h.annual_value_inr) over (order by h.start_date), 0) - 1 change_pct
                      from it_fact_contract h, c where h.software_id = c.software_id) h),
    'documents', (select coalesce(jsonb_agg(jsonb_build_object('document_id', d.document_id, 'doc_type', d.doc_type, 'title', d.title,
                    'version', d.version, 'effective_date', d.effective_date, 'file_url', d.file_url, 'is_current', d.is_current,
                    'is_signed', d.is_signed, 'invoice_id', d.invoice_id)
                    order by array_position(array['MSA','Order Form','SOW','SLA','DPA','Renewal Quote','Invoice'], d.doc_type), d.effective_date desc), '[]'::jsonb)
                  from it_license_document d where d.contract_id = p_contract_id),
    'invoices', (select coalesce(jsonb_agg(jsonb_build_object('invoice_id', i.invoice_id, 'description', i.description, 'invoice_date', i.invoice_date,
                   'due_date', i.due_date, 'amount_inr', i.amount_inr, 'status', i.status, 'note', i.note,
                   'file_url', (select d.file_url from it_license_document d where d.invoice_id = i.invoice_id limit 1)) order by i.invoice_date desc), '[]'::jsonb)
                 from it_fact_invoice i where i.contract_id = p_contract_id)
  )
$$;

-- ---------------------------------------------------------------------------
-- Vendors
-- ---------------------------------------------------------------------------
create or replace function public.it_lic_vendors(p_filters jsonb default '{}'::jsonb)
returns jsonb
language sql stable set search_path = public as $$
  with cfg as (select * from it_lic_cfg()),
  sw as (select software_id from it_lic_sw(p_filters)),
  spend as (
    select s.vendor_id, sum(sp.actual_inr) ytd
    from it_fact_software_spend_monthly sp join it_dim_software s using (software_id), cfg
    where sp.software_id in (select software_id from sw) and sp.month_start between cfg.fy_start and cfg.cur_month
      and (nullif(p_filters->>'region', '') is null or sp.region_id = p_filters->>'region')
    group by s.vendor_id
  ),
  x as (
    select v.vendor_id, v.vendor_name, v.vendor_category, v.risk_tier, v.support_tier, v.hq_country, v.preferred,
           v.payment_terms_days, v.certifications, v.account_team,
           count(distinct s.software_id) products,
           count(distinct c.contract_id) filter (where c.status = 'Active') active_contracts,
           sum(c.annual_value_inr) filter (where c.status = 'Active') acv,
           min(c.end_date) filter (where c.status = 'Active' and c.end_date >= cfg.as_of) next_renewal,
           (select count(*) from it_license_document d left join it_fact_contract dc on dc.contract_id = d.contract_id
              where d.vendor_id = v.vendor_id or dc.vendor_id = v.vendor_id) documents,
           (select d.expiry_date from it_license_document d where d.vendor_id = v.vendor_id and d.doc_type = 'Security Assessment' and d.is_current limit 1) assessment_expiry,
           (select count(*) from it_fact_invoice i where i.vendor_id = v.vendor_id and i.status in ('Overdue', 'Disputed')) problem_invoices
    from it_dim_vendor v
    join it_dim_software s on s.vendor_id = v.vendor_id and s.software_id in (select software_id from sw)
    left join it_fact_contract c on c.software_id = s.software_id
    cross join cfg
    group by v.vendor_id, cfg.as_of
  )
  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.acv desc nulls last), '[]'::jsonb)
  from (
    select x.*, round(x.acv) acv_rounded, round(coalesce(spend.ytd, 0)) ytd_spend,
           round(x.acv / nullif(sum(x.acv) over (), 0), 4) share,
           x.next_renewal - cfg.as_of days_to_renewal,
           case when x.assessment_expiry is null then 'missing' when x.assessment_expiry < cfg.as_of then 'expired'
                when x.assessment_expiry <= cfg.as_of + 90 then 'expiring' else 'valid' end assessment_status
    from x left join spend using (vendor_id), cfg
  ) t
$$;

create or replace function public.it_lic_vendor_detail(p_vendor_id text)
returns jsonb
language sql stable set search_path = public as $$
  with cfg as (select * from it_lic_cfg())
  select jsonb_build_object(
    'vendor', (select row_to_json(v)::jsonb from it_dim_vendor v where v.vendor_id = p_vendor_id),
    'products', (select coalesce(jsonb_agg(p order by (p->>'annual_cost')::numeric desc), '[]'::jsonb)
                 from jsonb_array_elements(it_lic_portfolio(jsonb_build_object('vendor', p_vendor_id))) p),
    'contracts', (select coalesce(jsonb_agg(c order by c->>'status', c->>'end_date'), '[]'::jsonb)
                  from jsonb_array_elements(it_lic_contracts(jsonb_build_object('vendor', p_vendor_id))) c),
    'spend', (select coalesce(jsonb_agg(jsonb_build_object('month', m, 'actual', round(a), 'budget', round(b)) order by m), '[]'::jsonb)
              from (select sp.month_start m, sum(sp.actual_inr) a, sum(sp.budget_inr) b
                    from it_fact_software_spend_monthly sp join it_dim_software s using (software_id), cfg
                    where s.vendor_id = p_vendor_id and sp.month_start between (cfg.fy_start - interval '1 year')::date and cfg.cur_month
                    group by sp.month_start) x),
    'invoices', (select coalesce(jsonb_agg(i order by i->>'invoice_date' desc), '[]'::jsonb)
                 from jsonb_array_elements(it_lic_invoices(jsonb_build_object('vendor', p_vendor_id))) i)
  )
$$;

-- Reclaim list (replaces 003's version): adds an optional department filter for the Usage page drill-down
create or replace function public.it_lic_reclaim(p_filters jsonb default '{}'::jsonb, p_limit int default 200)
returns jsonb
language sql stable set search_path = public as $$
  with cfg as (select * from it_lic_cfg()),
  r as (
    select a.assignment_id, a.software_id, s.software_name, a.edition, a.employee_alias, a.department, a.region_id,
           g.region_name, a.assigned_date, a.last_login_date, a.status,
           cfg.as_of - coalesce(a.last_login_date, a.assigned_date) days_inactive,
           e.unit_price_inr_month * 12 annual_cost
    from it_fact_license_assignment a
    join it_dim_software s using (software_id)
    join it_fact_entitlement e using (software_id, edition)
    join dim_region g on g.region_id = a.region_id
    cross join cfg
    where a.software_id in (select software_id from it_lic_sw(p_filters))
      and (nullif(p_filters->>'region', '') is null or a.region_id = p_filters->>'region')
      and (a.last_login_date is null or a.last_login_date < cfg.as_of - cfg.dormant_days)
      and (nullif(p_filters->>'department', '') is null or a.department = p_filters->>'department')
  )
  select jsonb_build_object(
    'total_count', (select count(*) from r),
    'total_value', (select round(sum(annual_cost)) from r),
    'rows', coalesce((select jsonb_agg(row_to_json(x)::jsonb order by x.annual_cost desc, x.days_inactive desc)
                      from (select * from r order by annual_cost desc, days_inactive desc limit greatest(p_limit, 1)) x), '[]'::jsonb)
  )
$$;

-- ---------------------------------------------------------------------------
-- Extra KPIs for the suite (adds to it_lic_kpis from 003)
-- ---------------------------------------------------------------------------
create or replace function public.it_lic_kpis_ext(p_filters jsonb default '{}'::jsonb)
returns jsonb
language sql stable set search_path = public as $$
  with cfg as (select * from it_lic_cfg()),
  sp as (select jsonb_array_elements(it_lic_spend_monthly(p_filters)) m),
  inv as (select * from jsonb_to_recordset(it_lic_invoices(p_filters)) as x(status text, amount_inr numeric, total_inr numeric)),
  ren as (select * from jsonb_to_recordset(it_lic_renewals(p_filters, 12)) as x(uplift_exposure numeric, auto_renew boolean, annual_value numeric, days_to_notice int)),
  gaps as (select jsonb_array_elements(it_lic_doc_gaps(p_filters)) g),
  cov as (select jsonb_array_elements(it_lic_doc_coverage(p_filters)) r)
  select it_lic_kpis(p_filters) || jsonb_build_object(
    'fy_budget', (select max((m->>'cum_budget')::numeric) from sp),
    'fy_forecast', (select (m->>'cum_forecast')::numeric from sp order by (m->>'month')::date desc limit 1),
    'run_rate_month', (select round(avg((m->>'actual')::numeric)) from (select m from sp where m->>'actual' is not null order by (m->>'month')::date desc limit 3) z),
    'invoices', (select count(*) from inv),
    'overdue_invoices', (select count(*) from inv where status = 'Overdue'),
    'disputed_invoices', (select count(*) from inv where status = 'Disputed'),
    'problem_invoice_value', (select round(sum(total_inr)) from inv where status in ('Overdue', 'Disputed')),
    'due_invoice_value', (select round(sum(total_inr)) from inv where status = 'Due'),
    'renewals_12m', (select count(*) from ren),
    'renewal_value_12m', (select round(sum(annual_value)) from ren),
    'uplift_exposure_12m', (select round(sum(uplift_exposure)) from ren),
    'auto_renew_share', (select round(avg(auto_renew::int), 4) from ren),
    'doc_gaps', (select count(*) from gaps),
    'doc_gaps_critical', (select count(*) from gaps where g->>'severity' = 'critical'),
    'contracts_fully_documented', (select count(*) from cov where not exists (
        select 1 from jsonb_array_elements(r->'cells') c where c->>'status' in ('missing', 'unsigned'))),
    'contracts_active', (select count(*) from cov),
    'saas_without_dpa', (select count(*) from cov, jsonb_array_elements(r->'cells') c where c->>'doc_type' = 'DPA' and c->>'status' = 'missing'),
    'quotes_awaiting', (select count(*) from cov, jsonb_array_elements(r->'cells') c where c->>'doc_type' = 'Renewal Quote' and c->>'status' = 'awaiting'),
    'assessments_attention', (select count(distinct r->>'vendor_id') from cov where r->'assessment'->>'status' <> 'valid'),
    'documents', (select count(*) from jsonb_array_elements(it_lic_documents(p_filters)))
  )
$$;

grant execute on function
  public.it_lic_doc_coverage(jsonb), public.it_lic_doc_gaps(jsonb), public.it_lic_documents(jsonb),
  public.it_lic_spend_breakdown(jsonb), public.it_lic_budget_variance(jsonb), public.it_lic_invoices(jsonb),
  public.it_lic_usage_matrix(jsonb), public.it_lic_department_usage(jsonb), public.it_lic_optimisation(jsonb),
  public.it_lic_renewals(jsonb, int), public.it_lic_contracts(jsonb), public.it_lic_contract_detail(text),
  public.it_lic_vendors(jsonb), public.it_lic_vendor_detail(text), public.it_lic_kpis_ext(jsonb)
to anon, authenticated;

commit;

notify pgrst, 'reload schema';
