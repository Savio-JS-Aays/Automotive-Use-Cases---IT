-- 002_it_licensing_seed.sql
-- Deterministic demo seed for the IT licensing tables created in 001.
-- No random(): every value comes from it_hash01(seed text), so re-running gives identical data.
-- As-of date 2026-09-30. Indian fiscal year (Apr-Mar). Usage history Apr-2025 .. Sep-2026; budget to Mar-2027.
--
-- Built-in stories (for the demo):
--   * Siemens Teamcenter Author/Consumer: high cost, utilisation falling to ~52-56%  -> "Optimise" quadrant
--   * Autodesk: 172 seats assigned vs 150 purchased                                    -> true-up risk
--   * Salesforce (notice deadline in 15 d, auto-renew 7% uplift) and ServiceNow (1 d)  -> decisions due
--   * Manufacturing vertical budgeted ~6% below run-rate + Autodesk true-up invoice     -> over budget
--   * Keyloop DMS MSA exists only as an unsigned draft                                  -> missing signed MSA
--   * Tableau Viewer utilisation ~41%                                                    -> shelfware

begin;

truncate public.it_license_document, public.it_fact_software_spend_monthly, public.it_fact_license_assignment,
         public.it_fact_license_usage_monthly, public.it_fact_entitlement, public.it_fact_contract,
         public.it_dim_software, public.it_dim_vendor, public.it_license_config cascade;  -- cascade: 008's it_fact_invoice (re-run 009 after this)

insert into public.it_license_config (key, value, description) values
  ('as_of_date',          '2026-09-30', 'Demo "today". All windows end here.'),
  ('fy_start_month',      '4',          'Indian fiscal year starts in April'),
  ('dormant_days',        '90',         'Seat with no login for this many days is reclaimable'),
  ('active_days',         '30',         'Seat with a login within this many days counts as active'),
  ('target_utilisation',  '0.85',       'Active-30d seats / purchased seats target'),
  ('renewal_window_days', '90',         'Renewal exposure window'),
  ('decision_window_days','30',         'Notice deadline within this many days = decision due'),
  ('currency',            'INR',        'All *_inr columns are Indian rupees');

insert into public.it_dim_vendor values
  ('V01', 'SAP',                              'Enterprise software', 'Low',    'MaxAttention', 'Germany'),
  ('V02', 'Salesforce',                       'SaaS platform',       'Medium', 'Premier',      'USA'),
  ('V03', 'Siemens Digital Industries Software','Industrial software','Medium','Premium',      'Germany'),
  ('V04', 'Daimler Truck',                    'OEM group tooling',   'Low',    'Group IT',     'Germany'),
  ('V05', 'Keyloop',                          'Automotive retail',   'High',   'Standard',     'UK'),
  ('V06', 'ServiceNow',                       'SaaS platform',       'Low',    'Enhanced',     'USA'),
  ('V07', 'Microsoft',                        'Productivity cloud',  'Low',    'Unified',      'USA'),
  ('V08', 'Workday',                          'SaaS platform',       'Low',    'Standard',     'USA'),
  ('V09', 'Oracle',                           'Enterprise software', 'Medium', 'Premier',      'USA'),
  ('V10', 'Zscaler',                          'Security',            'Low',    'Premium',      'USA'),
  ('V11', 'CrowdStrike',                      'Security',            'Medium', 'Elite',        'USA'),
  ('V12', 'Autodesk',                         'Engineering software','Medium', 'Standard',     'USA'),
  ('V13', 'Zendesk',                          'SaaS platform',       'Low',    'Standard',     'USA');

insert into public.it_dim_software (software_id, software_name, short_name, vendor_id, category, deployment, business_vertical, criticality_tier, business_owner, description) values
  ('SW01', 'SAP S/4HANA', 'SAP S/4HANA',                      'V01', 'ERP',              'Hybrid',  'Finance',       1, 'CFO Office',              'Core ERP: finance, procurement, supply chain'),
  ('SW02', 'Salesforce Sales Cloud', 'Sales Cloud',           'V02', 'CRM',              'SaaS',    'Sales',         1, 'Head of Sales Operations','Fleet and dealer sales pipeline'),
  ('SW03', 'Siemens Teamcenter', 'Teamcenter',               'V03', 'PLM',              'On-prem', 'Manufacturing', 1, 'Head of Product Engineering','Product lifecycle and BOM management'),
  ('SW04', 'Xentry Diagnosis', 'Xentry',                 'V04', 'Diagnostics',      'Hybrid',  'Aftersales',    1, 'Head of Service',         'Workshop diagnostic software for dealer bays'),
  ('SW05', 'Keyloop Autoline DMS', 'Autoline DMS',             'V05', 'DMS',              'SaaS',    'Aftersales',    1, 'Head of Dealer Network',  'Dealer management: sales, service, parts'),
  ('SW06', 'Siemens Opcenter MES', 'Opcenter MES',             'V03', 'MES',              'On-prem', 'Manufacturing', 1, 'Plant Operations Head',   'Manufacturing execution on the assembly lines'),
  ('SW07', 'ServiceNow ITSM', 'ServiceNow',                  'V06', 'ITSM',             'SaaS',    'Corporate',     2, 'CIO',                     'IT service management'),
  ('SW08', 'Microsoft 365', 'M365',                    'V07', 'Productivity',     'SaaS',    'Corporate',     2, 'CIO',                     'Email, Office, Teams'),
  ('SW09', 'Workday HCM', 'Workday',                      'V08', 'HCM',              'SaaS',    'HR',            2, 'CHRO',                    'Core HR and payroll'),
  ('SW10', 'Oracle Transportation Management', 'Oracle TMS', 'V09', 'TMS',              'SaaS',    'Logistics',     2, 'Head of Logistics',       'Outbound vehicle and parts logistics'),
  ('SW11', 'Zscaler Internet Access', 'Zscaler',          'V10', 'Security',         'SaaS',    'Corporate',     1, 'CISO',                    'Secure web gateway'),
  ('SW12', 'CrowdStrike Falcon', 'CrowdStrike',               'V11', 'Security',         'SaaS',    'Corporate',     1, 'CISO',                    'Endpoint detection and response'),
  ('SW13', 'Autodesk Inventor & AutoCAD', 'Autodesk',      'V12', 'CAD',              'Hybrid',  'Manufacturing', 3, 'Head of Tooling',         'Tooling and plant layout design'),
  ('SW14', 'Tableau', 'Tableau',                          'V02', 'Analytics',        'SaaS',    'Corporate',     3, 'Head of Data & Analytics','Self-service BI'),
  ('SW15', 'Zendesk Suite', 'Zendesk',                    'V13', 'Customer Service', 'SaaS',    'Aftersales',    2, 'Head of Customer Care',   'Customer and dealer support desk');

-- ---------------------------------------------------------------------------
-- Seed parameters (temporary)
-- ---------------------------------------------------------------------------
create temp table seed_region (profile text, region_id text, w numeric, ord int) on commit drop;
insert into seed_region values
  ('national','REG001',.24,1),('national','REG002',.26,2),('national','REG003',.14,3),('national','REG004',.24,4),('national','REG005',.12,5),
  ('plant',   'REG001',.20,1),('plant',   'REG002',.30,2),('plant',   'REG003',.05,3),('plant',   'REG004',.35,4),('plant',   'REG005',.10,5),
  ('dealer',  'REG001',.22,1),('dealer',  'REG002',.24,2),('dealer',  'REG003',.18,3),('dealer',  'REG004',.22,4),('dealer',  'REG005',.14,5),
  ('hq',      'REG001',.40,1),('hq',      'REG002',.25,2),('hq',      'REG003',.10,3),('hq',      'REG004',.20,4),('hq',      'REG005',.05,5);

-- cumulative weight bounds per profile
create temp table seed_region_cum on commit drop as
select profile, region_id, ord,
       coalesce(sum(w) over (partition by profile order by ord rows between unbounded preceding and 1 preceding), 0) as lo,
       sum(w) over (partition by profile order by ord) as hi
from seed_region;

-- rates: assign_* = assigned / purchased; a90_*, a30_* = share of ASSIGNED seats active in 90 / 30 days
create temp table seed_edition (
  software_id text, edition text, metric text, seats int, price numeric,
  assign_now numeric, a90_now numeric, a30_now numeric, assign_start numeric, a30_start numeric,
  profile text, departments text[]
) on commit drop;
insert into seed_edition values
  ('SW01','Professional',   'Named user',     420, 14500, .98, .96, .93, .96, .91, 'hq',      '{Finance,Procurement,Supply Chain,Controlling}'),
  ('SW01','Functional',     'Named user',     280,  6200, .96, .92, .86, .95, .84, 'plant',   '{Stores,Production Planning,Quality}'),
  ('SW02','Enterprise',     'Named user',     650, 13200, .97, .90, .84, .95, .86, 'dealer',  '{Sales,Fleet Sales,Key Accounts}'),
  ('SW03','Author',         'Named user',     180, 21000, .92, .70, .57, .95, .87, 'plant',   '{Product Engineering,R&D,Vehicle Integration}'),
  ('SW03','Consumer',       'Named user',     400,  3800, .88, .76, .64, .90, .80, 'plant',   '{Manufacturing Engineering,Quality,Sourcing}'),
  ('SW04','Workshop Device','Device',        1100,  4200, .99, .98, .95, .97, .93, 'dealer',  '{Dealer Workshop}'),
  ('SW05','Dealer User',    'Named user',    2400,  2100, .96, .95, .91, .94, .89, 'dealer',  '{Dealer Sales,Dealer Service,Dealer Parts}'),
  ('SW06','Concurrent',     'Concurrent user', 260, 9800, .97, .96, .93, .96, .92, 'plant',   '{Production,Maintenance,Quality}'),
  ('SW07','Fulfiller',      'Named user',     220,  8900, .96, .94, .89, .94, .87, 'hq',      '{IT Service Desk,IT Infrastructure,IT Applications}'),
  ('SW08','E3',             'Named user',    3000,  2950, .97, .95, .92, .96, .91, 'national','{Corporate,Finance,Sales,HR,Engineering}'),
  ('SW08','F3',             'Named user',    1200,   750, .93, .85, .76, .90, .78, 'plant',   '{Shop Floor,Warehouse}'),
  ('SW09','HR Practitioner','Named user',     160,  6500, .98, .97, .93, .97, .92, 'hq',      '{HR}'),
  ('SW10','Named',          'Named user',     140, 11500, .95, .89, .82, .93, .83, 'national','{Logistics,Outbound Planning}'),
  ('SW11','Per User',       'Employee',      3800,   520, .98, .99, .97, .97, .96, 'national','{All Employees}'),
  ('SW12','Endpoint',       'Device',        4500,   610, .99, .99, .98, .98, .97, 'national','{All Endpoints}'),
  ('SW13','Named',          'Named user',     150,  7400, 172.0/150, .93, .86, .93, .88, 'plant', '{Product Engineering,Tooling,Plant Engineering}'),
  ('SW14','Creator',        'Named user',      60,  6300, .95, .93, .88, .93, .86, 'hq',      '{Data & Analytics,Finance,Sales}'),
  ('SW14','Viewer',         'Named user',     900,  1250, .85, .62, .48, .88, .70, 'national','{Corporate,Finance,Sales,Aftersales,Logistics}'),
  ('SW15','Agent',          'Named user',     320,  7900, .94, .86, .77, .92, .80, 'dealer',  '{Customer Care,Dealer Support}');

-- contracts: id, software, start, end, auto_renew, notice, billing, currency, uplift, owner
create temp table seed_contract (contract_id text, software_id text, start_date date, end_date date, auto_renew boolean,
  notice int, billing text, currency text, uplift numeric, owner text) on commit drop;
insert into seed_contract values
  ('CT-2024-001','SW01','2024-04-01','2027-03-31',false, 90,'Annual',   'EUR',3.0,'IT Sourcing'),
  ('CT-2023-002','SW02','2023-11-15','2026-11-14',true,  30,'Annual',   'USD',7.0,'IT Sourcing'),
  ('CT-2024-003','SW03','2024-07-01','2027-06-30',false, 90,'Annual',   'EUR',4.0,'Engineering Procurement'),
  ('CT-2025-004','SW04','2025-01-01','2027-12-31',false,120,'Annual',   'EUR',2.5,'Aftersales Procurement'),
  ('CT-2025-005','SW05','2025-04-01','2028-03-31',false, 90,'Monthly',  'INR',5.0,'Aftersales Procurement'),
  ('CT-2024-006','SW06','2024-10-01','2027-09-30',false, 90,'Annual',   'EUR',3.5,'Engineering Procurement'),
  ('CT-2024-007','SW07','2024-01-01','2026-12-15',true,  75,'Annual',   'USD',6.0,'IT Sourcing'),
  ('CT-2024-008','SW08','2024-04-01','2027-03-31',false, 30,'Monthly',  'INR',5.0,'IT Sourcing'),
  ('CT-2024-009','SW09','2024-09-01','2027-08-31',false, 60,'Annual',   'USD',5.0,'HR Procurement'),
  ('CT-2023-010','SW10','2023-12-21','2026-12-20',false, 30,'Quarterly','USD',5.0,'Logistics Procurement'),
  ('CT-2025-011','SW11','2025-02-01','2027-01-31',true,  60,'Annual',   'USD',5.0,'IT Sourcing'),
  ('CT-2025-012','SW12','2025-06-01','2028-05-31',false, 60,'Annual',   'USD',4.0,'IT Sourcing'),
  ('CT-2024-013','SW13','2024-01-15','2027-01-14',false, 60,'Annual',   'USD',5.0,'Engineering Procurement'),
  ('CT-2024-014','SW14','2024-01-01','2026-12-15',true,  45,'Annual',   'USD',7.0,'IT Sourcing'),
  ('CT-2024-015','SW15','2024-06-01','2027-05-31',false, 60,'Monthly',  'USD',5.0,'Aftersales Procurement');

-- ---------------------------------------------------------------------------
-- Contracts and entitlements
-- ---------------------------------------------------------------------------
insert into public.it_fact_contract
select c.contract_id, c.software_id, s.vendor_id,
       s.software_name || ' subscription ' || to_char(c.start_date, 'YYYY') || '-' || to_char(c.end_date, 'YY'),
       c.start_date, c.end_date, c.auto_renew, c.notice, c.billing,
       (select sum(e.seats * e.price * 12) from seed_edition e where e.software_id = c.software_id),
       c.currency, c.uplift, 'Active', s.business_vertical, c.owner
from seed_contract c join public.it_dim_software s using (software_id);

insert into public.it_fact_entitlement
select 'ENT-' || e.software_id || '-' || row_number() over (partition by e.software_id order by e.price desc),
       c.contract_id, e.software_id, e.edition, e.metric, e.seats, e.price
from seed_edition e join seed_contract c using (software_id);

-- ---------------------------------------------------------------------------
-- Seat assignments at the as-of date
-- Seat n is placed in the region whose cumulative weight band contains (n-0.5)/assigned, so regional assigned
-- counts track the regional allocation (no spurious over-deployment except SW13).
-- ---------------------------------------------------------------------------
insert into public.it_fact_license_assignment
select 'ASG-' || e.software_id || '-' || replace(e.edition, ' ', '') || '-' || lpad(n::text, 5, '0'),
       e.software_id, e.edition,
       'EMP' || (10000 + floor(public.it_hash01(e.software_id || e.edition || n || 'emp') * 89999))::int,
       e.departments[1 + floor(public.it_hash01(e.software_id || e.edition || n || 'dept') * array_length(e.departments, 1))::int],
       rc.region_id,
       date '2026-09-30' - (30 + floor(public.it_hash01(e.software_id || e.edition || n || 'asg') * 900))::int,
       case
         when h < e.a30_now then date '2026-09-30' - floor(h2 * 28)::int
         when h < e.a90_now then date '2026-09-30' - (31 + floor(h2 * 58))::int
         when h2 < 0.3      then null
         else                    date '2026-09-30' - (91 + floor(h2 * 270))::int
       end,
       case
         when h < e.a30_now then 'Active'
         when h < e.a90_now then 'Inactive 30-90d'
         when h2 < 0.3      then 'Never used'
         else                    'Dormant'
       end
from seed_edition e
cross join lateral generate_series(1, round(e.seats * e.assign_now)::int) as n
cross join lateral (select public.it_hash01(e.software_id || e.edition || n || 'act')  as h,
                           public.it_hash01(e.software_id || e.edition || n || 'act2') as h2) r
join seed_region_cum rc
  on rc.profile = e.profile
 and (n - 0.5) / round(e.seats * e.assign_now) >= rc.lo
 and (n - 0.5) / round(e.seats * e.assign_now) <  rc.hi;

-- ---------------------------------------------------------------------------
-- Monthly usage. Regional allocation of purchased seats uses rounded cumulative bounds so regions sum exactly.
-- Sep-2026 is aggregated from the assignment rows above; Apr-2025..Aug-2026 trend from *_start to *_now.
-- ---------------------------------------------------------------------------
create temp table seed_alloc on commit drop as
select e.software_id, e.edition, rc.region_id,
       (round(e.seats * rc.hi) - round(e.seats * rc.lo))::int as allocated
from seed_edition e join seed_region_cum rc on rc.profile = e.profile;

insert into public.it_fact_license_usage_monthly
select a.software_id, a.edition, a.region_id, date '2026-09-01', a.allocated,
       count(s.assignment_id),
       count(s.assignment_id) filter (where s.last_login_date >= date '2026-09-30' - 90),
       count(s.assignment_id) filter (where s.last_login_date >= date '2026-09-30' - 30)
from seed_alloc a
left join public.it_fact_license_assignment s
  on s.software_id = a.software_id and s.edition = a.edition and s.region_id = a.region_id
group by a.software_id, a.edition, a.region_id, a.allocated;

insert into public.it_fact_license_usage_monthly
select a.software_id, a.edition, a.region_id, m.month_start, a.allocated,
       x.assigned,
       least(x.assigned, round(x.assigned * least(1, x.a30 + (e.a90_now - e.a30_now))))::int,
       least(x.assigned, round(x.assigned * x.a30))::int
from seed_alloc a
join seed_edition e using (software_id, edition)
cross join lateral (
  select (date '2025-04-01' + (k || ' months')::interval)::date as month_start, k / 17.0 as t
  from generate_series(0, 16) as k
) m
cross join lateral (
  select round(a.allocated * (e.assign_start + (e.assign_now - e.assign_start) * m.t
               + (public.it_hash01(a.software_id || a.edition || a.region_id || m.month_start || 'as') - 0.5) * 0.02))::int as assigned,
         greatest(0, e.a30_start + (e.a30_now - e.a30_start) * m.t
               + (public.it_hash01(a.software_id || a.edition || a.region_id || m.month_start || 'a3') - 0.5) * 0.03) as a30
) x;

-- ---------------------------------------------------------------------------
-- Monthly spend vs budget, Apr-2025 .. Mar-2027, allocated to regions by seat share.
-- FY25-26 runs at the pre-uplift price; FY26-27 at today's price. Actuals stop at Sep-2026.
-- Manufacturing products were budgeted ~6% under run-rate; Autodesk true-up invoiced Aug-2026.
-- ---------------------------------------------------------------------------
insert into public.it_fact_software_spend_monthly
select r.software_id, r.region_id, m.month_start,
       round(cost * case when m.month_start >= date '2026-04-01'
                         then (case when r.software_id in ('SW03','SW06','SW13') then 0.94 else 1.03 end)
                         else 1.02 end, 2),
       case when m.month_start <= date '2026-09-01' then
         round(cost * (1 + (public.it_hash01(r.software_id || r.region_id || m.month_start || 'sp') - 0.5) * 0.03)
               + case when r.software_id = 'SW13' and m.month_start = date '2026-08-01'
                      then 22 * 7400 * 12 * r.share else 0 end, 2)
       end,
       case when m.month_start > date '2026-09-01' then 0
            when c.billing = 'Monthly' then 1
            when c.billing = 'Quarterly' and extract(month from m.month_start) in (1, 4, 7, 10) then 1
            when c.billing = 'Annual' and extract(month from m.month_start) = extract(month from c.start_date) then 1
            else 0 end
       + case when r.software_id = 'SW13' and m.month_start = date '2026-08-01' then 1 else 0 end,
       case when r.software_id = 'SW13' and m.month_start = date '2026-08-01' then 'Includes true-up invoice for 22 over-deployed seats' end
from (
  select a.software_id, a.region_id,
         sum(a.allocated * e.price) as monthly_now,
         sum(a.allocated)::numeric / sum(sum(a.allocated)) over (partition by a.software_id) as share
  from seed_alloc a join seed_edition e using (software_id, edition)
  group by a.software_id, a.region_id
) r
join seed_contract c using (software_id)
cross join lateral (select (date '2025-04-01' + (k || ' months')::interval)::date as month_start from generate_series(0, 23) k) m
cross join lateral (select case when m.month_start >= date '2026-04-01' then r.monthly_now
                                else r.monthly_now / (1 + c.uplift / 100) end as cost) cc;

-- ---------------------------------------------------------------------------
-- Contract documents. Files are generated by scripts/generate-contract-docs.mjs into public/contracts/.
-- ---------------------------------------------------------------------------
insert into public.it_license_document (document_id, contract_id, doc_type, title, version, effective_date, file_url, size_kb, is_current, is_signed, uploaded_at)
select d.document_id, d.contract_id, d.doc_type, d.title, d.version, d.effective_date,
       '/contracts/' || d.contract_id || '/' || d.document_id || '.pdf',
       null::int,  -- size_kb: filled when files move to Storage
       d.is_current, d.is_signed, (d.effective_date + time '10:00')::timestamptz
from (
  -- Master agreement (Keyloop DMS only has an unsigned draft)
  select c.contract_id || '-MSA' as document_id, c.contract_id, 'MSA' as doc_type,
         'Master Subscription Agreement - ' || s.software_name as title,
         case when c.software_id = 'SW05' then '0.9 (draft)' else '1.0' end as version,
         c.start_date as effective_date, true as is_current, c.software_id <> 'SW05' as is_signed
  from seed_contract c join public.it_dim_software s using (software_id)
  union all
  -- Order form; Teamcenter and Microsoft 365 had a seat amendment, so v1 is superseded
  select c.contract_id || '-OF1', c.contract_id, 'Order Form', 'Order Form - ' || s.software_name, '1.0',
         c.start_date, c.software_id not in ('SW03','SW08'), true
  from seed_contract c join public.it_dim_software s using (software_id)
  union all
  select c.contract_id || '-OF2', c.contract_id, 'Order Form', 'Order Form Amendment (seat change) - ' || s.software_name, '2.0',
         c.start_date + 365, true, true
  from seed_contract c join public.it_dim_software s using (software_id)
  where c.software_id in ('SW03','SW08')
  union all
  -- SaaS products carry an SLA and a data processing agreement
  select c.contract_id || '-SLA', c.contract_id, 'SLA', 'Service Level Agreement - ' || s.software_name, '1.0', c.start_date, true, true
  from seed_contract c join public.it_dim_software s using (software_id) where s.deployment in ('SaaS','Hybrid')
  union all
  select c.contract_id || '-DPA', c.contract_id, 'DPA', 'Data Processing Agreement (DPDP Act 2023) - ' || s.software_name, '1.0', c.start_date, true, true
  from seed_contract c join public.it_dim_software s using (software_id) where s.deployment = 'SaaS'
  union all
  -- On-prem products carry a support & maintenance SOW
  select c.contract_id || '-SOW', c.contract_id, 'SOW', 'Support & Maintenance SOW - ' || s.software_name, '1.0', c.start_date, true, true
  from seed_contract c join public.it_dim_software s using (software_id) where s.deployment = 'On-prem'
  union all
  -- Renewal quotes for contracts ending within 120 days of the as-of date (not signed yet)
  select c.contract_id || '-RQ', c.contract_id, 'Renewal Quote', 'Renewal Quote ' || to_char(c.end_date + 1, 'YYYY') || ' - ' || s.software_name, '1.0',
         date '2026-09-30' - 10, true, false
  from seed_contract c join public.it_dim_software s using (software_id) where c.end_date <= date '2026-09-30' + 120
  union all
  -- Latest invoice
  select c.contract_id || '-INV', c.contract_id, 'Invoice', 'Invoice ' || to_char(date '2026-09-01', 'Mon YYYY') || ' - ' || s.software_name, '1.0',
         date '2026-09-05', true, false
  from seed_contract c join public.it_dim_software s using (software_id)
) d;

commit;

analyze public.it_fact_license_assignment, public.it_fact_license_usage_monthly, public.it_fact_software_spend_monthly, public.it_license_document;
