import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDown, X } from 'lucide-react';
import Panel from '../../components/Panel';
import Segmented, { ToolbarSelect } from '../../components/Segmented';
import { fetchAllRows } from '../../lib/fetchAllRows';
import { BLUE_ORDINAL, INK, SERIES, STATUS, axisTick, tooltipStyle } from '../../lib/chartTheme';
import { formatNumber, formatPct } from '../../lib/format';
import { prioSet, prioShort } from '../../lib/priority';

const SEVERITIES = ['Critical', 'High', 'Medium', 'Low'];
const LEGEND_ORDER = ['Became an incident', 'Noise'];

/** fact_alerts rows for the window (read-only RLS; ~300 rows per 30 days). */
function useAlerts(w) {
  const key = w ? `${w.d_from}|${w.d_to}` : null;
  const [state, setState] = useState({ key: null, rows: [] });
  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    const [from, to] = key.split('|');
    fetchAllRows('fact_alerts', 'alert_id, service_id, date_id, incident_id, alert_severity', {
      orderBy: 'alert_id', filter: (q) => q.gte('date_id', from).lte('date_id', to),
    }).then((rows) => { if (!cancelled) setState({ key, rows }); })
      .catch(() => { if (!cancelled) setState({ key, rows: [] }); });
    return () => { cancelled = true; };
  }, [key]);
  return { rows: state.rows, loading: state.key !== key };
}

function Chip({ label, onClear }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white py-0.5 pl-2.5 pr-1 text-xs text-slate-700">
      {label}
      <button type="button" onClick={onClear} aria-label={`Remove filter ${label}`} className="rounded-full p-0.5 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"><X size={12} /></button>
    </span>
  );
}

/** Simple funnel: one bar per stage (width ∝ count) with the conversion between stages written out. */
function FunnelBars({ stages }) {
  const max = Math.max(1, stages[0]?.value ?? 1);
  return (
    <ol className="space-y-1">
      {stages.map((s, i) => (
        <li key={s.label}>
          {i > 0 && (
            <p className="flex items-center gap-1 py-1 pl-1 text-xs text-slate-500">
              <ArrowDown size={12} aria-hidden="true" />{s.step}
            </p>
          )}
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium text-slate-800">{s.label}</span>
            <span className="tabular-nums font-semibold text-slate-900">{formatNumber(s.value)}</span>
          </div>
          <div className="mt-1 h-3 rounded-full bg-slate-100">
            <div className="h-3 rounded-full" style={{ width: `${Math.max(1.5, (s.value / max) * 100)}%`, background: BLUE_ORDINAL[Math.min(i, BLUE_ORDINAL.length - 1)] }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * Alert → incident funnel and alert noise, sharing one filter (service + alert severity).
 * Funnel: alerts raised → became an incident → distinct incidents → severe incidents (P1/P2, or the global Incident Priority).
 * Noise: share of alerts with no incident, by service or by alert severity; selecting a service bar filters both panels.
 */
export default function AlertPanels({ window: w, services = [], incidents = [], prio = 'all' }) {
  const { rows, loading } = useAlerts(w);
  const [svc, setSvc] = useState('');
  const [sev, setSev] = useState('all');
  const [by, setBy] = useState('service');
  const name = (id) => services.find((s) => s.service_id === id)?.short_name ?? id;
  const incPrio = useMemo(() => new Map(incidents.map((i) => [i.incident_id, i.priority])), [incidents]);

  const scoped = rows.filter((a) => (!svc || a.service_id === svc) && (sev === 'all' || a.alert_severity === sev));
  const linked = scoped.filter((a) => a.incident_id);
  const distinct = [...new Set(linked.map((a) => a.incident_id))];
  const severeSet = prio === 'all' ? [1, 2] : prioSet(prio);
  const severe = distinct.filter((id) => severeSet.includes(incPrio.get(id)));
  const severeLabel = prio === 'all' ? 'P1 / P2 incidents' : `${prioShort(prio)} incidents`;
  const pct = (a, b) => (b ? formatPct(a / b, 0) : '—');
  const stages = [
    { label: 'Alerts raised', value: scoped.length },
    { label: 'Became an incident', value: linked.length, step: `${pct(linked.length, scoped.length)} of alerts were real · ${formatNumber(scoped.length - linked.length)} were noise` },
    { label: 'Distinct incidents', value: distinct.length, step: distinct.length ? `${(linked.length / distinct.length).toFixed(1)} alerts per incident on average` : 'no incidents' },
    { label: severeLabel, value: severe.length, step: `${pct(severe.length, distinct.length)} of those incidents` },
  ];

  const noise = useMemo(() => {
    const base = rows.filter((a) => (by === 'service' ? sev === 'all' || a.alert_severity === sev : !svc || a.service_id === svc));
    const m = new Map();
    for (const a of base) {
      const k = by === 'service' ? a.service_id : a.alert_severity;
      const x = m.get(k) || { key: k, label: by === 'service' ? name(k) : k, real: 0, noise: 0 };
      if (a.incident_id) x.real += 1; else x.noise += 1;
      m.set(k, x);
    }
    const out = [...m.values()].map((x) => ({ ...x, n: x.real + x.noise, share: (x.noise / (x.real + x.noise)) || 0 }));
    out.forEach((x) => { x.Noise = x.share; x['Became an incident'] = 1 - x.share; });
    return by === 'service' ? out.sort((a, b) => b.share - a.share) : out.sort((a, b) => SEVERITIES.indexOf(a.key) - SEVERITIES.indexOf(b.key));
  }, [rows, by, sev, svc, services]); // eslint-disable-line react-hooks/exhaustive-deps
  const noiseTotal = noise.reduce((t, x) => t + x.noise, 0);
  const alertTotal = noise.reduce((t, x) => t + x.n, 0);
  const worst = by === 'service' ? noise.slice(0, 2) : [];

  const filters = (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <ToolbarSelect label="Service" value={svc} onChange={setSvc}>
        <option value="">All services</option>
        {services.map((s) => <option key={s.service_id} value={s.service_id}>{s.short_name}</option>)}
      </ToolbarSelect>
      <ToolbarSelect label="Alert severity" value={sev} onChange={setSev}>
        <option value="all">All</option>
        {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
      </ToolbarSelect>
      {(svc || sev !== 'all') && (
        <button type="button" onClick={() => { setSvc(''); setSev('all'); }} className="text-xs font-medium text-blue-700 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded">Clear</button>
      )}
    </div>
  );

  return (
    <>
      <Panel title="Alert → incident funnel"
        tooltip="How many alerts were raised, how many belonged to a real incident, how many distinct incidents that was, and how many were severe. Filter by service and alert severity (shared with Alert noise); the last stage follows the global Incident Priority filter (P1 / P2 when it is All).">
        {filters}
        {loading && !rows.length ? <p className="text-sm text-slate-500">Loading…</p> : !scoped.length ? <p className="py-6 text-center text-sm text-slate-500">No alerts match these filters.</p> : <FunnelBars stages={stages} />}
      </Panel>

      <Panel title="Alert noise"
        tooltip="Share of alerts that never became an incident. Noisy services train people to ignore alerts. Group by service or by alert severity; select a service bar to filter the funnel too.">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Segmented label="Group by" value={by} onChange={setBy} options={[{ value: 'service', label: 'Service' }, { value: 'severity', label: 'Alert severity' }]} />
          {by === 'service' && sev !== 'all' && <Chip label={`Severity: ${sev}`} onClear={() => setSev('all')} />}
          {by === 'severity' && svc && <Chip label={`Service: ${name(svc)}`} onClear={() => setSvc('')} />}
        </div>
        <p className="mb-2 text-xs text-slate-600">
          <b className="text-slate-900">{formatNumber(noiseTotal)}</b> of {formatNumber(alertTotal)} alerts ({pct(noiseTotal, alertTotal)}) were noise
          {worst.length ? <> · noisiest: {worst.map((x) => `${x.label} ${formatPct(x.share, 0)}`).join(', ')}</> : null}
        </p>
        {loading && !rows.length ? <p className="text-sm text-slate-500">Loading…</p> : (
          <div style={{ height: Math.max(170, noise.length * 30 + 60) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={noise.map((x) => ({ ...x, value: `${formatPct(x.share, 0)} · ${x.noise}/${x.n}` }))} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid stroke={INK.grid} horizontal={false} />
                <XAxis type="number" domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} tick={axisTick} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="label" width={100} interval={0} tickLine={false} axisLine={{ stroke: INK.axis }}
                  tick={({ x, y, payload }) => {
                    const on = by === 'service' && noise.find((r) => r.label === payload.value)?.key === svc;
                    return <text x={x} y={y} dy={4} textAnchor="end" fontSize={12} fill={on ? INK.primary : INK.secondary} fontWeight={on ? 700 : 400}>{payload.value}</text>;
                  }} />
                <YAxis yAxisId="v" orientation="right" type="category" dataKey="value" width={76} interval={0} tick={{ fontSize: 11, fill: INK.secondary }} tickLine={false} axisLine={false} />
                <Tooltip {...tooltipStyle} cursor={{ fill: '#f1f5f9' }}
                  formatter={(v, n, p) => [`${formatPct(v, 0)} (${n === 'Noise' ? p.payload.noise : p.payload.real} of ${p.payload.n} alerts)`, n]} />
                <Legend wrapperStyle={{ fontSize: 12, color: INK.secondary }} itemSorter={(i) => LEGEND_ORDER.indexOf(i.value)} />
                <Bar dataKey="Became an incident" stackId="n" fill={SERIES[0]} stroke="#fff" strokeWidth={1} maxBarSize={16} isAnimationActive={false}
                  cursor={by === 'service' ? 'pointer' : undefined} onClick={(e) => { if (by === 'service') { const k = (e.payload ?? e).key; setSvc(k === svc ? '' : k); } }} />
                <Bar dataKey="Noise" stackId="n" fill={STATUS.warning} radius={[0, 4, 4, 0]} maxBarSize={16} isAnimationActive={false}
                  cursor={by === 'service' ? 'pointer' : undefined} onClick={(e) => { if (by === 'service') { const k = (e.payload ?? e).key; setSvc(k === svc ? '' : k); } }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>
    </>
  );
}
