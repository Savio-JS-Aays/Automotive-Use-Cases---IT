import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AlarmClock, ArrowRight, BadgeIndianRupee, Timer, TrendingDown } from 'lucide-react';
import KpiCard from '../../components/KpiCard';
import Panel, { PageHeader } from '../../components/Panel';
import OperationsPulse from './OperationsPulse';
import StatusBadge from '../../components/StatusBadge';
import LoadError from '../../components/LoadError';
import Drawer from '../../components/Drawer';
import IncidentDrawer from '../../components/IncidentDrawer';
import IncidentsTable from '../../components/IncidentsTable';
import PriorityIncidentCard from './PriorityIncidentCard';
import { useRpc } from '../../hooks/useRpc';
import { useGlobalStore } from '../../store/useGlobalStore';
import { matchesPrio, prioShort } from '../../lib/priority';
import { useRawTables } from '../../hooks/useRawTables';
import { useItFilters } from '../../hooks/useItFilters';
import { usePatchUrlParams, useUrlParam } from '../../hooks/useUrlParam';
import { formatINR, formatPct } from '../../lib/format';
import { selectCls as suiteSelect } from '../../lib/ui';

const shortDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

const TABLES = {
  services: { table: 'it_dim_service', select: 'service_id, short_name, service_name, business_vertical, software_id', options: { orderBy: 'service_id' } },
  software: { table: 'it_dim_software', select: 'software_id, business_vertical', options: { orderBy: 'software_id' } },
};
const median = (xs) => {
  if (!xs.length) return null;
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
const selectCls = `mt-1.5 ${suiteSelect}`;

export default function OverviewModule() {
  const filters = useItFilters();
  const { data, loading, error } = useRpc('it_ops_overview', { p_filters: filters });
  const [cell, setCell] = useUrlParam('cell');           // "SRV002|2026-09-12"
  const [incident, setIncident] = useUrlParam('incident');
  const patchUrl = usePatchUrlParams();
  const prio = useGlobalStore((st) => st.incidentPriority);
  const [vertical] = useUrlParam('vertical');
  const [service] = useUrlParam('service');
  const [cellService, cellDate] = cell ? cell.split('|') : [null, null];
  const { data: dims } = useRawTables(TABLES);
  const allServices = useMemo(() => dims.services ?? [], [dims.services]);
  const verticals = useMemo(() => [...new Set([...allServices, ...(dims.software ?? [])].map((x) => x.business_vertical))].sort(), [allServices, dims.software]);
  const svc = allServices.find((x) => x.service_id === service);
  // Services in scope: the one picked, else every service of the vertical, else all (null)
  const scope = useMemo(() => (service ? new Set([service]) : vertical ? new Set(allServices.filter((x) => x.business_vertical === vertical).map((x) => x.service_id)) : null), [service, vertical, allServices]);
  // Incident KPIs are computed from the incident list (current window) so they can follow the service / vertical filter
  const incidents = useRpc('it_ops_incidents', { p_filters: { days: filters.days, region: filters.region }, p_limit: 3000 });
  const rel = useRpc('it_rel_overview', { p_filters: filters });
  const licFilters = service ? { region: filters.region, software: svc?.software_id ?? '__none__' } : { region: filters.region, vertical };
  const lic = useRpc('it_lic_kpis_ext', { p_filters: licFilters });
  const cellIncidents = useRpc('it_ops_incidents', { p_filters: { ...filters, service: cellService }, p_date: cellDate }, Boolean(cell));


  if (error) return <LoadError error={error} what="the Overview" />;
  const w = data?.window;
  const inScope = (incidents.data ?? []).filter((i) => !scope || scope.has(i.service_id));
  const day = (i) => i.open_time.slice(0, 10);
  const cur = w ? inScope.filter((i) => day(i) >= w.d_from && day(i) <= w.d_to) : [];
  const mttrOf = (xs) => { const m = median(xs.filter((i) => i.status === 'Resolved' && i.mttr_minutes != null).map((i) => i.mttr_minutes)); return m == null ? null : m / 60; };
  const k = {
    mttr_h: mttrOf(cur.filter(matchesPrio(prio))),
    downtime_cost: (rel.data?.services ?? []).filter((x) => !scope || scope.has(x.service_id)).reduce((t, x) => t + Number(x.downtime_cost || 0), 0),
  };
  const cellAvail = cell ? data?.heatmap.find((c) => c.service_id === cellService && c.date === cellDate)?.availability ?? null : null;
  const prioCounts = { all: cur.length, 12: cur.filter((i) => i.priority <= 2).length, ...Object.fromEntries([1, 2, 3, 4].map((p) => [String(p), cur.filter((i) => i.priority === p).length])) };
  const lk = service && !svc?.software_id ? {} : lic.data ?? {};
  const noLicence = Boolean(service && svc && !svc.software_id);
  const busy = (q) => (q.loading && !q.data) || (loading && !data);
  const show = (q, v, fmt) => (busy(q) ? '…' : v === null || v === undefined ? '—' : fmt(v));
  const scopeLabel = svc ? svc.short_name : vertical ? `${vertical} (${scope?.size ?? 0} service${scope?.size === 1 ? '' : 's'})` : null;
  const setVertical = (v) => patchUrl({ vertical: v, service: v && svc && svc.business_vertical !== v ? null : service, cell: null });
  const serviceOptions = allServices.filter((x) => !vertical || x.business_vertical === vertical);

  return (
    <div className="space-y-6 pb-10">
      <PageHeader title="IT Executive Overview" window={data?.window}
        note={[scopeLabel && `KPI cards and the heatmap show ${scopeLabel}; the scorecard and top risks stay portfolio-wide`,
          prio !== 'all' && `Incident Priority ${prioShort(prio)} applies to the incident card, time to resolve and the pulse Incidents view`].filter(Boolean).join(' · ') || null}>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-sm font-semibold text-slate-700">
            Vertical
            <select value={vertical ?? ''} onChange={(e) => setVertical(e.target.value)} className={`${selectCls} min-w-40`}>
              <option value="">All verticals</option>
              {verticals.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <label className="flex flex-col text-sm font-semibold text-slate-700">
            Service
            <select value={service ?? ''} onChange={(e) => patchUrl({ service: e.target.value, cell: null })} className={`${selectCls} min-w-48`}>
              <option value="">{vertical ? `All ${vertical} services` : 'All services'}</option>
              {serviceOptions.map((x) => <option key={x.service_id} value={x.service_id}>{x.short_name}</option>)}
            </select>
          </label>
          {(vertical || service) && (
            <button type="button" onClick={() => patchUrl({ vertical: null, service: null, cell: null })}
              className="mb-1.5 text-sm font-medium text-sky-700 hover:underline focus:outline-none focus:ring-2 focus:ring-sky-500 rounded">Clear</button>
          )}
        </div>
      </PageHeader>

      {/* Scorecard */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {(data?.scorecard ?? []).map((s) => (
          <Link key={s.area} to={s.link} className="kpi-card group bg-white rounded-xl shadow-sm border border-slate-200 p-5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-slate-800">{s.area}</span>
              <StatusBadge status={s.status} />
            </div>
            <p className="mt-3 text-[28px] leading-tight font-bold text-slate-900">{s.score}<span className="text-base font-normal text-slate-400">/100</span></p>
            <p className="mt-1 text-[13px] text-slate-500">{s.headline}</p>
            <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-sky-700 group-hover:underline">Open <ArrowRight size={12} aria-hidden="true" /></span>
          </Link>
        ))}
      </div>

      {/* KPIs: follow the Vertical / Service filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <PriorityIncidentCard prio={prio} counts={prioCounts} loading={busy(incidents)} service={service} />
        <KpiCard title={`Median Time to Resolve${prio !== 'all' ? ` · ${prioShort(prio)}` : ''}`} value={show(incidents, k.mttr_h, (v) => `${v.toFixed(1)} h`)} icon={<Timer size={20} />}
          tooltip="Median of (resolution − open) for incidents opened and resolved in the window, all priorities. Incidents still open are not included." />
        <KpiCard title="Cost of Downtime" value={show(rel, k.downtime_cost, formatINR)} icon={<AlarmClock size={20} />}
          sub="downtime minutes × service cost per minute"
          tooltip="Σ per service in scope of downtime minutes in the window × that service's cost of downtime per minute (it_dim_service)." />
        <KpiCard title="Licence Contract Value" value={noLicence ? '—' : show(lic, lk.acv, formatINR)} icon={<BadgeIndianRupee size={20} />}
          sub={noLicence ? 'in-house service, no licence' : lk.utilisation != null ? `utilisation ${formatPct(lk.utilisation)}` : null}
          tooltip="Annual value of active software contracts in scope (Licensing & Subscriptions). Vertical = the software's owning vertical; Service = the product behind that service." />
        <KpiCard title="Licence Shelfware" value={noLicence ? '—' : show(lic, lk.shelfware, formatINR)} icon={<TrendingDown size={20} />}
          sub="annualised cost of unused seats"
          tooltip="Unassigned + dormant seats × unit price × 12 (Licensing & Subscriptions)." />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <OperationsPulse className="xl:col-span-2" data={data} filters={filters} scope={scope} services={allServices} software={dims.software ?? []}
          vertical={vertical} service={service} incidents={cur.filter(matchesPrio(prio))} onServiceDay={(svcId, d) => setCell(`${svcId}|${d}`)} />

        <Panel title="Top risks" tooltip="The most urgent items across reliability, cost, security and data, ranked. Each links to the module that owns it.">
          <ul className="space-y-2">
            {(data?.risks ?? []).slice(0, 6).map((r, i) => (
              <li key={i}>
                <Link to={r.link} className="block rounded-lg border border-slate-200 px-3 py-2 hover:border-sky-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium text-slate-900">{r.title}</span>
                    <StatusBadge status={r.severity} label={r.area} />
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{r.detail}</p>
                </Link>
              </li>
            ))}
            {data && !data.risks.length && <li className="text-sm text-slate-500">No open risks.</li>}
          </ul>
          {data?.risks.length > 6 && <p className="mt-2 text-xs text-slate-500">+{data.risks.length - 6} more in the modules.</p>}
        </Panel>
      </div>

      <Drawer open={Boolean(cell)} onClose={() => setCell(null)} width="max-w-3xl"
        title={cell ? `${data?.services.find((x) => x.service_id === cellService)?.short_name ?? cellService} · ${cellDate ? shortDate(cellDate) : ''}` : ''}
        subtitle={cell ? `Availability ${cellAvail == null ? '—' : formatPct(cellAvail, 2)}` : ''}>
        <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <IncidentsTable rows={cellIncidents.data ?? []} loading={cellIncidents.loading}
            onOpen={(id) => patchUrl({ cell: null, incident: id })} empty="No incidents for this service on this day." />
        </section>
      </Drawer>
      {incident && <IncidentDrawer incidentId={incident} onClose={() => setIncident(null)} />}
    </div>
  );
}
