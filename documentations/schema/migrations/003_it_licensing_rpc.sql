-- 003_it_licensing_rpc.sql
-- Read-only RPC functions for the Licensing & Subscriptions module. All return jsonb.
-- Filter contract (p_filters jsonb, every key optional; null / '' = no filter):
--   { "region": "REG001", "vertical": "Manufacturing", "vendor": "V03", "category": "PLM", "software": "SW03" }
-- Region scoping: seat and spend facts carry region_id directly; contract-level money (ACV, renewal exposure)
-- is apportioned by the region's share of the product's purchased seats.

begin;

-- Config row as typed columns
create or replace function public.it_lic_cfg()
returns table (as_of date, cur_month date, prev_month date, fy_start date, target numeric,
               dormant_days int, renewal_window int, decision_window int)
language sql stable set search_path = public as $$
  with c as (select jsonb_object_agg(key, value) j from it_license_config)
  select (j->>'as_of_date')::date,
         date_trunc('month', (j->>'as_of_date')::date)::date,
         (date_trunc('month', (j->>'as_of_date')::date) - interval '3 months')::date,
         make_date(extract(year from (j->>'as_of_date')::date)::int
                   - case when extract(month from (j->>'as_of_date')::date) < (j->>'fy_start_month')::int then 1 else 0 end,
                   (j->>'fy_start_month')::int, 1),
         (j->>'target_utilisation')::numeric,
         (j->>'dormant_days')::int,
         (j->>'renewal_window_days')::int,
         (j->>'decision_window_days')::int
  from c
$$;

-- Software ids matching the non-region filters
create or replace function public.it_lic_sw(p_filters jsonb)
returns table (software_id text)
language sql stable set search_path = public as $$
  select s.software_id from it_dim_software s
  where (nullif(p_filters->>'vertical', '') is null or s.business_vertical = p_filters->>'vertical')
    and (nullif(p_filters->>'vendor', '')   is null or s.vendor_id         = p_filters->>'vendor')
    and (nullif(p_filters->>'category', '') is null or s.category          = p_filters->>'category')
    and (nullif(p_filters->>'software', '') is null or s.software_id       = p_filters->>'software')
$$;

-- ---------------------------------------------------------------------------
-- Portfolio: one object per product (drives the register, matrix, breakdowns)
-- ---------------------------------------------------------------------------
create or replace function public.it_lic_portfolio(p_filters jsonb default '{}'::jsonb)
returns jsonb
language sql stable set search_path = public as $$
  with cfg as (select * from it_lic_cfg()),
  reg as (select nullif(p_filters->>'region', '') r),
  u as (
    select u.month_start, u.software_id, u.seats_allocated a, u.seats_assigned asg,
           u.seats_active_90d a90, u.seats_active_30d a30, e.unit_price_inr_month price
    from it_fact_license_usage_monthly u
    join it_fact_entitlement e using (software_id, edition)
    cross join cfg cross join reg
    where u.software_id in (select software_id from it_lic_sw(p_filters))
      and u.month_start in (cfg.cur_month, cfg.prev_month)
      and (reg.r is null or u.region_id = reg.r)
  ),
  cur as (
    select software_id,
           sum(a) purchased, sum(asg) assigned, sum(a90) active90, sum(a30) active30,
           sum(a * price) monthly_cost,
           sum(greatest(a - asg, 0) * price * 12) shelf_unassigned,
           sum((asg - a90) * price * 12) shelf_dormant,
           sum(greatest(asg - a, 0) * price * 12) trueup
    from u cross join cfg where u.month_start = cfg.cur_month group by software_id
  ),
  prev as (
    select software_id, sum(a30)::numeric / nullif(sum(a), 0) util_prev
    from u cross join cfg where u.month_start = cfg.prev_month group by software_id
  ),
  share as (
    select x.software_id,
           sum(x.seats_allocated) filter (where reg.r is null or x.region_id = reg.r)::numeric / nullif(sum(x.seats_allocated), 0) s
    from it_fact_license_usage_monthly x cross join cfg cross join reg
    where x.month_start = cfg.cur_month group by x.software_id
  ),
  spend as (
    select sp.software_id,
           sum(sp.actual_inr) filter (where sp.month_start between cfg.fy_start and cfg.cur_month) ytd_actual,
           sum(sp.budget_inr) filter (where sp.month_start between cfg.fy_start and cfg.cur_month) ytd_budget,
           sum(sp.budget_inr) filter (where sp.month_start between cfg.fy_start and (cfg.fy_start + interval '11 months')::date) fy_budget
    from it_fact_software_spend_monthly sp cross join cfg cross join reg
    where reg.r is null or sp.region_id = reg.r
    group by sp.software_id
  ),
  docs as (
    select contract_id, count(*) doc_count,
           bool_or(doc_type = 'MSA' and is_current and is_signed) has_signed_msa
    from it_license_document group by contract_id
  )
  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.annual_cost desc), '[]'::jsonb)
  from (
    select s.software_id, s.software_name, s.short_name, s.vendor_id, v.vendor_name, s.category, s.deployment,
           s.business_vertical, s.criticality_tier, s.business_owner,
           c.contract_id, c.start_date, c.end_date, c.auto_renew, c.notice_period_days, c.billing_frequency,
           c.original_currency, c.uplift_cap_pct,
           round(c.annual_value_inr * sh.s) annual_cost,
           cur.purchased, cur.assigned, cur.active90, cur.active30,
           round(cur.active30::numeric / nullif(cur.purchased, 0), 4) utilisation,
           round(prev.util_prev, 4) utilisation_prev,
           round(cur.monthly_cost) monthly_cost,
           round(cur.shelf_unassigned) shelf_unassigned, round(cur.shelf_dormant) shelf_dormant,
           round(cur.shelf_unassigned + cur.shelf_dormant) shelfware, round(cur.trueup) trueup,
           round(cur.monthly_cost / nullif(cur.active30, 0)) cost_per_active_user,
           c.end_date - cfg.as_of days_to_renewal,
           c.end_date - c.notice_period_days notice_deadline,
           c.end_date - c.notice_period_days - cfg.as_of days_to_notice,
           round(spend.ytd_actual) ytd_actual, round(spend.ytd_budget) ytd_budget, round(spend.fy_budget) fy_budget,
           coalesce(docs.doc_count, 0) doc_count,
           not coalesce(docs.has_signed_msa, false) missing_signed_msa,
           case when cur.assigned > cur.purchased then 'True-up'
                when cur.active30::numeric / nullif(cur.purchased, 0) < 0.6 then 'Right-size'
                when cur.active30::numeric / nullif(cur.purchased, 0) < cfg.target then 'Review'
                else 'Renew' end recommendation
    from cur
    join it_dim_software s using (software_id)
    join it_dim_vendor v using (vendor_id)
    join it_fact_contract c on c.software_id = s.software_id and c.status = 'Active'
    join share sh on sh.software_id = s.software_id
    left join prev on prev.software_id = s.software_id
    left join spend on spend.software_id = s.software_id
    left join docs on docs.contract_id = c.contract_id
    cross join cfg
  ) t
$$;

-- ---------------------------------------------------------------------------
-- KPI block, rolled up from the portfolio plus spend history and prior-period deltas
-- ---------------------------------------------------------------------------
create or replace function public.it_lic_kpis(p_filters jsonb default '{}'::jsonb)
returns jsonb
language sql stable set search_path = public as $$
  with cfg as (select * from it_lic_cfg()),
  p as (select * from jsonb_to_recordset(it_lic_portfolio(p_filters)) as x(
          software_id text, annual_cost numeric, purchased int, assigned int, active30 int, utilisation_prev numeric,
          monthly_cost numeric, shelf_unassigned numeric, shelf_dormant numeric, shelfware numeric, trueup numeric,
          days_to_renewal int, days_to_notice int, ytd_actual numeric, ytd_budget numeric, missing_signed_msa boolean)),
  prior as (  -- same months of the previous fiscal year
    select sum(sp.actual_inr) prior_ytd_actual
    from it_fact_software_spend_monthly sp cross join cfg
    where sp.software_id in (select software_id from p)
      and (nullif(p_filters->>'region', '') is null or sp.region_id = p_filters->>'region')
      and sp.month_start between (cfg.fy_start - interval '1 year')::date and (cfg.cur_month - interval '1 year')::date
  ),
  prevu as (  -- portfolio utilisation and shelfware 3 months earlier
    select sum(u.seats_active_30d)::numeric / nullif(sum(u.seats_allocated), 0) util_prev,
           sum((greatest(u.seats_allocated - u.seats_assigned, 0) + u.seats_assigned - u.seats_active_90d) * e.unit_price_inr_month * 12) shelf_prev,
           sum(u.seats_allocated * e.unit_price_inr_month) / nullif(sum(u.seats_active_30d), 0) cpau_prev
    from it_fact_license_usage_monthly u join it_fact_entitlement e using (software_id, edition) cross join cfg
    where u.software_id in (select software_id from p) and u.month_start = cfg.prev_month
      and (nullif(p_filters->>'region', '') is null or u.region_id = p_filters->>'region')
  )
  select jsonb_build_object(
    'as_of', cfg.as_of, 'fy_start', cfg.fy_start, 'target_utilisation', cfg.target,
    'products', count(p.*),
    'acv', round(sum(p.annual_cost)),
    'ytd_actual', round(sum(p.ytd_actual)), 'ytd_budget', round(sum(p.ytd_budget)),
    'ytd_variance_pct', round((sum(p.ytd_actual) / nullif(sum(p.ytd_budget), 0) - 1)::numeric, 4),
    'prior_ytd_actual', round(max(prior.prior_ytd_actual)),
    'ytd_growth_pct', round((sum(p.ytd_actual) / nullif(max(prior.prior_ytd_actual), 0) - 1)::numeric, 4),
    'purchased', sum(p.purchased), 'assigned', sum(p.assigned), 'active30', sum(p.active30),
    'utilisation', round(sum(p.active30)::numeric / nullif(sum(p.purchased), 0), 4),
    'utilisation_prev', round(max(prevu.util_prev), 4),
    'shelfware', round(sum(p.shelfware)), 'shelf_unassigned', round(sum(p.shelf_unassigned)), 'shelf_dormant', round(sum(p.shelf_dormant)),
    'shelfware_prev', round(max(prevu.shelf_prev)),
    'savings_at_renewal_12m', coalesce(round(sum(p.shelfware) filter (where p.days_to_renewal <= 365)), 0),
    'renewal_exposure', coalesce(round(sum(p.annual_cost) filter (where p.days_to_renewal between 0 and cfg.renewal_window)), 0),
    'renewal_count', count(*) filter (where p.days_to_renewal between 0 and cfg.renewal_window),
    'decisions_due', count(*) filter (where p.days_to_notice between 0 and cfg.decision_window),
    'trueup', round(sum(p.trueup)), 'trueup_products', count(*) filter (where p.trueup > 0),
    'cost_per_active_user', round(sum(p.monthly_cost) / nullif(sum(p.active30), 0)),
    'cost_per_active_user_prev', round(max(prevu.cpau_prev)),
    'missing_signed_msa', count(*) filter (where p.missing_signed_msa)
  )
  from p cross join cfg cross join prior cross join prevu
  group by cfg.as_of, cfg.fy_start, cfg.target, cfg.renewal_window, cfg.decision_window
$$;

-- ---------------------------------------------------------------------------
-- Fiscal-year spend vs budget by month, with cumulative lines and a run-rate forecast
-- ---------------------------------------------------------------------------
create or replace function public.it_lic_spend_monthly(p_filters jsonb default '{}'::jsonb)
returns jsonb
language sql stable set search_path = public as $$
  with cfg as (select * from it_lic_cfg()),
  m as (
    select sp.month_start,
           sum(sp.budget_inr) budget,
           sum(sp.actual_inr) actual
    from it_fact_software_spend_monthly sp cross join cfg
    where sp.software_id in (select software_id from it_lic_sw(p_filters))
      and (nullif(p_filters->>'region', '') is null or sp.region_id = p_filters->>'region')
      and sp.month_start between cfg.fy_start and (cfg.fy_start + interval '11 months')::date
    group by sp.month_start
  ),
  py as (
    select (sp.month_start + interval '1 year')::date month_start, sum(sp.actual_inr) prior_actual
    from it_fact_software_spend_monthly sp cross join cfg
    where sp.software_id in (select software_id from it_lic_sw(p_filters))
      and (nullif(p_filters->>'region', '') is null or sp.region_id = p_filters->>'region')
      and sp.month_start between (cfg.fy_start - interval '1 year')::date and (cfg.fy_start - interval '1 month')::date
    group by 1
  ),
  w as (
    select m.*, py.prior_actual,
           sum(m.budget) over (order by m.month_start) cum_budget,
           case when m.month_start <= cfg.cur_month then sum(m.actual) over (order by m.month_start) end cum_actual,
           (select avg(x.actual) from m x where x.month_start > (cfg.cur_month - interval '3 months')::date and x.month_start <= cfg.cur_month) run_rate,
           (select sum(x.actual) from m x where x.month_start <= cfg.cur_month) cum_to_date,
           (extract(year from age(m.month_start, cfg.cur_month)) * 12 + extract(month from age(m.month_start, cfg.cur_month)))::int months_ahead
    from m left join py using (month_start) cross join cfg
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'month', month_start, 'budget', round(budget), 'actual', round(actual), 'prior_actual', round(prior_actual),
           'cum_budget', round(cum_budget), 'cum_actual', round(cum_actual),
           'cum_forecast', case when months_ahead >= 0 then round(cum_to_date + run_rate * months_ahead) end,
           'is_forecast', months_ahead > 0
         ) order by month_start), '[]'::jsonb)
  from w
$$;

-- Spend lines for one month (drill-down from the spend chart)
create or replace function public.it_lic_spend_month(p_filters jsonb, p_month date)
returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.actual desc nulls last), '[]'::jsonb)
  from (
    select s.software_id, s.software_name, s.business_vertical, s.category,
           round(sum(sp.budget_inr)) budget, round(sum(sp.actual_inr)) actual,
           max(sp.invoice_count) invoices, max(sp.note) note
    from it_fact_software_spend_monthly sp join it_dim_software s using (software_id)
    where sp.month_start = date_trunc('month', p_month)::date
      and sp.software_id in (select software_id from it_lic_sw(p_filters))
      and (nullif(p_filters->>'region', '') is null or sp.region_id = p_filters->>'region')
    group by s.software_id, s.software_name, s.business_vertical, s.category
  ) t
$$;

-- ---------------------------------------------------------------------------
-- Utilisation trend: month x product (client aggregates for the portfolio line)
-- ---------------------------------------------------------------------------
create or replace function public.it_lic_util_trend(p_filters jsonb default '{}'::jsonb)
returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.month, t.software_id), '[]'::jsonb)
  from (
    select u.month_start as month, u.software_id,
           sum(u.seats_allocated) purchased, sum(u.seats_assigned) assigned,
           sum(u.seats_active_90d) active90, sum(u.seats_active_30d) active30
    from it_fact_license_usage_monthly u
    where u.software_id in (select software_id from it_lic_sw(p_filters))
      and (nullif(p_filters->>'region', '') is null or u.region_id = p_filters->>'region')
    group by u.month_start, u.software_id
  ) t
$$;

-- ---------------------------------------------------------------------------
-- Reclaim candidates: seats with no login for >= dormant_days (or never used)
-- ---------------------------------------------------------------------------
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
  )
  select jsonb_build_object(
    'total_count', (select count(*) from r),
    'total_value', (select round(sum(annual_cost)) from r),
    'rows', coalesce((select jsonb_agg(row_to_json(x)::jsonb order by x.annual_cost desc, x.days_inactive desc)
                      from (select * from r order by annual_cost desc, days_inactive desc limit greatest(p_limit, 1)) x), '[]'::jsonb)
  )
$$;

-- ---------------------------------------------------------------------------
-- Product detail for the drill-down drawer (always all regions; region split included)
-- ---------------------------------------------------------------------------
create or replace function public.it_lic_product_detail(p_software_id text)
returns jsonb
language sql stable set search_path = public as $$
  with cfg as (select * from it_lic_cfg())
  select jsonb_build_object(
    'entitlements', (
      select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.unit_price_inr_month desc), '[]'::jsonb) from (
        select e.edition, e.license_metric, e.seats_purchased, e.unit_price_inr_month,
               e.seats_purchased * e.unit_price_inr_month * 12 annual_cost,
               sum(u.seats_assigned) assigned, sum(u.seats_active_90d) active90, sum(u.seats_active_30d) active30
        from it_fact_entitlement e
        join it_fact_license_usage_monthly u on u.software_id = e.software_id and u.edition = e.edition
        cross join cfg
        where e.software_id = p_software_id and u.month_start = cfg.cur_month
        group by e.edition, e.license_metric, e.seats_purchased, e.unit_price_inr_month) t),
    'regions', (
      select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.region_id), '[]'::jsonb) from (
        select u.region_id, g.region_name, sum(u.seats_allocated) purchased, sum(u.seats_assigned) assigned,
               sum(u.seats_active_90d) active90, sum(u.seats_active_30d) active30
        from it_fact_license_usage_monthly u join dim_region g using (region_id) cross join cfg
        where u.software_id = p_software_id and u.month_start = cfg.cur_month
        group by u.region_id, g.region_name) t),
    'trend', (
      select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.month), '[]'::jsonb) from (
        select u.month_start as month, sum(u.seats_allocated) purchased, sum(u.seats_assigned) assigned,
               sum(u.seats_active_90d) active90, sum(u.seats_active_30d) active30
        from it_fact_license_usage_monthly u
        where u.software_id = p_software_id
        group by u.month_start) t)
  )
$$;

-- ---------------------------------------------------------------------------
-- Contract documents (for the document drawer)
-- ---------------------------------------------------------------------------
create or replace function public.it_lic_documents(p_filters jsonb default '{}'::jsonb)
returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.software_name, t.contract_id, t.doc_order, t.version desc), '[]'::jsonb)
  from (
    select d.document_id, d.contract_id, c.contract_name, c.end_date, s.software_id, s.software_name, v.vendor_name,
           d.doc_type, d.title, d.version, d.effective_date, d.file_url, d.file_type, d.size_kb,
           d.is_current, d.is_signed,
           array_position(array['MSA','Order Form','SOW','SLA','DPA','Renewal Quote','Invoice'], d.doc_type) doc_order
    from it_license_document d
    join it_fact_contract c using (contract_id)
    join it_dim_software s on s.software_id = c.software_id
    join it_dim_vendor v on v.vendor_id = s.vendor_id
    where c.software_id in (select software_id from it_lic_sw(p_filters))
  ) t
$$;

-- Execute rights for the browser (functions are SECURITY INVOKER; table RLS still applies)
grant execute on function
  public.it_lic_cfg(), public.it_lic_sw(jsonb), public.it_lic_portfolio(jsonb), public.it_lic_kpis(jsonb),
  public.it_lic_spend_monthly(jsonb), public.it_lic_spend_month(jsonb, date), public.it_lic_util_trend(jsonb),
  public.it_lic_reclaim(jsonb, int), public.it_lic_product_detail(text), public.it_lic_documents(jsonb)
to anon, authenticated;

commit;

notify pgrst, 'reload schema';
