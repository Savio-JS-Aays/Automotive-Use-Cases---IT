import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AlarmClock, ArrowRight, BadgeIndianRupee, Siren, Timer, TrendingDown } from 'lucide-react';
import KpiCard from '../../components/KpiCard';
import Panel, { PageHeader } from '../../components/Panel';
import Heatmap from '../../components/Heatmap';
import StatusBadge from '../../components/StatusBadge';
import LoadError from '../../components/LoadError';
import Drawer from '../../components/Drawer';
import IncidentDrawer from '../../components/IncidentDrawer';
import IncidentsTable from '../../components/IncidentsTable';
import { useRpc } from '../../hooks/useRpc';
import { useRawTables } from '../../hooks/useRawTables';
import { useItFilters } from '../../hooks/useItFilters';
import { usePatchUrlParams, useUrlParam } from '../../hooks/useUrlParam';
import { AVAILABILITY_BUCKETS, availabilityColor } from '../../lib/chartTheme';
import { formatINR, formatNumber, formatPct, formatSignedPct } from '../../lib/format';

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
const selectCls = 'mt-1 rounded-md border border-slate-300 bg-white py-1.5 px-2 text-sm font-normal text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500';

export default function OverviewModule() {
  const filters = useItFilters();
  const { data, loading, error } = useRpc('it_ops_overview', { p_filters: filters });
  const [cell, setCell] = useUrlParam('cell');           // "SRV002|2026-09-12"
  const [incident, setIncident] = useUrlParam('incident');
  const patchUrl = usePatchUrlParams();
  const [vertical] = useUrlParam('vertical');
  const [service] = useUrlParam('service');
  const [cellService, cellDate] = cell ? cell.split('|') : [null, null];
  const { data: dims } = useRawTables(TABLES);
  const allServices = useMemo(() => dims.services ?? [], [dims.services]);
  const verticals = useMemo(() => [...new Set([...allServices, ...(dims.software ?? [])].map((x) => x.business_vertical))].sort(), [allServices, dims.software]);
  const svc = allServices.find((x) => x.service_id === service);
  // Services in scope: the one picked, else every service of the vertical, else all (null)
  const scope = useMemo(() => (service ? new Set([service]) : vertical ? new Set(allServices.filter((x) => x.business_vertical === vertical).map((x) => x.service_id)) : null), [service, vertical, allServices]);
  // Incident KPIs are computed from the incident list so they can follow the service / vertical filter
  const incidents = useRpc('it_ops_incidents', { p_filters: { days: 365, region: filters.region }, p_limit: 5000 });
  const rel = useRpc('it_rel_overview', { p_filters: filters });
  const licFilters = service ? { region: filters.region, software: svc?.software_id ?? '__none__' } : { region: filters.region, vertical };
  const lic = useRpc('it_lic_kpis_ext', { p_filters: licFilters });
  const cellIncidents = useRpc('it_ops_incidents', { p_filters: { ...filters, service: cellService }, p_date: cellDate }, Boolean(cell));

  const heat = useMemo(() => {
    if (!data) return null;
    const byKey = new Map(data.heatmap.map((c) => [`${c.service_id}|${c.date}`, c.availability]));
    const dates = [...new Set(data.heatmap.map((c) => c.date))].sort();
    return {
      rows: data.services.filter((s) => !scope || scope.has(s.service_id)).map((s) => ({ key: s.service_id, label: s.short_name })),
      cols: dates.map((d) => ({ key: d, label: shortDate(d) })),
      value: (r, c) => byKey.get(`${r}|${c}`) ?? null,
    };
  }, [data, scope]);

  if (error) return <LoadError error={error} what="the Overview" />;
  const w = data?.window;
  const inScope = (incidents.data ?? []).filter((i) => !scope || scope.has(i.service_id));
  const day = (i) => i.open_time.slice(0, 10);
  const cur = w ? inScope.filter((i) => day(i) >= w.d_from && day(i) <= w.d_to) : [];
  const prv = w ? inScope.filter((i) => day(i) >= w.p_from && day(i) <= w.p_to) : [];
  const mttrOf = (xs) => { const m = median(xs.filter((i) => i.status === 'Resolved' && i.mttr_minutes != null).map((i) => i.mttr_minutes)); return m == null ? null : m / 60; };
  const k = {
    p1: cur.filter((i) => i.priority === 1).length,
    p1_prev: prv.filter((i) => i.priority === 1).length,
    open: inScope.filter((i) => i.status === 'Active').length,
    open_p1p2: inScope.filter((i) => i.status === 'Active' && i.priority <= 2).length,
    mttr_h: mttrOf(cur), mttr_h_prev: mttrOf(prv),
    downtime_cost: (rel.data?.services ?? []).filter((x) => !scope || scope.has(x.service_id)).reduce((t, x) => t + Number(x.downtime_cost || 0), 0),
  };
  const lk = service && !svc?.software_id ? {} : lic.data ?? {};
  const noLicence = Boolean(service && svc && !svc.software_id);
  const p1p2ByDay = new Map();
  cur.filter((i) => i.priority <= 2).forEach((i) => p1p2ByDay.set(day(i), (p1p2ByDay.get(day(i)) ?? 0) + 1));
  const spark = (data?.daily ?? []).map((d) => p1p2ByDay.get(d.date) ?? 0);
  const busy = (q) => (q.loading && !q.data) || (loading && !data);
  const show = (q, v, fmt) => (busy(q) ? '…' : v === null || v === undefined ? '—' : fmt(v));
  const mttrDelta = k.mttr_h != null && k.mttr_h_prev ? k.mttr_h / k.mttr_h_prev - 1 : null;
  const p1Delta = w ? k.p1 - k.p1_prev : null;
  const scopeLabel = svc ? svc.short_name : vertical ? `${vertical} (${scope?.size ?? 0} service${scope?.size === 1 ? '' : 's'})` : null;
  const setVertical = (v) => patchUrl({ vertical: v, service: v && svc && svc.business_vertical !== v ? null : service, cell: null });
  const serviceOptions = allServices.filter((x) => !vertical || x.business_vertical === vertical);

  return (
    <div className="space-y-6 pb-10">
      <PageHeader title="IT Executive Overview" window={data?.window}
        note={scopeLabel ? `KPI cards and the heatmap show ${scopeLabel}; the scorecard and top risks stay portfolio-wide` : null}>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-xs font-semibold text-slate-600">
            Vertical
            <select value={vertical ?? ''} onChange={(e) => setVertical(e.target.value)} className={`${selectCls} min-w-40`}>
              <option value="">All verticals</option>
              {verticals.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <label className="flex flex-col text-xs font-semibold text-slate-600">
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
          <Link key={s.area} to={s.link} className="group bg-white rounded-xl shadow-sm border border-slate-200 p-4 hover:border-sky-300 hover:shadow focus:outline-none focus:ring-2 focus:ring-sky-500">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-slate-700">{s.area}</span>
              <StatusBadge status={s.status} />
            </div>
            <p className="mt-2 text-3xl font-semibold text-slate-900">{s.score}<span className="text-base font-normal text-slate-400">/100</span></p>
            <p className="mt-1 text-xs text-slate-500">{s.headline}</p>
            <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-sky-700 group-hover:underline">Open <ArrowRight size={12} aria-hidden="true" /></span>
          </Link>
        ))}
      </div>

      {/* KPIs: follow the Vertical / Service filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <KpiCard title="P1 Incidents" value={show(incidents, k.p1, formatNumber)} icon={<Siren size={20} />}
          delta={p1Delta !== null ? `${p1Delta > 0 ? '+' : ''}${p1Delta} vs prior` : null} deltaTone={p1Delta > 0 ? 'bad' : p1Delta < 0 ? 'good' : 'neutral'}
          sub={`${formatNumber(k.open)} open now (${formatNumber(k.open_p1p2)} P1/P2)`} spark={spark}
          tooltip="Priority-1 incidents opened in the window (Region, Vertical and Service filters apply). Open now = incidents not yet resolved at the as-of date. Sparkline: P1+P2 incidents per day." />
        <KpiCard title="Median Time to Resolve" value={show(incidents, k.mttr_h, (v) => `${v.toFixed(1)} h`)} icon={<Timer size={20} />}
          delta={mttrDelta !== null ? `${formatSignedPct(mttrDelta)} vs prior` : null} deltaTone={mttrDelta < 0 ? 'good' : mttrDelta > 0 ? 'bad' : 'neutral'}
          tooltip="Median of (resolution − open) for incidents opened and resolved in the window, all priorities." />
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
        <Panel title="Service availability by day" className="xl:col-span-2"
          tooltip="Each cell is one service on one day. Colour = availability. Select a cell to list that day's incidents for the service.">
          {heat ? (
            <Heatmap rows={heat.rows} cols={heat.cols} value={heat.value} colorFor={availabilityColor}
              titleFor={(r, c, v) => `${r.label} · ${c.label}: ${v === null ? 'no data' : `${(v * 100).toFixed(2)}% available`}`}
              onCell={(r, c) => setCell(`${r.key}|${c.key}`)}
              legend={AVAILABILITY_BUCKETS.map((b) => ({ label: b.label, color: b.color }))} />
          ) : <p className="text-sm text-slate-500">Loading…</p>}
        </Panel>

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
        title={cell ? `${heat?.rows.find((r) => r.key === cellService)?.label ?? cellService} · ${cellDate ? shortDate(cellDate) : ''}` : ''}
        subtitle={cell ? `Availability ${heat ? formatPct(heat.value(cellService, cellDate), 2) : '…'}` : ''}>
        <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <IncidentsTable rows={cellIncidents.data ?? []} loading={cellIncidents.loading}
            onOpen={(id) => patchUrl({ cell: null, incident: id })} empty="No incidents for this service on this day." />
        </section>
      </Drawer>
      {incident && <IncidentDrawer incidentId={incident} onClose={() => setIncident(null)} />}
    </div>
  );
}
