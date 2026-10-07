import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, LabelList, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlarmClock, BellOff, Gauge, Siren, Timer, Wrench } from 'lucide-react';
import KpiCard from '../../components/KpiCard';
import Panel, { PageHeader } from '../../components/Panel';
import Funnel from '../../components/Funnel';
import LoadError from '../../components/LoadError';
import IncidentDrawer from '../../components/IncidentDrawer';
import IncidentsTable from '../../components/IncidentsTable';
import { useRpc } from '../../hooks/useRpc';
import { useItFilters } from '../../hooks/useItFilters';
import { useUrlParam } from '../../hooks/useUrlParam';
import { rpc } from '../../lib/rpc';
import { INK, SERIES, axisTick, gridProps, tooltipStyle } from '../../lib/chartTheme';
import { formatINR, formatNumber, formatPct, formatSignedPct } from '../../lib/format';

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

function DailyChart({ title, tooltip, services, filters, initial, metric }) {
  const [picked, setPicked] = useState(initial);
  const { rows, loading } = useDailySeries(filters, picked);
  const name = (id) => services.find((s) => s.service_id === id)?.short_name ?? id;
  const series = picked.length ? picked.map((p) => ({ key: p.id, label: name(p.id), color: SERIES[p.slot] })) : [{ key: 'all', label: 'All services', color: SERIES[0] }];
  const isAvail = metric === 'avail';
  const fmt = isAvail ? (v) => formatPct(v, 2) : (v) => `${formatNumber(v)} ms`;
  return (
    <Panel title={title} tooltip={tooltip}>
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
        <div role="radiogroup" aria-label="Group by" className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
          {GROUPS.map((g) => (
            <button key={g.id} type="button" role="radio" aria-checked={group === g.id} onClick={() => setGroup(g.id)}
              className={`rounded-md px-3 py-1 font-medium focus:outline-none focus:ring-2 focus:ring-sky-500 ${group === g.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>{g.label}</button>
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
  const incidents = useRpc('it_ops_incidents', { p_filters: filters, p_limit: 1000 });
  const allDaily = useRpc('it_rel_daily', { p_filters: filters });

  const services = data?.services ?? [];
  const initialPick = useMemo(() => (initialService ? [{ id: initialService, slot: 0 }] : []), [initialService]);

  if (error) return <LoadError error={error} what="App Reliability" />;
  const k = data?.kpis ?? {};
  const show = (v, fmt) => (loading && !data ? '…' : v === null || v === undefined ? '—' : fmt(v));
  const rel = (cur, prev) => (cur != null && prev ? cur / prev - 1 : null);
  const mttaDelta = rel(k.mtta_min, k.mtta_min_prev);
  const mttrDelta = rel(k.mttr_h, k.mttr_h_prev);
  const noiseDelta = k.noise_ratio != null && k.noise_ratio_prev != null ? k.noise_ratio - k.noise_ratio_prev : null;
  const availability = services.length ? services.reduce((s, x) => s + Number(x.availability), 0) / services.length : null;
  const dailyAvail = (allDaily.data ?? []).map((d) => d.availability);

  return (
    <div className="space-y-6 pb-10">
      <PageHeader title="App Reliability" window={data?.window} note="service metrics are global; incidents follow the region filter" />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <KpiCard title="Availability" icon={<Gauge size={20} />} value={show(availability, (v) => formatPct(v, 2))}
          sub={`average across ${services.length || '…'} services`} spark={dailyAvail}
          tooltip="Uptime minutes ÷ minutes in the window, averaged across services. Sparkline: daily availability across all services." />
        <KpiCard title="Median Time to Acknowledge" icon={<AlarmClock size={20} />} value={show(k.mtta_min, (v) => `${v} min`)}
          delta={mttaDelta !== null ? `${formatSignedPct(mttaDelta)} vs prior` : null} deltaTone={mttaDelta > 0 ? 'bad' : 'good'}
          tooltip="Median of (acknowledged − opened) for incidents opened in the window." />
        <KpiCard title="Median Time to Resolve" icon={<Timer size={20} />} value={show(k.mttr_h, (v) => `${v.toFixed(1)} h`)}
          delta={mttrDelta !== null ? `${formatSignedPct(mttrDelta)} vs prior` : null} deltaTone={mttrDelta > 0 ? 'bad' : 'good'}
          tooltip="Median of (resolved − opened) for incidents opened and resolved in the window." />
        <KpiCard title="Alert Noise" icon={<BellOff size={20} />} value={show(k.noise_ratio, (v) => formatPct(v, 0))}
          delta={noiseDelta !== null ? `${formatSignedPct(noiseDelta, 1, ' pts')} vs prior` : null} deltaTone={noiseDelta > 0 ? 'bad' : 'good'}
          sub="alerts that never became an incident"
          tooltip="Share of alerts in the window with no incident attached. High noise trains people to ignore alerts." />
        <KpiCard title="Cost of Downtime" icon={<Wrench size={20} />} value={show(k.downtime_cost, formatINR)}
          sub="downtime minutes × cost per minute"
          tooltip="Σ downtime minutes × each service's cost of downtime per minute (it_dim_service)." />
        <KpiCard title="Incidents" icon={<Siren size={20} />} value={show(k.incidents, formatNumber)}
          sub={filters.region ? 'in the selected region' : 'all regions'}
          tooltip="Incidents opened in the window (region filter applies)." />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <DailyChart key={`a-${initialService ?? ''}`} title="Daily availability" metric="avail" services={services} filters={filters} initial={initialPick}
          tooltip="Uptime ÷ minutes per day. Pick up to three services to compare, or All services for the average." />
        <DailyChart key={`p-${initialService ?? ''}`} title="Daily p95 latency" metric="p95" services={services} filters={filters} initial={initialPick}
          tooltip="Daily 95th-percentile response time. Pick up to three services to compare, or All services for the average." />
        <TimeToResolve incidents={incidents.data ?? []} services={services} loading={incidents.loading} />
        <Panel title="Alert → incident funnel" tooltip="How many alerts were raised, how many belonged to a real incident, and how many incidents were severe.">
          {data && (
            <Funnel stages={[
              { label: 'Alerts raised', value: data.funnel.alerts },
              { label: 'Alerts linked to an incident', value: data.funnel.linked_alerts, note: `${formatNumber(data.funnel.alerts - data.funnel.linked_alerts)} were noise` },
              { label: 'Incidents', value: data.funnel.incidents },
              { label: 'P1 / P2 incidents', value: data.funnel.p1p2 },
            ]} />
          )}
        </Panel>
      </div>

      <Panel title="Incidents" flush tooltip="Incidents opened in the window. Select one for its lifecycle, alerts and causing deployment.">
        <IncidentsTable rows={incidents.data ?? []} loading={incidents.loading} onOpen={setIncident} />
      </Panel>

      {incident && <IncidentDrawer incidentId={incident} onClose={() => setIncident(null)} />}
    </div>
  );
}
