import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, LabelList, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlarmClock, BellOff, Gauge, Siren, Timer, Wrench } from 'lucide-react';
import KpiCard from '../../components/KpiCard';
import Panel, { PageHeader } from '../../components/Panel';
import Segmented from '../../components/Segmented';
import AlertPanels from './AlertPanels';
import DowntimeCost from './DowntimeCost';
import LoadError from '../../components/LoadError';
import IncidentDrawer from '../../components/IncidentDrawer';
import IncidentExplorer from './IncidentExplorer';
import SubTabs from '../../components/SubTabs';
import { useRpc } from '../../hooks/useRpc';
import { useItFilters } from '../../hooks/useItFilters';
import { usePatchUrlParams, useUrlParam } from '../../hooks/useUrlParam';
import { useGlobalStore } from '../../store/useGlobalStore';
import { matchesPrio, prioShort } from '../../lib/priority';
import { rpc } from '../../lib/rpc';
import { INK, SERIES, axisTick, gridProps, tooltipStyle } from '../../lib/chartTheme';
import { formatINR, formatNumber, formatPct } from '../../lib/format';
import { toggleCls, toggleGroupCls } from '../../lib/ui';

const shortDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
const MAX_COMPARE = 3;
const TARGET_H = { 1: 4, 2: 8, 3: 24, 4: 72 }; // it_config mttr_target_hours_p1..p4
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const selectCls = 'rounded-md border border-slate-300 bg-white py-1 px-2 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500';

/**
 * Service picker for a chart: "All services" or up to three services. Each picked service keeps its colour slot
 * while it stays picked (colour follows the service, not its position).
 */
function ServicePicker({ services, picked, onChange }) {
  const toggle = (id) => {
    if (picked.some((p) => p.id === id)) return onChange(picked.filter((p) => p.id !== id));
    if (picked.length >= MAX_COMPARE) return undefined;
    const used = new Set(picked.map((p) => p.slot));
    const slot = [0, 1, 2].find((s) => !used.has(s));
    return onChange([...picked, { id, slot }]);
  };
  const chip = 'rounded-full border px-2.5 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-sky-500';
  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by service">
      <button type="button" aria-pressed={!picked.length} onClick={() => onChange([])}
        className={`${chip} ${!picked.length ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'}`}>All services</button>
      {services.map((s) => {
        const p = picked.find((x) => x.id === s.service_id);
        const full = !p && picked.length >= MAX_COMPARE;
        return (
          <button key={s.service_id} type="button" aria-pressed={Boolean(p)} disabled={full} onClick={() => toggle(s.service_id)}
            title={full ? `Compare up to ${MAX_COMPARE} services` : s.service_name}
            className={`${chip} inline-flex items-center gap-1.5 ${p ? 'border-slate-400 bg-white text-slate-900' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-400'} disabled:opacity-40`}>
            {p && <span className="h-2.5 w-2.5 rounded-full" style={{ background: SERIES[p.slot] }} aria-hidden="true" />}
            {s.short_name}
          </button>
        );
      })}
      <span className="text-[11px] text-slate-400">compare up to {MAX_COMPARE}</span>
    </div>
  );
}

/** Daily series for "all services" or for each picked service (it_rel_daily per service). */
function useDailySeries(filters, picked) {
  const key = JSON.stringify({ filters, ids: picked.map((p) => p.id) });
  const [state, setState] = useState({ key: null, rows: [] });
  useEffect(() => {
    let cancelled = false;
    const { filters: f, ids } = JSON.parse(key);
    const targets = ids.length ? ids : [null];
    Promise.all(targets.map((id) => rpc('it_rel_daily', { p_filters: { ...f, service: id } })))
      .then((results) => {
        if (cancelled) return;
        const byDate = new Map();
        results.forEach((rows, i) => {
          const sk = targets[i] ?? 'all';
          for (const r of rows ?? []) {
            const row = byDate.get(r.date) || { date: r.date, label: shortDate(r.date) };
            row[`avail_${sk}`] = r.availability;
            row[`p95_${sk}`] = r.p95_ms;
            byDate.set(r.date, row);
          }
        });
        setState({ key, rows: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)) });
      })
      .catch(() => !cancelled && setState({ key, rows: [] }));
    return () => { cancelled = true; };
  }, [key]);
  return { rows: state.rows, loading: state.key !== key };
}

const METRICS = [{ value: 'avail', label: 'Availability' }, { value: 'p95', label: 'p95 latency' }];

/** Daily availability or p95 latency (toggle), for all services or up to three compared services. */
function DailyChart({ services, filters, initial }) {
  const [picked, setPicked] = useState(initial);
  const [metric, setMetric] = useState('avail');
  const { rows, loading } = useDailySeries(filters, picked);
  const name = (id) => services.find((s) => s.service_id === id)?.short_name ?? id;
  const series = picked.length ? picked.map((p) => ({ key: p.id, label: name(p.id), color: SERIES[p.slot] })) : [{ key: 'all', label: 'All services', color: SERIES[0] }];
  const isAvail = metric === 'avail';
  const fmt = isAvail ? (v) => formatPct(v, 2) : (v) => `${formatNumber(v)} ms`;
  return (
    <Panel title="Daily service health"
      tooltip="Availability (uptime ÷ minutes per day) or p95 latency (95th-percentile response time per day). Switch the metric with the toggle; pick up to three services to compare, or All services for the average. Service metrics are global (no region).">
      <div className="mb-3"><Segmented label="Metric" value={metric} onChange={setMetric} options={METRICS} /></div>
      <ServicePicker services={services} picked={picked} onChange={setPicked} />
      <div className="h-64">
        {loading && !rows.length ? <p className="text-sm text-slate-500">Loading…</p> : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: INK.axis }} interval="preserveStartEnd" minTickGap={24} />
              <YAxis domain={isAvail ? [(min) => Math.max(0, Math.floor(min * 200) / 200), 1] : [0, 'auto']} allowDataOverflow={isAvail}
                tickFormatter={isAvail ? (v) => `${(v * 100).toFixed(1)}%` : (v) => `${v} ms`} tick={axisTick} tickLine={false} axisLine={false} width={60} />
              <Tooltip formatter={(v, n) => [fmt(v), n]} {...tooltipStyle} />
              {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12, color: INK.secondary }} />}
              {series.map((s) => (
                <Line key={s.key} dataKey={`${metric}_${s.key}`} name={s.label} stroke={s.color} strokeWidth={2} dot={false} isAnimationActive={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </Panel>
  );
}

const GROUPS = [
  { id: 'priority', label: 'Priority' },
  { id: 'service', label: 'Service' },
  { id: 'cause', label: 'Root cause' },
];

/** Median time to resolve, grouped by priority / service / root cause, with service and priority filters. */
function TimeToResolve({ incidents, services, loading }) {
  const [group, setGroup] = useState('priority');
  const [svc, setSvc] = useState('');
  const [prio, setPrio] = useState('');
  const name = (id) => services.find((s) => s.service_id === id)?.short_name ?? id;

  const rows = useMemo(() => {
    const resolved = incidents.filter((i) => i.status === 'Resolved' && i.mttr_minutes != null
      && (!svc || i.service_id === svc) && (!prio || String(i.priority) === prio));
    const keyOf = (i) => (group === 'priority' ? `P${i.priority}` : group === 'service' ? name(i.service_id) : i.root_cause_type);
    const m = new Map();
    for (const i of resolved) {
      const k = keyOf(i);
      const g = m.get(k) || { group: k, hours: [], within: 0 };
      const h = i.mttr_minutes / 60;
      g.hours.push(h);
      if (h <= TARGET_H[i.priority]) g.within += 1;
      m.set(k, g);
    }
    const out = [...m.values()].map((g) => ({
      group: g.group,
      label: group === 'priority' ? `${g.group} · target ${TARGET_H[g.group.slice(1)]} h` : g.group,
      median: Number(median(g.hours).toFixed(1)),
      n: g.hours.length,
      within: g.within / g.hours.length,
    }));
    return group === 'priority' ? out.sort((a, b) => a.group.localeCompare(b.group)) : out.sort((a, b) => b.median - a.median);
  }, [incidents, group, svc, prio, services]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Panel title="Time to resolve" tooltip="Median hours from opened to resolved for incidents resolved in the window. Hover a bar for the count and the share resolved within its priority target (P1 4 h, P2 8 h, P3 24 h, P4 72 h).">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <div role="radiogroup" aria-label="Group by" className={toggleGroupCls}>
          {GROUPS.map((g) => (
            <button key={g.id} type="button" role="radio" aria-checked={group === g.id} onClick={() => setGroup(g.id)}
              className={toggleCls(group === g.id)}>{g.label}</button>
          ))}
        </div>
        <label><span className="sr-only">Service</span>
          <select value={svc} onChange={(e) => setSvc(e.target.value)} className={selectCls}>
            <option value="">All services</option>
            {services.map((s) => <option key={s.service_id} value={s.service_id}>{s.short_name}</option>)}
          </select>
        </label>
        <label><span className="sr-only">Priority</span>
          <select value={prio} onChange={(e) => setPrio(e.target.value)} className={selectCls}>
            <option value="">All priorities</option>
            {[1, 2, 3, 4].map((p) => <option key={p} value={p}>P{p}</option>)}
          </select>
        </label>
        {(svc || prio) && <button type="button" onClick={() => { setSvc(''); setPrio(''); }} className="font-medium text-sky-700 hover:underline focus:outline-none focus:ring-2 focus:ring-sky-500 rounded">Clear</button>}
      </div>
      {loading && !incidents.length ? <p className="text-sm text-slate-500">Loading…</p> : !rows.length ? <p className="text-sm text-slate-500">No resolved incidents match these filters.</p> : (
        <div style={{ height: Math.max(180, rows.length * 34 + 40) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 72, left: 8, bottom: 0 }}>
              <CartesianGrid stroke={INK.grid} horizontal={false} />
              <XAxis type="number" tickFormatter={(v) => `${v} h`} tick={axisTick} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="label" width={group === 'priority' ? 120 : 100} tick={{ fontSize: 12, fill: INK.secondary }} tickLine={false} axisLine={{ stroke: INK.axis }} />
              <Tooltip {...tooltipStyle} cursor={{ fill: '#f1f5f9' }}
                formatter={(v, n, p) => [`${v} h median · ${p.payload.n} incident${p.payload.n === 1 ? '' : 's'} · ${formatPct(p.payload.within, 0)} within target`, 'Time to resolve']} />
              <Bar dataKey="median" fill={SERIES[0]} radius={[0, 4, 4, 0]} maxBarSize={18}>
                <LabelList dataKey="median" position="right" fill={INK.secondary} fontSize={11} formatter={(v) => `${v} h`} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  );
}

export default function ReliabilityModule() {
  const [initialService] = useUrlParam('service');
  const [incident, setIncident] = useUrlParam('incident');
  const filters = useItFilters();
  const { data, loading, error } = useRpc('it_rel_overview', { p_filters: filters });
  const prio = useGlobalStore((st) => st.incidentPriority);
  const setGlobalFilter = useGlobalStore((st) => st.setGlobalFilter);
  const setPrio = (v) => setGlobalFilter('incidentPriority', v);
  const [prioParam] = useUrlParam('prio');      // legacy links: ?prio=1 sets the global filter
  const [focus] = useUrlParam('focus');         // ?focus=incidents (Overview "Details")
  const [tabParam] = useUrlParam('tab');
  const tab = tabParam === 'health' ? 'health' : 'incidents';
  const goIncidents = () => { patchUrl({ tab: null }); setTimeout(() => document.getElementById('incidents')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); };
  const patchUrl = usePatchUrlParams();
  // Two windows' worth, so the explorer can compare with the prior window; split by open date below
  const incidents = useRpc('it_ops_incidents', { p_filters: { ...filters, days: filters.days * 2 }, p_limit: 3000 });

  const services = data?.services ?? [];
  const w = data?.window;
  const inWindow = (i, from, to) => { const d = i.open_time.slice(0, 10); return d >= from && d <= to; };
  const curInc = useMemo(() => (w ? (incidents.data ?? []).filter((i) => inWindow(i, w.d_from, w.d_to)) : []), [incidents.data, w]);
  const prvInc = useMemo(() => (w ? (incidents.data ?? []).filter((i) => inWindow(i, w.p_from, w.p_to)) : []), [incidents.data, w]);
  // Arriving from the Overview incident card: apply a legacy ?prio, then bring the incident explorer into view once data is in
  useEffect(() => {
    if (!(prioParam || focus) || !curInc.length) return;
    if (['1', '2', '3', '4', '12'].includes(prioParam)) setGlobalFilter('incidentPriority', prioParam);
    patchUrl({ prio: null, focus: null, tab: null });
    setTimeout(() => document.getElementById('incidents')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }, [prioParam, focus, curInc.length, setGlobalFilter, patchUrl]);
  // Incident KPIs follow the global Incident Priority filter, so they are computed from the incident rows
  const selCur = curInc.filter(matchesPrio(prio));
  const mttrOf = (xs) => { const m = median(xs.filter((i) => i.status === 'Resolved' && i.mttr_minutes != null).map((i) => i.mttr_minutes)); return m == null ? null : m / 60; };
  const ik = {
    mtta: median(selCur.filter((i) => i.mtta_minutes != null).map((i) => Number(i.mtta_minutes))),
    mttr: mttrOf(selCur), n: selCur.length,
  };
  const pTag = prio !== 'all' ? ` · ${prioShort(prio)}` : '';
  const initialPick = useMemo(() => (initialService ? [{ id: initialService, slot: 0 }] : []), [initialService]);

  if (error) return <LoadError error={error} what="App Reliability" />;
  const k = data?.kpis ?? {};
  const show = (v, fmt) => (loading && !data ? '…' : v === null || v === undefined ? '—' : fmt(v));
  const showInc = (v, fmt) => (incidents.loading && !incidents.data ? '…' : v === null || v === undefined ? '—' : fmt(v));
  const availability = services.length ? services.reduce((s, x) => s + Number(x.availability), 0) / services.length : null;

  return (
    <div className="space-y-6 pb-10">
      <PageHeader title="App Reliability" window={data?.window}
        note={`service metrics are global; incidents follow the region filter${prio !== 'all' ? ` · Incident Priority ${prioShort(prio)} applies to time to acknowledge, time to resolve, incidents and the incident explorer` : ''}`} />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <KpiCard title="Availability" icon={<Gauge size={20} />} value={show(availability, (v) => formatPct(v, 2))}
          tooltip="Uptime minutes ÷ minutes in the window, averaged across services." />
        <KpiCard title={`Median Time to Acknowledge${pTag}`} icon={<AlarmClock size={20} />} value={showInc(ik.mtta, (v) => `${v} min`)}
          tooltip="Median of (acknowledged − opened) for incidents opened in the window." />
        <KpiCard title={`Median Time to Resolve${pTag}`} icon={<Timer size={20} />} value={showInc(ik.mttr, (v) => `${v.toFixed(1)} h`)}
          tooltip="Median of (resolved − opened) for incidents opened and resolved in the window." />
        <KpiCard title="Alert Noise" icon={<BellOff size={20} />} value={show(k.noise_ratio, (v) => formatPct(v, 0))}
          tooltip="Share of alerts in the window with no incident attached. High noise trains people to ignore alerts." />
        <KpiCard title="Cost of Downtime" icon={<Wrench size={20} />} value={show(k.downtime_cost, formatINR)}
          tooltip="Σ downtime minutes × each service's cost of downtime per minute (it_dim_service)." />
        <KpiCard title={`Incidents${pTag}`} icon={<Siren size={20} />} value={showInc(ik.n, formatNumber)}
          onClick={goIncidents}
          tooltip="Incidents opened in the window (region filter applies). Click to jump to incidents by priority." />
      </div>

      <SubTabs label="App Reliability sections" value={tab} onChange={(v) => patchUrl({ tab: v === 'incidents' ? null : v })} tabs={[
        { value: 'incidents', label: 'Incidents', hint: 'Incidents by priority, day and service, the incident list with drill-down, and how long fixes take.' },
        { value: 'health', label: 'Service health & alerts', hint: 'Daily availability and latency per service, how many alerts were real, and what downtime cost.' },
      ]} />

      {tab === 'incidents' ? (
        <>
          <IncidentExplorer cur={curInc} prv={prvInc} window={w} loading={incidents.loading && !incidents.data}
            prio={prio} setPrio={setPrio} onIncident={setIncident} />
          <TimeToResolve incidents={curInc} services={services} loading={incidents.loading} />
        </>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="xl:col-span-2"><DailyChart key={initialService ?? ''} services={services} filters={filters} initial={initialPick} /></div>
          <AlertPanels window={w} services={services} incidents={curInc} prio={prio} />
          <DowntimeCost className="xl:col-span-2" services={services} filters={filters} />
        </div>
      )}

      {incident && <IncidentDrawer incidentId={incident} onClose={() => setIncident(null)} />}
    </div>
  );
}
