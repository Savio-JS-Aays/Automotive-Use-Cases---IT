-- 005_it_ops_seed.sql
-- Regenerates the IT-owned operations facts (after 004) so they are internally consistent and tell stories.
-- Deterministic (it_hash01), history 2025-04-01 .. 2026-09-30 (as-of), nothing in the future.
--
-- Consistency rules
--   * impact_start <= detected <= open <= acknowledged <= resolution; mttr_minutes = resolution - open
--   * Active incidents have no resolution_time; Resolved ones do
--   * Every 'Change' incident is linked (it_bridge_change_incident) to the failed deployment that caused it
--   * Alerts of an incident sit on its service, between detection and open + 1 h; other alerts are noise
--   * Daily availability is derived from the P1/P2 incident minutes of that service and day
--
-- Stories
--   * Dealer Portal (SRV002): Aug-2026 release wave, ~half of code deploys failed -> P1/P2 change incidents
--   * Pune 02 plant (LOC0025): Sep-2026 network instability -> MES (SRV006) network incidents
--   * MTTR improves ~30% and code lead time halves over the 18 months; alert noise is high on Xentry/ServiceNow
--   * Three incidents are still open at the as-of date (telemetry ingest P2, Pune MES P3, CRM provider P4)
-- Re-runnable (truncates the same tables first).

begin;

truncate public.it_bridge_change_incident, public.fact_alerts, public.fact_incidents, public.fact_deployments,
         public.fact_app_metrics;

-- ---------------------------------------------------------------------------
-- Parameters
-- ---------------------------------------------------------------------------
create temp table p_days on commit drop as
select d::date as d,
       (d::date - date '2025-04-01') / 547.0 as t,                       -- 0 .. 1 across the history
       extract(isodow from d) in (6, 7) as weekend
from generate_series(date '2025-04-01', date '2026-09-30', interval '1 day') d;

create temp table p_service (service_id text primary key, deploy_rate numeric, incident_rate numeric, profile text,
  base_latency numeric, base_tx int, noise_rate numeric, err_base numeric, steady boolean) on commit drop;
insert into p_service values
  ('SRV001', .35, .13, 'hq',       180,  60000, .25, .006, false),
  ('SRV002', .55, .15, 'dealer',   210,  45000, .30, .008, false),
  ('SRV003', .50, .11, 'dealer',   160,  30000, .20, .007, false),
  ('SRV004', .30, .11, 'dealer',   140,  25000, .80, .005, false),
  ('SRV005', .25, .09, 'plant',    320,  12000, .20, .006, false),
  ('SRV006', .20, .08, 'plant',     90,  80000, .30, .003, true),
  ('SRV007', .30, .09, 'national', 230,  15000, .20, .008, false),
  ('SRV008', .15, .05, 'hq',       260,   5000, .10, .004, false),
  ('SRV009', .40, .07, 'hq',       200,   9000, .95, .005, false),
  ('SRV010', .50, .12, 'national',  70, 150000, .35, .004, true);

create temp table p_region (profile text, region_id text, lo numeric, hi numeric) on commit drop;
insert into p_region
select profile, region_id,
       coalesce(sum(w) over (partition by profile order by region_id rows between unbounded preceding and 1 preceding), 0),
       sum(w) over (partition by profile order by region_id)
from (values
  ('national','REG001',.24),('national','REG002',.26),('national','REG003',.14),('national','REG004',.24),('national','REG005',.12),
  ('plant',   'REG001',.00),('plant',   'REG002',.25),('plant',   'REG003',.15),('plant',   'REG004',.45),('plant',   'REG005',.15),
  ('dealer',  'REG001',.22),('dealer',  'REG002',.24),('dealer',  'REG003',.18),('dealer',  'REG004',.22),('dealer',  'REG005',.14),
  ('hq',      'REG001',.40),('hq',      'REG002',.25),('hq',      'REG003',.10),('hq',      'REG004',.20),('hq',      'REG005',.05)
) v(profile, region_id, w);

-- Location pick lists (plants for plant services, dealers for dealer services)
create temp table p_loc on commit drop as
select location_id, region_id, location_type,
       row_number() over (partition by region_id, location_type order by location_id) as idx,
       count(*) over (partition by region_id, location_type) as n
from public.dim_location;

-- ---------------------------------------------------------------------------
-- 1. Deployments (+ rollbacks of failed ones)
-- ---------------------------------------------------------------------------
create temp table w_deploy on commit drop as
with slots as (
  select s.service_id, d.d, d.t, k,
         public.it_hash01(s.service_id || d.d || k || 'dep') h,
         s.deploy_rate
           * case when d.weekend then 0.2 else 1 end
           * case when s.service_id = 'SRV002' and d.d between date '2026-08-01' and date '2026-08-31' then 2.2 else 1 end
           / 3.0 as p
  from p_service s cross join p_days d cross join generate_series(1, 3) k
), base as (
  select service_id, d, t, k,
         public.it_hash01(service_id || d || k || 'type') ht,
         public.it_hash01(service_id || d || k || 'fail') hf,
         public.it_hash01(service_id || d || k || 'misc') hm,
         public.it_hash01(service_id || d || k || 'inc')  hi,
         public.it_hash01(service_id || d || k || 'rb')   hr
  from slots where h < p
)
select service_id || '-' || d || '-' || k as dkey, service_id, d,
       d + make_interval(hours => 9 + floor(hm * 12)::int, mins => floor(hf * 59)::int) as deploy_time,
       case when ht < .55 then 'Code' when ht < .85 then 'Config' else 'Infra' end as change_type,
       case when ht < .55 then 1 + floor(hm * 6)::int when ht < .85 then 1 + floor(hm * 2)::int else 1 + floor(hm * 3)::int end as pr_count,
       round((case when ht < .55 then (96 - 54 * t) * (0.4 + 1.2 * hm)
                   when ht < .85 then 2 + 22 * hm
                   else 24 + 48 * hm end)::numeric, 2) as lead_time_hours,
       hf < (case when ht < .55 then .11 when ht < .85 then .07 else .13 end) * (1 - 0.35 * t)
            * case when service_id = 'SRV002' and d between date '2026-08-01' and date '2026-08-31' and ht < .55 then 4.5 else 1 end
         as failed,
       hi, hr
from base;

create temp table w_deploy_all on commit drop as
select dkey, service_id, deploy_time, change_type, pr_count, lead_time_hours,
       case when failed then 'Failed' else 'Success' end as status, null::text as rollback_of_key,
       failed, failed and hi < .85 as makes_incident, hi
from w_deploy
union all
select dkey || '-rb', service_id, deploy_time + make_interval(mins => 30 + floor(hr * 210)::int), 'Rollback', 0, null,
       'Success', dkey, false, false, null
from w_deploy where failed and hr < .6;

create temp table w_dep_id on commit drop as
select dkey, 'DEP' || lpad(row_number() over (order by deploy_time, dkey)::text, 5, '0') as deployment_id
from w_deploy_all;

insert into public.fact_deployments (deployment_id, service_id, date_id, time_id, change_type, pr_count,
                                     deploy_time, status, lead_time_hours, rollback_of)
select i.deployment_id, a.service_id, a.deploy_time::date,
       extract(hour from a.deploy_time)::int * 100 + extract(minute from a.deploy_time)::int,
       a.change_type, a.pr_count, a.deploy_time, a.status, a.lead_time_hours, r.deployment_id
from w_deploy_all a
join w_dep_id i using (dkey)
left join w_dep_id r on r.dkey = a.rollback_of_key;

-- ---------------------------------------------------------------------------
-- 2. Incidents
-- ---------------------------------------------------------------------------
create temp table w_inc on commit drop as
-- (a) change-induced: one per failed deployment that broke something
select 'chg-' || a.dkey as ikey, a.service_id, a.dkey as dep_key,
       a.deploy_time + make_interval(mins => 10 + floor(public.it_hash01(a.dkey || 'lag') * 350)::int) as impact_start,
       'Change' as root_cause,
       case when public.it_hash01(a.dkey || 'pri') < case when a.service_id = 'SRV002' and a.deploy_time >= '2026-08-01' then .35 else .18 end then 1
            when public.it_hash01(a.dkey || 'pri') < .62 then 2 else 3 end as priority,
       null::text as forced_location,
       70 + floor(public.it_hash01(a.dkey || 'conf') * 30)::int as confidence
from w_deploy_all a where a.makes_incident
union all
-- (b) other causes
select 'oth-' || s.service_id || '-' || d.d || '-' || k, s.service_id, null,
       d.d + make_interval(hours => case when public.it_hash01(s.service_id || d.d || k || 'hr') < .75
                                         then 7 + floor(public.it_hash01(s.service_id || d.d || k || 'h2') * 13)::int
                                         else floor(public.it_hash01(s.service_id || d.d || k || 'h2') * 24)::int end,
                           mins => floor(public.it_hash01(s.service_id || d.d || k || 'mi') * 59)::int),
       case when hc < .40 then 'Software' when hc < .62 then 'Network' when hc < .80 then 'Hardware' else 'External' end,
       case when hp < .04 then 1 when hp < .18 then 2 when hp < .60 then 3 else 4 end,
       null, 50 + floor(public.it_hash01(s.service_id || d.d || k || 'cf') * 30)::int
from p_service s cross join p_days d cross join generate_series(1, 2) k
cross join lateral (select public.it_hash01(s.service_id || d.d || k || 'cause') hc,
                           public.it_hash01(s.service_id || d.d || k || 'prio')  hp) x
where public.it_hash01(s.service_id || d.d || k || 'occ') < s.incident_rate / 2 * case when d.weekend then .6 else 1 end
union all
-- (c) story: Pune 02 plant network instability hits MES in September 2026
select 'SRV006-pune-' || d.d, 'SRV006', null,
       d.d + make_interval(hours => 6 + floor(public.it_hash01(d.d || 'pune') * 14)::int, mins => floor(public.it_hash01(d.d || 'pm') * 59)::int),
       'Network',
       case when public.it_hash01(d.d || 'pp') < .35 then 1 else 2 end,
       'LOC0025', 80 + floor(public.it_hash01(d.d || 'pc') * 19)::int
from p_days d
where d.d between date '2026-09-01' and date '2026-09-30' and public.it_hash01(d.d || 'puneocc') < .40
union all
-- (d) story: still open at the as-of date
select * from (values
  ('open-telemetry', 'SRV010', null::text, timestamp '2026-09-30 13:40', 'Software', 2, null::text, 85),
  ('open-pune',      'SRV006', null::text, timestamp '2026-09-30 16:05', 'Network',  3, 'LOC0025',   90),
  ('open-crm',       'SRV003', null::text, timestamp '2026-09-29 10:20', 'External', 4, null::text,  60)
) v;

create temp table w_inc_full on commit drop as
select i.*, s.profile, s.business_vertical, s.short_name,
       -- lifecycle (minutes / hours by priority; resolution improves ~30% over the history)
       i.impact_start + make_interval(mins => (case i.priority when 1 then 2 + h1 * 10 when 2 then 5 + h1 * 25 when 3 then 10 + h1 * 80 else 20 + h1 * 220 end)::int) as detected,
       (1 + floor(h2 * 9))::int as open_lag_min,
       (case i.priority when 1 then 3 + h3 * 12 when 2 then 5 + h3 * 40 when 3 then 20 + h3 * 220 else 60 + h3 * 660 end)::int as ack_min,
       (case i.priority when 1 then 1.5 + h4 * 4.5 when 2 then 3 + h4 * 9 when 3 then 6 + h4 * 34 else 12 + h4 * 108 end)
         * (1.15 - 0.35 * ((i.impact_start::date - date '2025-04-01') / 547.0)) * 60
         * case when i.ikey like 'open-%' then 100 else 1 end as resolve_min,
       h5
from w_inc i
join (select ps.*, ds.business_vertical, ds.short_name from p_service ps join public.it_dim_service ds using (service_id)) s using (service_id)
cross join lateral (select public.it_hash01(i.ikey || 'l1') h1, public.it_hash01(i.ikey || 'l2') h2, public.it_hash01(i.ikey || 'l3') h3,
                           public.it_hash01(i.ikey || 'l4') h4, public.it_hash01(i.ikey || 'l5') h5) h;

create temp table w_inc_final on commit drop as
select f.*,
       f.detected + make_interval(mins => f.open_lag_min) as open_t,
       f.detected + make_interval(mins => f.open_lag_min + f.ack_min) as ack_t,
       f.detected + make_interval(mins => f.open_lag_min) + make_interval(mins => greatest(f.resolve_min, f.ack_min + 5)::int) as resolve_t,
       coalesce(f.forced_location, case when f.profile in ('plant', 'dealer') and f.root_cause in ('Network', 'Hardware', 'External') then l.location_id end) as location_id,
       coalesce(fl.region_id, r.region_id) as region_id
from w_inc_full f
left join p_region r on r.profile = f.profile and f.h5 >= r.lo and f.h5 < r.hi
left join public.dim_location fl on fl.location_id = f.forced_location
left join p_loc l on l.region_id = r.region_id
                 and l.location_type = case f.profile when 'plant' then 'Plant' else 'Dealer' end
                 and l.idx = 1 + floor(public.it_hash01(f.ikey || 'loc') * l.n)::int;

create temp table w_inc_id on commit drop as
select ikey, 'INC' || lpad(row_number() over (order by open_t, ikey)::text, 5, '0') as incident_id
from w_inc_final;

insert into public.fact_incidents (incident_id, service_id, date_id, time_id, causal_confidence_score, mttr_minutes,
  priority, status, affected_business_unit, root_cause_type, open_time, resolution_time,
  impact_start_time, detected_time, acknowledged_time, region_id, location_id, title)
select i.incident_id, f.service_id, f.open_t::date,
       extract(hour from f.open_t)::int * 100 + extract(minute from f.open_t)::int,
       f.confidence,
       case when f.resolve_t <= timestamp '2026-09-30 23:59:59' then round(extract(epoch from f.resolve_t - f.open_t) / 60)::int end,
       f.priority,
       case when f.resolve_t <= timestamp '2026-09-30 23:59:59' then 'Resolved' else 'Active' end,
       f.business_vertical, f.root_cause, f.open_t,
       case when f.resolve_t <= timestamp '2026-09-30 23:59:59' then f.resolve_t end,
       f.impact_start, f.detected, f.ack_t, f.region_id, f.location_id,
       f.short_name || ' — ' || case f.root_cause
         when 'Change'   then 'errors after deployment'
         when 'Network'  then case when f.location_id is not null then 'connectivity loss at site' else 'network connectivity loss' end
         when 'Software' then 'application errors and slow responses'
         when 'Hardware' then 'infrastructure component failure'
         else 'third-party provider outage' end
from w_inc_final f join w_inc_id i using (ikey)
where f.open_t <= timestamp '2026-09-30 23:59:59';

insert into public.it_bridge_change_incident (deployment_id, incident_id, confidence)
select d.deployment_id, i.incident_id, f.confidence
from w_inc_final f
join w_inc_id i using (ikey)
join w_dep_id d on d.dkey = f.dep_key
where f.dep_key is not null and f.open_t <= timestamp '2026-09-30 23:59:59';

-- ---------------------------------------------------------------------------
-- 3. Alerts: a burst per incident + noise that never became an incident
-- ---------------------------------------------------------------------------
create temp table w_alert on commit drop as
select i.service_id, i.incident_id,
       case when n = 1 then i.detected_time
            else i.detected_time + make_interval(secs => floor(public.it_hash01(i.incident_id || n || 'at')
                   * extract(epoch from (i.open_time - i.detected_time) + interval '60 minutes'))::int) end as alert_time,
       case when n = 1 then (array['Critical','High','Medium','Low'])[i.priority]
            when public.it_hash01(i.incident_id || n || 'sv') < .6 then (array['Critical','High','Medium','Low'])[i.priority]
            else (array['High','Medium','Low','Low'])[i.priority] end as alert_severity
from public.fact_incidents i
cross join lateral generate_series(1, case i.priority when 1 then 4 when 2 then 3 when 3 then 2 else 1 end
                                      + floor(public.it_hash01(i.incident_id || 'na') * case i.priority when 1 then 5 when 2 then 4 when 3 then 3 else 2 end)::int) n
union all
select s.service_id, null,
       d.d + make_interval(secs => floor(public.it_hash01(s.service_id || d.d || k || 'nt') * 86399)::int),
       case when public.it_hash01(s.service_id || d.d || k || 'ns') < .5 then 'Low'
            when public.it_hash01(s.service_id || d.d || k || 'ns') < .85 then 'Medium' else 'High' end
from p_service s cross join p_days d cross join generate_series(1, 2) k
where public.it_hash01(s.service_id || d.d || k || 'noise') < s.noise_rate / 2;

insert into public.fact_alerts (alert_id, service_id, date_id, time_id, incident_id, alert_severity, alert_time)
select 'ALT' || lpad(row_number() over (order by alert_time, service_id, incident_id)::text, 6, '0'),
       service_id, alert_time::date,
       extract(hour from alert_time)::int * 100 + extract(minute from alert_time)::int,
       incident_id, alert_severity, alert_time
from w_alert
where alert_time <= timestamp '2026-09-30 23:59:59';

-- ---------------------------------------------------------------------------
-- 4. Daily service metrics (downtime from P1/P2 incident minutes)
-- ---------------------------------------------------------------------------
insert into public.fact_app_metrics (metric_id, service_id, date_id, uptime_minutes, total_transactions, failed_transactions,
                                     avg_api_latency_ms, p95_latency_ms, api_requests, api_successes)
select 'AM-' || s.service_id || '-' || to_char(d.d, 'YYYYMMDD'), s.service_id, d.d,
       1440 - least(1440, round(o.outage))::int,
       tx.total,
       round(tx.total * (s.err_base * (0.7 + 0.6 * h.h1) + o.outage / 1440.0 * 0.30))::int,
       round(s.base_latency * (0.9 + 0.2 * h.h2) * (1 + 1.5 * o.outage / 1440.0 + case when o.major > 0 then 0.3 else 0 end), 2),
       round(s.base_latency * (0.9 + 0.2 * h.h2) * (1 + 1.5 * o.outage / 1440.0 + case when o.major > 0 then 0.9 else 0 end) * (2.2 + 0.6 * h.h3), 2),
       round(tx.total * (1.6 + 0.6 * h.h4))::int,
       round(tx.total * (1.6 + 0.6 * h.h4) * (1 - (s.err_base * 0.8 * (0.7 + 0.6 * h.h5) + o.outage / 1440.0 * 0.25)))::int
from p_service s
cross join p_days d
cross join lateral (
  select public.it_hash01(s.service_id || d.d || 'm1') h1, public.it_hash01(s.service_id || d.d || 'm2') h2,
         public.it_hash01(s.service_id || d.d || 'm3') h3, public.it_hash01(s.service_id || d.d || 'm4') h4,
         public.it_hash01(s.service_id || d.d || 'm5') h5, public.it_hash01(s.service_id || d.d || 'm6') h6) h
cross join lateral (
  select round(s.base_tx * case when d.weekend and not s.steady then 0.45 else 1 end * (1 + 0.25 * d.t) * (0.92 + 0.16 * h.h6))::int as total) tx
cross join lateral (
  select coalesce(sum(least(1440, extract(epoch from coalesce(i.resolution_time, timestamp '2026-09-30 23:59:59') - i.open_time) / 60)
                      * case i.priority when 1 then 0.60 when 2 then 0.15 else 0 end), 0) as outage,   -- P3/P4 = degraded, not down
         count(*) filter (where i.priority <= 2) as major
  from public.fact_incidents i where i.service_id = s.service_id and i.date_id = d.d) o;

commit;

analyze public.fact_deployments, public.fact_incidents, public.fact_alerts, public.it_bridge_change_incident,
        public.fact_app_metrics;
