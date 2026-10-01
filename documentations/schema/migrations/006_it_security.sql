-- 006_it_security.sql
-- Security data for the Security module (none existed before). All new IT-owned tables, deterministic seed,
-- history 2025-04-01 .. 2026-09-30. Vulnerabilities use internal VULN-#### ids (no real CVE identifiers).
--
-- Stories
--   * OT devices at the plants (Opcenter MES) are patched ~6x slower -> critical OT vulns past SLA
--   * Credential-stuffing wave against the dealer portal (Keyloop DMS) in Aug-2026
--   * Phishing-simulation click rate falls from ~14% to ~5% with training; Dealer Network improves slowest
-- Re-runnable (drops and recreates the it_sec tables).

begin;

drop table if exists public.it_fact_security_risk, public.it_fact_phishing_sim, public.it_fact_threat_daily,
                     public.it_fact_security_incident, public.it_fact_vulnerability cascade;

create table public.it_fact_vulnerability (
  vuln_id           text primary key,
  title             text not null,
  severity          text not null check (severity in ('Critical', 'High', 'Medium', 'Low')),
  cvss              numeric(3, 1) not null check (cvss between 0 and 10),
  exploit_available boolean not null,
  asset_class       text not null check (asset_class in ('Server', 'Endpoint', 'Network device', 'OT device', 'SaaS configuration')),
  assets_affected   int not null,
  software_id       text references public.it_dim_software (software_id),
  service_id        text references public.it_dim_service (service_id),
  region_id         varchar(50) references public.dim_region (region_id),
  discovered_date   date not null,
  due_date          date not null,
  patched_date      date,
  status            text not null check (status in ('Open', 'Patched', 'Risk accepted')),
  check (patched_date is null or patched_date >= discovered_date)
);

create table public.it_fact_security_incident (
  sec_incident_id   text primary key,
  vector            text not null,
  severity          int not null check (severity between 1 and 3),
  title             text not null,
  impact_start_time timestamp not null,
  detected_time     timestamp not null,
  contained_time    timestamp,
  resolved_time     timestamp,
  status            text not null check (status in ('Open', 'Contained', 'Resolved')),
  region_id         varchar(50) references public.dim_region (region_id),
  department        text not null,
  software_id       text references public.it_dim_software (software_id),
  check (impact_start_time <= detected_time and (contained_time is null or contained_time >= detected_time)
         and (resolved_time is null or resolved_time >= contained_time))
);

create table public.it_fact_threat_daily (
  date_id  date not null references public.dim_date (date_id),
  vector   text not null,
  detected int not null,
  blocked  int not null check (blocked <= detected),
  primary key (date_id, vector)
);

create table public.it_fact_phishing_sim (
  campaign_id   text primary key,
  campaign_date date not null,
  department    text not null,
  emails_sent   int not null,
  clicked       int not null,
  reported      int not null,
  check (clicked <= emails_sent and reported <= emails_sent)
);

create table public.it_fact_security_risk (
  risk_id     text primary key,
  title       text not null,
  category    text not null,
  likelihood  int not null check (likelihood between 1 and 5),
  impact      int not null check (impact between 1 and 5),
  owner       text not null,
  software_id text references public.it_dim_software (software_id),
  service_id  text references public.it_dim_service (service_id),
  status      text not null check (status in ('Open', 'Mitigating', 'Accepted')),
  treatment   text not null,
  review_date date not null
);

create index it_ix_vuln_status   on public.it_fact_vulnerability (status, severity);
create index it_ix_vuln_software on public.it_fact_vulnerability (software_id);
create index it_ix_secinc_detect on public.it_fact_security_incident (detected_time);

-- ---------------------------------------------------------------------------
-- Vulnerabilities (~1.1 per day)
-- ---------------------------------------------------------------------------
insert into public.it_fact_vulnerability
select 'VULN-' || lpad(row_number() over (order by v.discovered, v.k)::text, 4, '0'),
       v.title, v.severity, v.cvss, v.exploit, v.asset_class, v.assets, v.software_id, null, v.region_id,
       v.discovered, v.discovered + v.sla,
       case when v.status = 'Patched' then v.discovered + v.delay end,
       v.status
from (
  select x.*,
         case when x.hst < .03 and x.severity in ('Medium', 'Low') then 'Risk accepted'
              when x.discovered + x.delay <= date '2026-09-30' then 'Patched'
              else 'Open' end as status
  from (
    select d.d as discovered, k,
           sev.severity, sev.sla,
           round((sev.cvss_lo + (sev.cvss_hi - sev.cvss_lo) * public.it_hash01(d.d::text || k || 'cv'))::numeric, 1) as cvss,
           public.it_hash01(d.d::text || k || 'ex') < case sev.severity when 'Critical' then .55 when 'High' then .30 else .08 end as exploit,
           ac.asset_class,
           case ac.asset_class when 'Endpoint' then 10 + floor(public.it_hash01(d.d::text || k || 'n') * 390)::int
                               when 'Server' then 1 + floor(public.it_hash01(d.d::text || k || 'n') * 19)::int
                               when 'Network device' then 1 + floor(public.it_hash01(d.d::text || k || 'n') * 29)::int
                               when 'OT device' then 1 + floor(public.it_hash01(d.d::text || k || 'n') * 11)::int
                               else 1 end as assets,
           case ac.asset_class when 'OT device' then 'SW06'
                               when 'Endpoint' then (array['SW08', 'SW12'])[1 + floor(public.it_hash01(d.d::text || k || 'sw') * 2)::int]
                               when 'Server' then (array['SW01', 'SW03', 'SW04', 'SW06', 'SW13'])[1 + floor(public.it_hash01(d.d::text || k || 'sw') * 5)::int]
                               when 'SaaS configuration' then (array['SW02', 'SW05', 'SW07', 'SW09', 'SW10', 'SW15'])[1 + floor(public.it_hash01(d.d::text || k || 'sw') * 6)::int]
                               end as software_id,
           case when ac.asset_class in ('OT device', 'Network device')
                then (array['REG002', 'REG003', 'REG004', 'REG004', 'REG005'])[1 + floor(public.it_hash01(d.d::text || k || 'rg') * 5)::int] end as region_id,
           (sev.delay_lo + (sev.delay_hi - sev.delay_lo) * public.it_hash01(d.d::text || k || 'dl'))::int
             * case when ac.asset_class = 'OT device' then 6 else 1 end as delay,
           ac.verb || ' ' || ac.noun as title,
           public.it_hash01(d.d::text || k || 'st') as hst
    from (select g::date as d from generate_series(date '2025-04-01', date '2026-09-30', interval '1 day') g) d
    cross join generate_series(1, 2) k
    cross join lateral (select public.it_hash01(d.d::text || k || 'sev') hs, public.it_hash01(d.d::text || k || 'ac') ha) h
    cross join lateral (
      select * from (values
        ('Critical', 9.0, 10.0, 15, 3, 20),
        ('High',     7.0,  8.9, 30, 10, 45),
        ('Medium',   4.0,  6.9, 60, 20, 90),
        ('Low',      0.1,  3.9, 90, 30, 160)) s(severity, cvss_lo, cvss_hi, sla, delay_lo, delay_hi)
      where s.severity = case when h.hs < .08 then 'Critical' when h.hs < .33 then 'High' when h.hs < .78 then 'Medium' else 'Low' end
    ) sev
    cross join lateral (
      select * from (values
        ('Server',             'Remote code execution in',      'application server runtime'),
        ('Endpoint',           'Privilege escalation in',       'desktop operating system'),
        ('Network device',     'Authentication bypass in',      'router management interface'),
        ('OT device',          'Unpatched firmware on',         'line controller gateway'),
        ('SaaS configuration', 'Excessive permissions in',      'tenant sharing settings')) a(asset_class, verb, noun)
      where a.asset_class = case when h.ha < .35 then 'Server' when h.ha < .60 then 'Endpoint' when h.ha < .75 then 'Network device'
                                 when h.ha < .87 then 'OT device' else 'SaaS configuration' end
    ) ac
    where public.it_hash01(d.d::text || k || 'occ') < .55
  ) x
) v;

-- service for OT/ERP-hosted assets (via software)
update public.it_fact_vulnerability v set service_id = s.service_id
from public.it_dim_service s where s.software_id = v.software_id;

-- ---------------------------------------------------------------------------
-- Security incidents (~8 per month, credential-stuffing wave Aug-2026)
-- ---------------------------------------------------------------------------
insert into public.it_fact_security_incident
select 'SEC-' || lpad(row_number() over (order by y.impact_start, y.k)::text, 4, '0'),
       y.vector, y.severity, y.title, y.impact_start, y.detected,
       case when y.contained <= timestamp '2026-09-30 23:59:59' then y.contained end,
       case when y.resolved  <= timestamp '2026-09-30 23:59:59' then y.resolved end,
       case when y.resolved  <= timestamp '2026-09-30 23:59:59' then 'Resolved'
            when y.contained <= timestamp '2026-09-30 23:59:59' then 'Contained' else 'Open' end,
       y.region_id, y.department, y.software_id
from (
  select x.*,
         x.impact_start + make_interval(mins => x.mttd_min) as detected,
         x.impact_start + make_interval(mins => x.mttd_min + x.mttc_min) as contained,
         x.impact_start + make_interval(mins => x.mttd_min + x.mttc_min + x.fix_min) as resolved
  from (
    select d.d, k,
           d.d + make_interval(hours => floor(public.it_hash01(d.d::text || k || 'sh') * 24)::int) as impact_start,
           vec.vector, vec.title, vec.software_id,
           case when hp < .06 then 1 when hp < .30 then 2 else 3 end as severity,
           ((case when hp < .06 then 30 + 330 * h1 when hp < .30 then 120 + 2760 * h1 else 360 + 14000 * h1 end)
             * (1.2 - 0.5 * ((d.d - date '2025-04-01') / 547.0)))::int as mttd_min,
           (case when hp < .06 then 30 + 210 * h2 when hp < .30 then 60 + 540 * h2 else 120 + 2760 * h2 end)::int as mttc_min,
           (60 + 4260 * h3)::int as fix_min,
           (array['REG001', 'REG002', 'REG003', 'REG004', 'REG005'])[1 + floor(public.it_hash01(d.d::text || k || 'rg') * 5)::int] as region_id,
           case when vec.vector = 'Credential stuffing' then 'Dealer Network'
                else (array['Corporate', 'Finance', 'Sales', 'HR', 'Engineering', 'Manufacturing', 'Logistics', 'Dealer Network'])[1 + floor(public.it_hash01(d.d::text || k || 'dp') * 8)::int] end as department
    from (select g::date as d from generate_series(date '2025-04-01', date '2026-09-30', interval '1 day') g) d
    cross join generate_series(1, 3) k
    cross join lateral (select public.it_hash01(d.d::text || k || 'sp') hp, public.it_hash01(d.d::text || k || 's1') h1,
                               public.it_hash01(d.d::text || k || 's2') h2, public.it_hash01(d.d::text || k || 's3') h3,
                               public.it_hash01(d.d::text || k || 'sv') hv) h
    cross join lateral (
      select * from (values
        ('Phishing',              'Credential phishing led to mailbox compromise', 'SW08'),
        ('Malware',               'Malware detected and executed on endpoint',      'SW12'),
        ('Credential stuffing',   'Credential-stuffing attack on dealer logins',    'SW05'),
        ('Vulnerability exploit', 'Exploitation attempt on internet-facing server', 'SW01'),
        ('Insider misuse',        'Unauthorised data export by a user',             'SW02'),
        ('DDoS',                  'Volumetric DDoS on public web endpoints',        null),
        ('Lost device',           'Lost or stolen laptop with company data',        'SW08')) v(vector, title, software_id)
      where v.vector = case
        when d.d between date '2026-08-01' and date '2026-08-31' and h.hv < .45 then 'Credential stuffing'
        when h.hv < .35 then 'Phishing' when h.hv < .53 then 'Malware' when h.hv < .65 then 'Credential stuffing'
        when h.hv < .75 then 'Vulnerability exploit' when h.hv < .82 then 'Insider misuse' when h.hv < .90 then 'DDoS' else 'Lost device' end
    ) vec
    where public.it_hash01(d.d::text || k || 'occ') < case when d.d between date '2026-08-01' and date '2026-08-31' then .22 else .09 end
  ) x
) y;

-- ---------------------------------------------------------------------------
-- Daily threat volumes by vector (detected vs blocked)
-- ---------------------------------------------------------------------------
insert into public.it_fact_threat_daily
select d.d, v.vector, x.detected,
       x.detected - floor(x.detected * v.leak * public.it_hash01(d.d || v.vector || 'lk'))::int
from (select g::date as d from generate_series(date '2025-04-01', date '2026-09-30', interval '1 day') g) d
cross join (values ('Phishing email', 800, 700, .004), ('Malware', 50, 150, .010), ('Intrusion attempt', 2000, 3000, .001),
                   ('Credential stuffing', 100, 300, .006), ('DDoS', 0, 3, .000)) v(vector, base, spread, leak)
cross join lateral (select round((v.base + v.spread * public.it_hash01(d.d || v.vector || 'vol'))
                       * case when v.vector = 'Credential stuffing' and d.d between date '2026-08-01' and date '2026-08-31' then 8 else 1 end
                       * case when extract(isodow from d.d) in (6, 7) then 0.6 else 1 end)::int as detected) x;

-- ---------------------------------------------------------------------------
-- Monthly phishing simulations per department
-- ---------------------------------------------------------------------------
insert into public.it_fact_phishing_sim
select 'PS-' || to_char(m, 'YYYYMM') || '-' || replace(dep.department, ' ', ''), (m + interval '9 days')::date, dep.department, x.sent,
       round(x.sent * x.click_rate)::int, round(x.sent * x.report_rate)::int
from generate_series(date '2025-04-01', date '2026-09-01', interval '1 month') m
cross join (values ('Corporate', 600), ('Finance', 180), ('Sales', 320), ('HR', 90), ('Engineering', 450), ('Manufacturing', 380),
                   ('Logistics', 140), ('Dealer Network', 520)) dep(department, staff)
cross join lateral (
  select (dep.staff * (0.9 + 0.2 * public.it_hash01(m || dep.department || 'n')))::int as sent,
         greatest(0.01, (case when dep.department = 'Dealer Network' then 0.17 - 0.05 * t else 0.14 - 0.09 * t end)
                        * (0.8 + 0.4 * public.it_hash01(m || dep.department || 'c'))) as click_rate,
         least(0.9, (0.20 + 0.35 * t) * (0.8 + 0.4 * public.it_hash01(m || dep.department || 'r'))) as report_rate
  from (select (m::date - date '2025-04-01') / 517.0 as t) tt
) x;

-- ---------------------------------------------------------------------------
-- Risk register
-- ---------------------------------------------------------------------------
insert into public.it_fact_security_risk values
  ('RSK-01','OT patch backlog on plant line controllers',               'Vulnerability', 4, 5, 'Plant IT Lead',            'SW06','SRV006','Mitigating','Quarterly OT maintenance windows, network segmentation','2026-10-15'),
  ('RSK-02','Credential stuffing against dealer portal logins',         'Identity',      4, 4, 'Dealer Systems Lead',      'SW05','SRV002','Mitigating','Enforce MFA for all dealer users, bot protection',       '2026-10-10'),
  ('RSK-03','Ransomware delivered through phishing',                    'Malware',       3, 5, 'CISO',                     'SW08', null,   'Mitigating','EDR coverage, phishing training, offline backups',        '2026-11-01'),
  ('RSK-04','Single point of failure in plant edge network (Pune 02)',  'Resilience',    4, 4, 'Network Lead',              null, 'SRV006','Open',      'Redundant edge routers, failover testing',                '2026-10-05'),
  ('RSK-05','Third-party SaaS provider data breach',                    'Third party',   2, 4, 'Vendor Risk Manager',       'SW02','SRV003','Open',      'Annual vendor assessments, DPA audit rights',             '2026-12-01'),
  ('RSK-06','Privileged access not reviewed in SAP',                    'Identity',      3, 4, 'ERP Platform Lead',         'SW01','SRV001','Mitigating','Quarterly access recertification',                        '2026-10-20'),
  ('RSK-07','Telemetry ingest API abuse / scraping',                    'Application',   3, 3, 'Connected Vehicle Lead',     null, 'SRV010','Open',      'API gateway rate limits, client certificates',            '2026-11-15'),
  ('RSK-08','Insider export of CRM customer data',                      'Data',          2, 4, 'Head of Sales Operations',  'SW02','SRV003','Open',      'DLP rules on export, alerting on bulk downloads',          '2026-12-10'),
  ('RSK-09','Unsupported OS on workshop diagnostic PCs',                'Vulnerability', 3, 3, 'Aftersales Platforms Lead', 'SW04','SRV004','Mitigating','Hardware refresh programme FY26-27',                      '2026-11-30'),
  ('RSK-10','DDoS on public dealer and customer endpoints',             'Availability',  2, 3, 'Network Lead',              'SW05','SRV002','Accepted',  'CDN-based DDoS protection in place',                      '2027-01-15'),
  ('RSK-11','Lost laptops with unencrypted engineering data',           'Data',          2, 3, 'Engineering IT Lead',       'SW13', null,   'Mitigating','Full-disk encryption enforcement',                        '2026-11-20'),
  ('RSK-12','Payroll data exposure through misconfigured sharing',      'Data',          1, 4, 'CHRO',                      'SW09','SRV008','Accepted',  'Sharing restricted to HR groups',                         '2027-02-01'),
  ('RSK-13','Shadow IT analytics workbooks with customer data',         'Data',          3, 2, 'Head of Data & Analytics',  'SW14', null,   'Open',      'Inventory and classify published workbooks',              '2026-12-15'),
  ('RSK-14','Weak service-account passwords in integration jobs',       'Identity',      3, 4, 'Integration Lead',           null, 'SRV001','Open',      'Move to vaulted secrets with rotation',                   '2026-10-25');

-- Security: read-only for the public key
do $$
declare t text;
begin
  foreach t in array array['it_fact_vulnerability', 'it_fact_security_incident', 'it_fact_threat_daily', 'it_fact_phishing_sim', 'it_fact_security_risk'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy it_public_read on public.%I for select using (true)', t);
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);
  end loop;
end $$;

commit;

analyze public.it_fact_vulnerability, public.it_fact_security_incident, public.it_fact_threat_daily, public.it_fact_phishing_sim;
