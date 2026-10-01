-- 007_it_ops_rpc.sql
-- Read-only RPC functions for Overview, App Reliability, Change Impact and Security,
-- plus the licensing product-risk tab. All SECURITY INVOKER (table RLS applies), all return jsonb.
--
-- Filter contract (p_filters jsonb, every key optional):
--   { "days": 7 | 30 | 90 (default 30), "region": "REG001", "service": "SRV001" }
-- Windows are [as_of - days + 1, as_of] with as_of from it_config; the prior window is the same length before it.
-- Region applies to facts that carry a region (incidents, security incidents, OT/network vulnerabilities);
-- service metrics and deployments are global.

begin;

create or replace function public.it_ops_window(p_filters jsonb default '{}'::jsonb)
returns table (as_of date, d_from date, d_to date, p_from date, p_to date, days int, region text, service text)
language sql stable set search_path = public as $$
  with c as (select (select value::date from it_config where key = 'as_of_date') as as_of,
                    greatest(1, least(365, coalesce(nullif(p_filters->>'days', '')::int, 30))) as days)
  select c.as_of, c.as_of - c.days + 1, c.as_of, c.as_of - 2 * c.days + 1, c.as_of - c.days, c.days,
         nullif(p_filters->>'region', ''), nullif(p_filters->>'service', '')
  from c
$$;

-- Per-service reliability rollup for a date range (shared by overview and reliability)
create or replace function public.it_ops_service_stats(p_from date, p_to date, p_region text default null)
returns table (service_id text, service_name text, short_name text, tier int, software_id text,
               slo numeric, slo_p95 int, cost_per_min numeric, days int,
               availability numeric, downtime_min numeric, allowed_min numeric, budget_remaining numeric,
               burn_rate_7d numeric, p95_ms numeric, p95_breach_days int, error_rate numeric, api_success numeric,
               incidents int, p1p2 int, mtta_min numeric, mttr_h numeric, alerts int, noise_alerts int)
language sql stable set search_path = public as $$
  with m as (
    select m.service_id, count(*) n, sum(1440 - m.uptime_minutes) down, sum(m.uptime_minutes) up,
           sum(1440 - m.uptime_minutes) filter (where m.date_id > p_to - 7) down7,
           count(*) filter (where m.date_id > p_to - 7) n7,
           avg(m.p95_latency_ms) p95, sum(m.failed_transactions) failed, sum(m.total_transactions) total,
           sum(m.api_successes) succ, sum(m.api_requests) req,
           count(*) filter (where m.p95_latency_ms > s.slo_latency_p95_ms) breach
    from fact_app_metrics m join it_dim_service s using (service_id)
    where m.date_id between p_from and p_to group by m.service_id
  ),
  i as (
    select service_id, count(*) n, count(*) filter (where priority <= 2) p12,
           percentile_cont(0.5) within group (order by extract(epoch from acknowledged_time - open_time) / 60) mtta,
           percentile_cont(0.5) within group (order by mttr_minutes) filter (where status = 'Resolved') / 60.0 mttr
    from fact_incidents
    where date_id between p_from and p_to and (p_region is null or region_id = p_region)
    group by service_id
  ),
  a as (
    select service_id, count(*) n, count(*) filter (where incident_id is null) noise
    from fact_alerts where date_id between p_from and p_to group by service_id
  )
  select s.service_id, s.service_name, s.short_name, s.tier, s.software_id,
         s.slo_availability, s.slo_latency_p95_ms, s.cost_of_downtime_inr_per_min, m.n::int,
         round(m.up::numeric / nullif(m.n * 1440, 0), 6),
         m.down, round((1 - s.slo_availability) * m.n * 1440, 1),
         round(1 - m.down / nullif((1 - s.slo_availability) * m.n * 1440, 0), 4),
         round((m.down7 / nullif(m.n7 * 1440.0, 0)) / (1 - s.slo_availability), 2),
         round(m.p95, 0), m.breach::int,
         round(m.failed::numeric / nullif(m.total, 0), 5), round(m.succ::numeric / nullif(m.req, 0), 5),
         coalesce(i.n, 0)::int, coalesce(i.p12, 0)::int, round(i.mtta::numeric, 1), round(i.mttr::numeric, 2),
         coalesce(a.n, 0)::int, coalesce(a.noise, 0)::int
  from it_dim_service s
  join m using (service_id)
  left join i using (service_id)
  left join a using (service_id)
$$;

-- ---------------------------------------------------------------------------
-- Executive Overview
-- ---------------------------------------------------------------------------
create or replace function public.it_ops_overview(p_filters jsonb default '{}'::jsonb)
returns jsonb
language sql stable set search_path = public as $$
  with w as (select * from it_ops_window(p_filters)),
  cur as (select s.* from w, it_ops_service_stats(w.d_from, w.d_to, w.region) s),
  prv as (select s.* from w, it_ops_service_stats(w.p_from, w.p_to, w.region) s),
  inc as (
    select count(*) filter (where i.date_id between w.d_from and w.d_to and i.priority = 1) p1,
           count(*) filter (where i.date_id between w.p_from and w.p_to and i.priority = 1) p1_prev,
           count(*) filter (where i.status = 'Active') open_now,
           count(*) filter (where i.status = 'Active' and i.priority <= 2) open_p12,
           percentile_cont(0.5) within group (order by i.mttr_minutes) filter (where i.date_id between w.d_from and w.d_to and i.status = 'Resolved') / 60.0 mttr,
           percentile_cont(0.5) within group (order by i.mttr_minutes) filter (where i.date_id between w.p_from and w.p_to and i.status = 'Resolved') / 60.0 mttr_prev
    from fact_incidents i, w where w.region is null or i.region_id = w.region
  ),
  chg as (
    select count(*) filter (where d.change_type <> 'Rollback') deploys,
           count(*) filter (where d.status = 'Failed') failed
    from fact_deployments d, w where d.date_id between w.d_from and w.d_to
  ),
  sec as (
    select count(*) filter (where v.status = 'Open' and v.severity = 'Critical') open_critical,
           count(*) filter (where v.status = 'Open' and v.severity in ('Critical', 'High') and v.due_date < w.as_of) past_sla,
           avg((v.patched_date <= v.due_date)::int) filter (where v.patched_date between w.d_from and w.d_to) patch_sla
    from it_fact_vulnerability v, w where w.region is null or v.region_id is null or v.region_id = w.region
  ),
  lic as (select it_lic_kpis(jsonb_build_object('region', w.region)) k from w),
  cfg as (select (select value::numeric from it_config where key = 'cfr_target') cfr_target),
  heat as (
    select jsonb_agg(jsonb_build_object('service_id', m.service_id, 'date', m.date_id,
             'availability', round(m.uptime_minutes / 1440.0, 5)) order by m.service_id, m.date_id) cells
    from fact_app_metrics m, w where m.date_id between w.d_from and w.d_to
  ),
  daily as (
    select jsonb_agg(jsonb_build_object('date', d.d, 'availability', d.avail, 'p1p2', d.p12) order by d.d) rows
    from (
      select m.date_id d, round(sum(m.uptime_minutes)::numeric / (count(*) * 1440), 5) avail,
             (select count(*) from fact_incidents i where i.date_id = m.date_id and i.priority <= 2
                and (w.region is null or i.region_id = w.region)) p12
      from fact_app_metrics m, w where m.date_id between w.d_from and w.d_to group by m.date_id, w.region
    ) d
  ),
  risks as (
    select jsonb_agg(r order by r.rank, r.sort) items from (
      select 1 rank, -s.budget_remaining sort, jsonb_build_object(
               'severity', 'critical', 'area', 'Reliability',
               'title', s.short_name || ' burned ' || round(1 - s.budget_remaining, 1) || '× its error budget',
               'detail', 'Availability ' || round(s.availability * 100, 2) || '% vs SLO ' || round(s.slo * 100, 2) || '%',
               'link', '/app-reliability?service=' || s.service_id) r
      from cur s where s.budget_remaining < 0
      union all
      select 2, p.days_to_notice, jsonb_build_object('severity', 'critical', 'area', 'Cost',
               'title', p.software_name || ' renewal notice due in ' || p.days_to_notice || ' d',
               'detail', 'Auto-renews ' || to_char(p.end_date, 'DD Mon YYYY') || ' · utilisation ' || round(p.utilisation * 100) || '%',
               'link', '/licensing-subs?sw=' || p.software_id)
      from jsonb_to_recordset(it_lic_portfolio('{}'::jsonb)) as p(software_id text, software_name text, days_to_notice int, end_date date, utilisation numeric)
      where p.days_to_notice between 0 and 30
      union all
      select 3, -sec.past_sla, jsonb_build_object('severity', case when sec.past_sla > 3 then 'critical' else 'warning' end, 'area', 'Security',
               'title', sec.past_sla || ' critical/high vulnerabilities past patch SLA',
               'detail', 'Mostly OT devices at the plants',
               'link', '/security')
      from sec where sec.past_sla > 0
      union all
      select 5, -(r.likelihood * r.impact), jsonb_build_object('severity', 'warning', 'area', 'Security',
               'title', r.title, 'detail', 'Risk score ' || r.likelihood * r.impact || ' (L' || r.likelihood || ' × I' || r.impact || ') · ' || r.status,
               'link', '/security')
      from it_fact_security_risk r where r.likelihood * r.impact >= 16 and r.status <> 'Accepted'
    ) r
  )
  select jsonb_build_object(
    'window', (select row_to_json(w)::jsonb from w),
    'kpis', jsonb_build_object(
      'slo_attainment', (select round(avg((availability >= slo)::int), 4) from cur),
      'slo_attainment_prev', (select round(avg((availability >= slo)::int), 4) from prv),
      'services', (select count(*) from cur),
      'services_meeting', (select count(*) filter (where availability >= slo) from cur),
      'error_budget_remaining', (select round(1 - sum(downtime_min) / nullif(sum(allowed_min), 0), 4) from cur),
      'p1', inc.p1, 'p1_prev', inc.p1_prev, 'open_incidents', inc.open_now, 'open_p1p2', inc.open_p12,
      'mttr_h', round(inc.mttr::numeric, 2), 'mttr_h_prev', round(inc.mttr_prev::numeric, 2),
      'downtime_cost', (select round(sum(downtime_min * cost_per_min)) from cur),
      'acv', lic.k->'acv', 'shelfware', lic.k->'shelfware', 'utilisation', lic.k->'utilisation'),
    'scorecard', jsonb_build_array(
      jsonb_build_object('area', 'Reliability', 'link', '/app-reliability',
        'score', (select round(avg((availability >= slo)::int) * 100) from cur),
        'status', (select case when avg((availability >= slo)::int) >= .9 then 'good' when avg((availability >= slo)::int) >= .7 then 'warning' else 'critical' end from cur),
        'headline', (select count(*) filter (where availability >= slo) || ' of ' || count(*) || ' services meet SLO' from cur)),
      jsonb_build_object('area', 'Change', 'link', '/change-impact',
        'score', round((1 - chg.failed::numeric / nullif(chg.deploys, 0)) * 100),
        'status', case when chg.failed::numeric / nullif(chg.deploys, 0) <= cfg.cfr_target then 'good'
                       when chg.failed::numeric / nullif(chg.deploys, 0) <= cfg.cfr_target + 0.10 then 'warning' else 'critical' end,
        'headline', 'Change failure rate ' || round(chg.failed * 100.0 / nullif(chg.deploys, 0), 1) || '%'),
      jsonb_build_object('area', 'Security', 'link', '/security',
        'score', round(coalesce(sec.patch_sla, 1) * 100),
        'status', case when sec.past_sla = 0 then 'good' when sec.past_sla <= 3 then 'warning' else 'critical' end,
        'headline', sec.past_sla || ' critical/high vulns past SLA'),
      jsonb_build_object('area', 'Cost', 'link', '/licensing-subs',
        'score', round((lic.k->>'utilisation')::numeric * 100),
        'status', case when (lic.k->>'utilisation')::numeric >= .85 then 'good' when (lic.k->>'utilisation')::numeric >= .75 then 'warning' else 'critical' end,
        'headline', 'Licence utilisation ' || round((lic.k->>'utilisation')::numeric * 100, 1) || '%')
    ),
    'services', (select jsonb_agg(jsonb_build_object('service_id', service_id, 'short_name', short_name, 'availability', availability, 'slo', slo) order by service_id) from cur),
    'heatmap', heat.cells,
    'daily', daily.rows,
    'risks', coalesce(risks.items, '[]'::jsonb)
  )
  from inc, chg, sec, lic, cfg, heat, daily, risks
$$;

-- Incident list (drill-down target for heatmap cells, services, deployments)
create or replace function public.it_ops_incidents(p_filters jsonb default '{}'::jsonb, p_date date default null, p_limit int default 200)
returns jsonb
language sql stable set search_path = public as $$
  with w as (select * from it_ops_window(p_filters))
  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.open_time desc), '[]'::jsonb)
  from (
    select i.incident_id, i.title, i.service_id, s.short_name, i.priority, i.status, i.root_cause_type,
           i.open_time, i.resolution_time, i.mttr_minutes, i.region_id, g.region_name, i.location_id, l.location_name,
           round(extract(epoch from i.acknowledged_time - i.open_time) / 60) mtta_minutes,
           (select count(*) from fact_alerts a where a.incident_id = i.incident_id) alerts,
           (select b.deployment_id from it_bridge_change_incident b where b.incident_id = i.incident_id limit 1) deployment_id
    from fact_incidents i
    join it_dim_service s using (service_id)
    left join dim_region g on g.region_id = i.region_id
    left join dim_location l on l.location_id = i.location_id
    cross join w
    where (p_date is not null and i.date_id = p_date or p_date is null and i.date_id between w.d_from and w.d_to)
      and (w.region is null or i.region_id = w.region)
      and (w.service is null or i.service_id = w.service)
    order by i.open_time desc
    limit greatest(p_limit, 1)
  ) t
$$;

create or replace function public.it_ops_incident_detail(p_incident_id text)
returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'incident', (select row_to_json(x)::jsonb from (
        select i.*, s.service_name, s.short_name, g.region_name, l.location_name
        from fact_incidents i join it_dim_service s using (service_id)
        left join dim_region g on g.region_id = i.region_id left join dim_location l on l.location_id = i.location_id
        where i.incident_id = p_incident_id) x),
    'alerts', (select coalesce(jsonb_agg(jsonb_build_object('alert_id', a.alert_id, 'alert_time', a.alert_time, 'severity', a.alert_severity) order by a.alert_time), '[]'::jsonb)
               from fact_alerts a where a.incident_id = p_incident_id),
    'deployment', (select row_to_json(d)::jsonb from (
        select dp.deployment_id, dp.deploy_time, dp.change_type, dp.status, dp.pr_count, dp.lead_time_hours, b.confidence,
               (select r.deploy_time from fact_deployments r where r.rollback_of = dp.deployment_id limit 1) rollback_time
        from it_bridge_change_incident b join fact_deployments dp using (deployment_id)
        where b.incident_id = p_incident_id limit 1) d)
  )
$$;

-- ---------------------------------------------------------------------------
-- App Reliability
-- ---------------------------------------------------------------------------
create or replace function public.it_rel_overview(p_filters jsonb default '{}'::jsonb)
returns jsonb
language sql stable set search_path = public as $$
  with w as (select * from it_ops_window(p_filters)),
  cur as (select s.* from w, it_ops_service_stats(w.d_from, w.d_to, w.region) s),
  prv as (select s.* from w, it_ops_service_stats(w.p_from, w.p_to, w.region) s),
  inc as (select i.* from fact_incidents i, w where i.date_id between w.d_from and w.d_to
            and (w.region is null or i.region_id = w.region) and (w.service is null or i.service_id = w.service)),
  incp as (select i.* from fact_incidents i, w where i.date_id between w.p_from and w.p_to
            and (w.region is null or i.region_id = w.region) and (w.service is null or i.service_id = w.service)),
  al as (select a.* from fact_alerts a, w where a.date_id between w.d_from and w.d_to and (w.service is null or a.service_id = w.service)),
  alp as (select a.* from fact_alerts a, w where a.date_id between w.p_from and w.p_to and (w.service is null or a.service_id = w.service))
  select jsonb_build_object(
    'window', (select row_to_json(w)::jsonb from w),
    'kpis', jsonb_build_object(
      'slo_attainment', (select round(avg((availability >= slo)::int), 4) from cur),
      'slo_attainment_prev', (select round(avg((availability >= slo)::int), 4) from prv),
      'error_budget_remaining', (select round(1 - sum(downtime_min) / nullif(sum(allowed_min), 0), 4) from cur, w where w.service is null or cur.service_id = w.service),
      'p95_breach_days', (select sum(p95_breach_days) from cur, w where w.service is null or cur.service_id = w.service),
      'mtta_min', (select round((percentile_cont(0.5) within group (order by extract(epoch from acknowledged_time - open_time) / 60))::numeric, 1) from inc),
      'mtta_min_prev', (select round((percentile_cont(0.5) within group (order by extract(epoch from acknowledged_time - open_time) / 60))::numeric, 1) from incp),
      'mttr_h', (select round((percentile_cont(0.5) within group (order by mttr_minutes) / 60.0)::numeric, 2) from inc where status = 'Resolved'),
      'mttr_h_prev', (select round((percentile_cont(0.5) within group (order by mttr_minutes) / 60.0)::numeric, 2) from incp where status = 'Resolved'),
      'noise_ratio', (select round(avg((incident_id is null)::int), 4) from al),
      'noise_ratio_prev', (select round(avg((incident_id is null)::int), 4) from alp),
      'downtime_cost', (select round(sum(downtime_min * cost_per_min)) from cur, w where w.service is null or cur.service_id = w.service),
      'incidents', (select count(*) from inc)),
    'services', (select coalesce(jsonb_agg(row_to_json(cur)::jsonb || jsonb_build_object('downtime_cost', round(cur.downtime_min * cur.cost_per_min))
                         order by cur.budget_remaining), '[]'::jsonb) from cur),
    'priorities', (select coalesce(jsonb_agg(row_to_json(p)::jsonb order by p.priority), '[]'::jsonb) from (
        select i.priority, count(*) n,
               round((percentile_cont(0.5) within group (order by extract(epoch from i.acknowledged_time - i.open_time) / 60))::numeric, 1) mtta_min,
               round((percentile_cont(0.25) within group (order by i.mttr_minutes) / 60.0)::numeric, 2) mttr_p25,
               round((percentile_cont(0.5) within group (order by i.mttr_minutes) / 60.0)::numeric, 2) mttr_p50,
               round((percentile_cont(0.75) within group (order by i.mttr_minutes) / 60.0)::numeric, 2) mttr_p75,
               round((percentile_cont(0.9) within group (order by i.mttr_minutes) / 60.0)::numeric, 2) mttr_p90,
               (select value::numeric from it_config where key = 'mttr_target_hours_p' || i.priority) target_h,
               round(avg((i.mttr_minutes <= 60 * (select value::numeric from it_config where key = 'mttr_target_hours_p' || i.priority))::int), 4) within_target
        from inc i where i.status = 'Resolved' group by i.priority) p),
    'funnel', jsonb_build_object(
      'alerts', (select count(*) from al),
      'linked_alerts', (select count(*) from al where incident_id is not null),
      'incidents', (select count(*) from inc),
      'p1p2', (select count(*) from inc where priority <= 2))
  )
$$;

create or replace function public.it_rel_daily(p_filters jsonb default '{}'::jsonb)
returns jsonb
language sql stable set search_path = public as $$
  with w as (select * from it_ops_window(p_filters))
  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.date), '[]'::jsonb)
  from (
    select m.date_id as date,
           round(sum(m.uptime_minutes)::numeric / (count(*) * 1440), 5) availability,
           round(avg(m.p95_latency_ms), 0) p95_ms,
           round(sum(m.failed_transactions)::numeric / nullif(sum(m.total_transactions), 0), 5) error_rate,
           (select count(*) from fact_incidents i where i.date_id = m.date_id and (w.service is null or i.service_id = w.service)
              and (w.region is null or i.region_id = w.region)) incidents
    from fact_app_metrics m, w
    where m.date_id between w.d_from and w.d_to and (w.service is null or m.service_id = w.service)
    group by m.date_id, w.service, w.region
  ) t
$$;

-- ---------------------------------------------------------------------------
-- Change Impact (DORA)
-- ---------------------------------------------------------------------------
create or replace function public.it_chg_overview(p_filters jsonb default '{}'::jsonb)
returns jsonb
language sql stable set search_path = public as $$
  with w as (select * from it_ops_window(p_filters)),
  dep as (
    select d.*, (d.date_id between w.d_from and w.d_to) cur, (d.date_id between w.p_from and w.p_to) prv,
           (select r.deploy_time from fact_deployments r where r.rollback_of = d.deployment_id limit 1) rollback_time,
           (select max(i.resolution_time) from it_bridge_change_incident b join fact_incidents i using (incident_id) where b.deployment_id = d.deployment_id) fix_time,
           (select count(*) from it_bridge_change_incident b where b.deployment_id = d.deployment_id) caused
    from fact_deployments d, w
    where d.date_id between w.p_from and w.d_to and (w.service is null or d.service_id = w.service)
  ),
  dora as (
    select cur,
           count(*) filter (where change_type <> 'Rollback') deploys,
           count(*) filter (where status = 'Failed') failed,
           count(*) filter (where change_type = 'Rollback') rollbacks,
           percentile_cont(0.5) within group (order by lead_time_hours) filter (where change_type = 'Code') lead_h,
           percentile_cont(0.5) within group (order by extract(epoch from coalesce(rollback_time, fix_time) - deploy_time) / 3600)
             filter (where status = 'Failed' and coalesce(rollback_time, fix_time) is not null) recovery_h
    from dep where cur or prv group by cur
  ),
  inc as (
    select (i.date_id between w.d_from and w.d_to) cur, count(*) n, count(*) filter (where i.root_cause_type = 'Change') chg
    from fact_incidents i, w where i.date_id between w.p_from and w.d_to
      and (w.region is null or i.region_id = w.region) and (w.service is null or i.service_id = w.service)
    group by 1
  ),
  k as (
    select c.deploys, c.failed, c.rollbacks, c.lead_h, c.recovery_h,
           p.deploys p_deploys, p.failed p_failed, p.rollbacks p_rollbacks, p.lead_h p_lead_h, p.recovery_h p_recovery_h
    from (select * from dora where cur) c left join (select * from dora where not cur) p on true
  )
  select jsonb_build_object(
    'window', (select row_to_json(w)::jsonb from w),
    'kpis', jsonb_build_object(
      'deploys', k.deploys, 'deploys_per_day', round(k.deploys::numeric / w.days, 2), 'deploys_per_day_prev', round(k.p_deploys::numeric / w.days, 2),
      'cfr', round(k.failed::numeric / nullif(k.deploys, 0), 4), 'cfr_prev', round(k.p_failed::numeric / nullif(k.p_deploys, 0), 4),
      'cfr_target', (select value::numeric from it_config where key = 'cfr_target'),
      'rollback_rate', round(k.rollbacks::numeric / nullif(k.deploys, 0), 4), 'rollback_rate_prev', round(k.p_rollbacks::numeric / nullif(k.p_deploys, 0), 4),
      'recovery_h', round(k.recovery_h::numeric, 2), 'recovery_h_prev', round(k.p_recovery_h::numeric, 2),
      'lead_h', round(k.lead_h::numeric, 1), 'lead_h_prev', round(k.p_lead_h::numeric, 1),
      'change_incident_share', (select round(chg::numeric / nullif(n, 0), 4) from inc where cur),
      'change_incident_share_prev', (select round(chg::numeric / nullif(n, 0), 4) from inc where not cur)),
    'calendar', (select coalesce(jsonb_agg(row_to_json(c)::jsonb order by c.date), '[]'::jsonb) from (
        select g.d::date as date,
               count(dep.*) filter (where dep.change_type <> 'Rollback') deploys,
               count(dep.*) filter (where dep.status = 'Failed') failed,
               coalesce(sum(dep.caused), 0) incidents
        from generate_series(w.d_from, w.d_to, interval '1 day') g(d)
        left join dep on dep.date_id = g.d::date and dep.cur
        group by g.d) c),
    'by_type', (select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.deploys desc), '[]'::jsonb) from (
        select change_type, count(*) deploys, count(*) filter (where status = 'Failed') failed,
               round(avg((status = 'Failed')::int), 4) cfr, round(avg(pr_count), 1) avg_prs
        from dep where cur and change_type <> 'Rollback' group by change_type) t),
    'by_service', (select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.cfr desc nulls last), '[]'::jsonb) from (
        select dep.service_id, s.short_name, count(*) filter (where change_type <> 'Rollback') deploys,
               count(*) filter (where status = 'Failed') failed,
               round(count(*) filter (where status = 'Failed')::numeric / nullif(count(*) filter (where change_type <> 'Rollback'), 0), 4) cfr,
               sum(caused) incidents
        from dep join it_dim_service s using (service_id) where cur group by dep.service_id, s.short_name) t)
  )
  from k, w
$$;

create or replace function public.it_chg_deployments(p_filters jsonb default '{}'::jsonb, p_failed_only boolean default false,
                                                      p_date date default null, p_limit int default 200)
returns jsonb
language sql stable set search_path = public as $$
  with w as (select * from it_ops_window(p_filters))
  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.deploy_time desc), '[]'::jsonb)
  from (
    select d.deployment_id, d.deploy_time, d.service_id, s.short_name, d.change_type, d.status, d.pr_count, d.lead_time_hours, d.rollback_of,
           (select r.deployment_id from fact_deployments r where r.rollback_of = d.deployment_id limit 1) rolled_back_by,
           (select coalesce(jsonb_agg(jsonb_build_object('incident_id', i.incident_id, 'priority', i.priority, 'title', i.title,
                                                          'status', i.status, 'confidence', b.confidence) order by i.open_time), '[]'::jsonb)
              from it_bridge_change_incident b join fact_incidents i using (incident_id) where b.deployment_id = d.deployment_id) incidents
    from fact_deployments d join it_dim_service s using (service_id), w
    where (p_date is not null and d.date_id = p_date or p_date is null and d.date_id between w.d_from and w.d_to)
      and (w.service is null or d.service_id = w.service)
      and (not p_failed_only or d.status = 'Failed')
    order by d.deploy_time desc
    limit greatest(p_limit, 1)
  ) t
$$;

-- ---------------------------------------------------------------------------
-- Security
-- ---------------------------------------------------------------------------
create or replace function public.it_sec_overview(p_filters jsonb default '{}'::jsonb)
returns jsonb
language sql stable set search_path = public as $$
  with w as (select * from it_ops_window(p_filters)),
  v as (select x.* from it_fact_vulnerability x, w where w.region is null or x.region_id is null or x.region_id = w.region),
  si as (select x.* from it_fact_security_incident x, w where w.region is null or x.region_id = w.region),
  ph as (select date_trunc('month', campaign_date)::date m, sum(clicked)::numeric / sum(emails_sent) click, sum(reported)::numeric / sum(emails_sent) report
         from it_fact_phishing_sim, w where campaign_date <= w.as_of group by 1),
  th as (select x.* from it_fact_threat_daily x, w where x.date_id between w.p_from and w.d_to)
  select jsonb_build_object(
    'window', (select row_to_json(w)::jsonb from w),
    'kpis', jsonb_build_object(
      'open_critical', (select count(*) from v where status = 'Open' and severity = 'Critical'),
      'open_high', (select count(*) from v where status = 'Open' and severity = 'High'),
      'past_sla', (select count(*) from v, w where status = 'Open' and severity in ('Critical', 'High') and due_date < w.as_of),
      'patch_sla', (select round(avg((patched_date <= due_date)::int), 4) from v, w where patched_date between w.d_from and w.d_to),
      'patch_sla_prev', (select round(avg((patched_date <= due_date)::int), 4) from v, w where patched_date between w.p_from and w.p_to),
      'incidents', (select count(*) from si, w where detected_time::date between w.d_from and w.d_to),
      'incidents_prev', (select count(*) from si, w where detected_time::date between w.p_from and w.p_to),
      'open_incidents', (select count(*) from si where status <> 'Resolved'),
      'mttd_h', (select round((percentile_cont(0.5) within group (order by extract(epoch from detected_time - impact_start_time) / 3600))::numeric, 1)
                 from si, w where detected_time::date between w.d_from and w.d_to),
      'mttd_h_prev', (select round((percentile_cont(0.5) within group (order by extract(epoch from detected_time - impact_start_time) / 3600))::numeric, 1)
                 from si, w where detected_time::date between w.p_from and w.p_to),
      'mttc_h', (select round((percentile_cont(0.5) within group (order by extract(epoch from contained_time - detected_time) / 3600))::numeric, 1)
                 from si, w where detected_time::date between w.d_from and w.d_to and contained_time is not null),
      'mttc_h_prev', (select round((percentile_cont(0.5) within group (order by extract(epoch from contained_time - detected_time) / 3600))::numeric, 1)
                 from si, w where detected_time::date between w.p_from and w.p_to and contained_time is not null),
      'phish_click', (select round(click, 4) from ph order by m desc limit 1),
      'phish_click_prev', (select round(click, 4) from ph order by m desc offset 1 limit 1),
      'blocked', (select sum(blocked) from th, w where date_id between w.d_from and w.d_to),
      'block_rate', (select round(sum(blocked)::numeric / nullif(sum(detected), 0), 5) from th, w where date_id between w.d_from and w.d_to),
      'blocked_prev', (select sum(blocked) from th, w where date_id between w.p_from and w.p_to)),
    'aging', (select coalesce(jsonb_agg(row_to_json(a)::jsonb order by a.sev_order), '[]'::jsonb) from (
        select severity, array_position(array['Critical','High','Medium','Low'], severity) sev_order,
               count(*) filter (where w.as_of - discovered_date <= 15) d0_15,
               count(*) filter (where w.as_of - discovered_date between 16 and 30) d16_30,
               count(*) filter (where w.as_of - discovered_date between 31 and 60) d31_60,
               count(*) filter (where w.as_of - discovered_date between 61 and 90) d61_90,
               count(*) filter (where w.as_of - discovered_date > 90) d90_plus,
               count(*) filter (where due_date < w.as_of) past_sla,
               count(*) total
        from v, w where status = 'Open' group by severity) a),
    'by_asset', (select coalesce(jsonb_agg(row_to_json(a)::jsonb order by a.open desc), '[]'::jsonb) from (
        select asset_class, count(*) filter (where status = 'Open') open,
               count(*) filter (where status = 'Open' and due_date < w.as_of) past_sla,
               round(avg(coalesce(patched_date, w.as_of) - discovered_date) filter (where severity in ('Critical', 'High')), 1) avg_days_crit_high
        from v, w group by asset_class) a),
    'risks', (select coalesce(jsonb_agg(row_to_json(r)::jsonb order by r.likelihood * r.impact desc), '[]'::jsonb) from it_fact_security_risk r),
    'vectors', (select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.week, t.vector), '[]'::jsonb) from (
        -- complete 7-day buckets ending on the as-of date (no partial first/last week)
        select w.as_of - ((w.as_of - date_id) / 7) * 7 as week, vector, sum(detected) detected, sum(blocked) blocked
        from th, w where date_id between w.d_from and w.d_to
        group by 1, 2 having count(*) = 7) t),
    'incident_vectors', (select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.n desc), '[]'::jsonb) from (
        select vector, count(*) n, count(*) filter (where severity <= 2) p1p2
        from si, w where detected_time::date between w.d_from and w.d_to group by vector) t),
    'phishing', (select coalesce(jsonb_agg(jsonb_build_object('month', m, 'click', round(click, 4), 'report', round(report, 4)) order by m), '[]'::jsonb) from ph)
  )
$$;

create or replace function public.it_sec_vulns(p_filters jsonb default '{}'::jsonb, p_status text default 'Open', p_limit int default 300)
returns jsonb
language sql stable set search_path = public as $$
  with w as (select * from it_ops_window(p_filters))
  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.sev_order, t.days_open desc), '[]'::jsonb)
  from (
    select v.vuln_id, v.title, v.severity, array_position(array['Critical','High','Medium','Low'], v.severity) sev_order,
           v.cvss, v.exploit_available, v.asset_class, v.assets_affected, v.software_id, sw.software_name, v.service_id,
           v.region_id, v.discovered_date, v.due_date, v.patched_date, v.status,
           coalesce(v.patched_date, w.as_of) - v.discovered_date days_open, v.due_date < w.as_of and v.status = 'Open' past_sla
    from it_fact_vulnerability v left join it_dim_software sw using (software_id), w
    where (p_status is null or v.status = p_status)
      and (w.region is null or v.region_id is null or v.region_id = w.region)
      and (nullif(p_filters->>'software', '') is null or v.software_id = p_filters->>'software')
    order by sev_order, days_open desc
    limit greatest(p_limit, 1)
  ) t
$$;

-- ---------------------------------------------------------------------------
-- Licensing product drawer: incidents and vulnerabilities for a product
-- ---------------------------------------------------------------------------
create or replace function public.it_lic_product_risk(p_software_id text, p_days int default 90)
returns jsonb
language sql stable set search_path = public as $$
  with w as (select * from it_ops_window(jsonb_build_object('days', p_days)))
  select jsonb_build_object(
    'services', (select coalesce(jsonb_agg(jsonb_build_object('service_id', s.service_id, 'service_name', s.service_name,
                   'availability', st.availability, 'slo', st.slo, 'incidents', st.incidents)), '[]'::jsonb)
                 from it_dim_service s join (select x.* from w, it_ops_service_stats(w.d_from, w.d_to, null) x) st using (service_id)
                 where s.software_id = p_software_id),
    'incidents', (select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.open_time desc), '[]'::jsonb) from (
        select i.incident_id, i.title, i.priority, i.status, i.root_cause_type, i.open_time, i.mttr_minutes
        from fact_incidents i join it_dim_service s using (service_id), w
        where s.software_id = p_software_id and i.date_id between w.d_from and w.d_to
        order by i.open_time desc limit 50) t),
    'vulnerabilities', (select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.sev_order, t.discovered_date), '[]'::jsonb) from (
        select v.vuln_id, v.title, v.severity, array_position(array['Critical','High','Medium','Low'], v.severity) sev_order,
               v.cvss, v.asset_class, v.discovered_date, v.due_date, v.due_date < w.as_of past_sla
        from it_fact_vulnerability v, w where v.software_id = p_software_id and v.status = 'Open') t)
  )
$$;

grant execute on function
  public.it_ops_window(jsonb), public.it_ops_service_stats(date, date, text), public.it_ops_overview(jsonb),
  public.it_ops_incidents(jsonb, date, int), public.it_ops_incident_detail(text),
  public.it_rel_overview(jsonb), public.it_rel_daily(jsonb),
  public.it_chg_overview(jsonb), public.it_chg_deployments(jsonb, boolean, date, int),
  public.it_sec_overview(jsonb), public.it_sec_vulns(jsonb, text, int),
  public.it_lic_product_risk(text, int)
to anon, authenticated;

commit;

notify pgrst, 'reload schema';
