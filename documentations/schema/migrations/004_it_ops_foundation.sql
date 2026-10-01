-- 004_it_ops_foundation.sql
-- Cross-cutting foundation for the IT operations redesign (roadmap items 1, 2, 3, 6).
--   * it_config: one as-of date and the targets every module uses
--   * it_dim_service: names the SRV001-010 services, links them to it_dim_software
--   * Reshapes the IT-owned facts used by Overview / Reliability / Change (fact_app_metrics, fact_incidents,
--     fact_alerts, fact_deployments) and adds it_bridge_change_incident
--   * Read-only RLS for anon on those tables
--
-- DESTRUCTIVE FOR IT-OWNED DATA ONLY: truncates the four regenerated IT facts (005 refills them).
-- fact_batch_jobs, fact_network_events and fact_data_quality are NOT touched (their modules were dropped).
-- Shared tables (dim_date, dim_region, dim_location, dim_application) are only referenced, never changed.
-- Re-runnable.

begin;

-- ---------------------------------------------------------------------------
-- 1. Config
-- ---------------------------------------------------------------------------
create table if not exists public.it_config (
  key         text primary key,
  value       text not null,
  description text
);
insert into public.it_config (key, value, description) values
  ('as_of_date',                '2026-09-30', 'Demo "today" for all IT operations data'),
  ('history_start',             '2025-04-01', 'First day of regenerated IT operations history'),
  ('mttr_target_hours_p1',      '4',          'Resolution target, priority 1'),
  ('mttr_target_hours_p2',      '8',          'Resolution target, priority 2'),
  ('mttr_target_hours_p3',      '24',         'Resolution target, priority 3'),
  ('mttr_target_hours_p4',      '72',         'Resolution target, priority 4'),
  ('patch_sla_days_critical',   '15',         'Days to patch a critical vulnerability'),
  ('patch_sla_days_high',       '30',         'Days to patch a high vulnerability'),
  ('patch_sla_days_medium',     '60',         'Days to patch a medium vulnerability'),
  ('patch_sla_days_low',        '90',         'Days to patch a low vulnerability'),
  ('cfr_target',                '0.15',       'Change failure rate target (DORA "high" band)')
on conflict (key) do update set value = excluded.value, description = excluded.description;

-- ---------------------------------------------------------------------------
-- 2. Services
-- ---------------------------------------------------------------------------
create table if not exists public.it_dim_service (
  service_id                   text primary key,
  service_name                 text not null,
  short_name                   text not null,
  software_id                  text references public.it_dim_software (software_id),
  owning_team                  text not null,
  tier                         int not null check (tier between 1 and 3),
  business_vertical            text not null,
  slo_availability             numeric(6, 4) not null,   -- fraction, e.g. 0.9990
  slo_latency_p95_ms           int not null,
  cost_of_downtime_inr_per_min numeric(12, 2) not null,
  description                  text
);
insert into public.it_dim_service values
  ('SRV001','SAP S/4HANA Finance & Supply Chain','SAP ERP',     'SW01','ERP Platform',        1,'Finance',      0.9990, 900, 42000, 'Core ERP transactions'),
  ('SRV002','Dealer Portal & DMS Integration',   'Dealer Portal','SW05','Dealer Systems',      1,'Aftersales',   0.9990, 800, 26000, 'Dealer ordering, service and parts'),
  ('SRV003','Salesforce CRM Integration',        'CRM',          'SW02','Sales Platforms',     1,'Sales',        0.9950, 700, 15000, 'Lead, opportunity and fleet deal sync'),
  ('SRV004','Xentry Diagnostics Gateway',        'Xentry GW',    'SW04','Aftersales Platforms',1,'Aftersales',   0.9990, 600, 21000, 'Workshop diagnostics session broker'),
  ('SRV005','Teamcenter PLM',                    'Teamcenter',   'SW03','Engineering IT',      1,'Manufacturing',0.9950,1200, 18000, 'BOM and engineering change management'),
  ('SRV006','Opcenter MES',                      'MES',          'SW06','Plant IT',            1,'Manufacturing',0.9995, 400, 65000, 'Assembly-line execution at the plants'),
  ('SRV007','Oracle TMS',                        'TMS',          'SW10','Logistics IT',        2,'Logistics',    0.9950, 900,  8000, 'Outbound vehicle and parts transport'),
  ('SRV008','Workday HCM',                       'Workday',      'SW09','Corporate IT',        2,'HR',           0.9900,1000,  2500, 'HR and payroll'),
  ('SRV009','ServiceNow ITSM',                   'ServiceNow',   'SW07','Corporate IT',        2,'Corporate',    0.9950, 800,  3000, 'IT service desk'),
  ('SRV010','Telematics Ingest API',             'Telematics',   null,  'Connected Vehicle',   1,'Aftersales',   0.9990, 300, 12000, 'Vehicle telemetry ingestion (in-house)')
on conflict (service_id) do update set
  service_name = excluded.service_name, short_name = excluded.short_name, software_id = excluded.software_id,
  owning_team = excluded.owning_team, tier = excluded.tier, business_vertical = excluded.business_vertical,
  slo_availability = excluded.slo_availability, slo_latency_p95_ms = excluded.slo_latency_p95_ms,
  cost_of_downtime_inr_per_min = excluded.cost_of_downtime_inr_per_min, description = excluded.description;

-- ---------------------------------------------------------------------------
-- 3. Reshape IT-owned facts (data is regenerated by 005)
-- ---------------------------------------------------------------------------
drop table if exists public.it_bridge_change_incident;
truncate public.fact_alerts, public.fact_incidents, public.fact_deployments, public.fact_app_metrics;

-- fact_app_metrics: one row per service x day, keyed to it_dim_service (no longer to the shared dim_application)
alter table public.fact_app_metrics drop constraint if exists fact_app_metrics_application_id_fkey;
alter table public.fact_app_metrics drop column if exists application_id;
alter table public.fact_app_metrics drop column if exists "timestamp";
alter table public.fact_app_metrics add column if not exists service_id text not null;
alter table public.fact_app_metrics add column if not exists p95_latency_ms numeric;
alter table public.fact_app_metrics drop constraint if exists fact_app_metrics_service_fk;
alter table public.fact_app_metrics add constraint fact_app_metrics_service_fk foreign key (service_id) references public.it_dim_service (service_id);
alter table public.fact_app_metrics drop constraint if exists fact_app_metrics_service_day_uq;
alter table public.fact_app_metrics add constraint fact_app_metrics_service_day_uq unique (service_id, date_id);

-- fact_incidents: lifecycle timestamps, location, title
alter table public.fact_incidents add column if not exists impact_start_time timestamp;
alter table public.fact_incidents add column if not exists detected_time     timestamp;
alter table public.fact_incidents add column if not exists acknowledged_time timestamp;
alter table public.fact_incidents add column if not exists region_id         varchar(50);
alter table public.fact_incidents add column if not exists location_id       varchar(50);
alter table public.fact_incidents add column if not exists title             text;
alter table public.fact_incidents drop constraint if exists fact_incidents_service_fk;
alter table public.fact_incidents add constraint fact_incidents_service_fk foreign key (service_id) references public.it_dim_service (service_id);
alter table public.fact_incidents drop constraint if exists fact_incidents_region_fk;
alter table public.fact_incidents add constraint fact_incidents_region_fk foreign key (region_id) references public.dim_region (region_id);
alter table public.fact_incidents drop constraint if exists fact_incidents_location_fk;
alter table public.fact_incidents add constraint fact_incidents_location_fk foreign key (location_id) references public.dim_location (location_id);
alter table public.fact_incidents drop constraint if exists fact_incidents_lifecycle_ck;
alter table public.fact_incidents add constraint fact_incidents_lifecycle_ck check (
  impact_start_time <= detected_time and detected_time <= open_time and open_time <= acknowledged_time
  and (resolution_time is null or resolution_time >= acknowledged_time));
alter table public.fact_incidents drop constraint if exists fact_incidents_status_ck;
alter table public.fact_incidents add constraint fact_incidents_status_ck check (
  (status = 'Resolved' and resolution_time is not null) or (status = 'Active' and resolution_time is null));

-- fact_alerts: exact time; incident_id null = alert that never became an incident (noise)
alter table public.fact_alerts add column if not exists alert_time timestamp;
alter table public.fact_alerts drop constraint if exists fact_alerts_service_fk;
alter table public.fact_alerts add constraint fact_alerts_service_fk foreign key (service_id) references public.it_dim_service (service_id);

-- fact_deployments: time, outcome, lead time
alter table public.fact_deployments add column if not exists deploy_time     timestamp;
alter table public.fact_deployments add column if not exists status          text;
alter table public.fact_deployments add column if not exists lead_time_hours numeric(8, 2);
alter table public.fact_deployments add column if not exists rollback_of     varchar(50);
alter table public.fact_deployments drop constraint if exists fact_deployments_status_ck;
alter table public.fact_deployments add constraint fact_deployments_status_ck check (status in ('Success', 'Failed'));
alter table public.fact_deployments drop constraint if exists fact_deployments_service_fk;
alter table public.fact_deployments add constraint fact_deployments_service_fk foreign key (service_id) references public.it_dim_service (service_id);

create table public.it_bridge_change_incident (
  deployment_id varchar(50) not null references public.fact_deployments (deployment_id) on delete cascade,
  incident_id   varchar(50) not null references public.fact_incidents (incident_id) on delete cascade,
  confidence    int not null check (confidence between 0 and 100),
  primary key (deployment_id, incident_id)
);

-- Indexes for the RPC filters
create index if not exists it_ix_metrics_date        on public.fact_app_metrics (date_id, service_id);
create index if not exists it_ix_incidents_open      on public.fact_incidents (open_time);
create index if not exists it_ix_incidents_service   on public.fact_incidents (service_id, date_id);
create index if not exists it_ix_incidents_region    on public.fact_incidents (region_id);
create index if not exists it_ix_alerts_date         on public.fact_alerts (date_id, service_id);
create index if not exists it_ix_alerts_incident     on public.fact_alerts (incident_id);
create index if not exists it_ix_deploy_date         on public.fact_deployments (date_id, service_id);
create index if not exists it_ix_bridge_incident     on public.it_bridge_change_incident (incident_id);

-- ---------------------------------------------------------------------------
-- 4. Security: read-only for the public key on every IT-owned table
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'it_config', 'it_dim_service', 'it_bridge_change_incident',
    'fact_app_metrics', 'fact_incidents', 'fact_alerts', 'fact_deployments'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists it_public_read on public.%I', t);
    execute format('create policy it_public_read on public.%I for select using (true)', t);
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);
  end loop;
end $$;

commit;
