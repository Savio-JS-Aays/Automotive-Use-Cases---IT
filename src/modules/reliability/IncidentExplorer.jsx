import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { X } from 'lucide-react';
import Panel from '../../components/Panel';
import Segmented from '../../components/Segmented';
import IncidentsTable from '../../components/IncidentsTable';
import { INK, PRIORITY_COLOR, axisTick, gridProps, tooltipStyle } from '../../lib/chartTheme';

const shortDate = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });
const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const day = (i) => i.open_time.slice(0, 10);
const median = (xs) => { if (!xs.length) return null; const a = [...xs].sort((x, y) => x - y); const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };

const PRIO_COLOR = PRIORITY_COLOR;
const TARGET_H = { 1: 4, 2: 8, 3: 24, 4: 72 }; // it_config mttr_target_hours_p1..p4
const PRIO_OPTIONS = [
  { value: 'all', label: 'All' }, { value: '1', label: 'P1' }, { value: '2', label: 'P2' },
  { value: '3', label: 'P3' }, { value: '4', label: 'P4' }, { value: '12', label: 'P1 + P2' },
];
const prioSet = (v) => (v === 'all' ? [1, 2, 3, 4] : v === '12' ? [1, 2] : [Number(v)]);

function Stat({ label, value, note }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-xl font-semibold text-slate-900 tabular-nums">{value}</p>
      {note && <p className="text-xs text-slate-500">{note}</p>}
    </div>
  );
}

function Chip({ label, onClear }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white py-0.5 pl-2.5 pr-1 text-xs text-slate-700">
      {label}
      <button type="button" onClick={onClear} aria-label={`Remove filter ${label}`} className="rounded-full p-0.5 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"><X size={12} /></button>
    </span>
  );
}

/**
 * Incidents by priority (the drill-down the Overview P1 card links to): summary stats, per-day bars and by-service bars
 * stacked by priority, and the incident table filtered by the bar selected. cur / prv are it_ops_incidents rows split
 * into the current and prior window; prio / setPrio are the global Incident Priority filter.
 */
export default function IncidentExplorer({ cur = [], prv = [], window: w, loading, prio, setPrio, onIncident }) {
  const [pickDay, setPickDay] = useState(null);
  const [pickSvc, setPickSvc] = useState(null);
  const ps = prioSet(prio);
  const keys = ps.map((p) => `P${p}`);

  const model = useMemo(() => {
    if (!w) return null;
    const sel = cur.filter((i) => ps.includes(i.priority));
    const days = [];
    for (let d = w.d_from; d <= w.d_to; d = addDays(d, 1)) days.push(d);
    const daily = days.map((d) => {
      const xs = sel.filter((i) => day(i) === d);
      const r = { date: d, label: shortDate(d), names: [...new Set(xs.map((i) => i.short_name))] };
      for (const p of ps) r[`P${p}`] = xs.filter((i) => i.priority === p).length;
      return r;
    });
    const svc = new Map();
    for (const i of sel) {
      const x = svc.get(i.service_id) || { key: i.service_id, label: i.short_name, total: 0, ...Object.fromEntries(ps.map((p) => [`P${p}`, 0])) };
      x[`P${i.priority}`] += 1; x.total += 1;
      svc.set(i.service_id, x);
    }
    const resolved = sel.filter((i) => i.status === 'Resolved' && i.mttr_minutes != null);
    const causes = new Map();
    sel.forEach((i) => causes.set(i.root_cause_type, (causes.get(i.root_cause_type) ?? 0) + 1));
    return {
      daily,
      bySvc: [...svc.values()].sort((a, b) => b.total - a.total || a.label.localeCompare(b.label)),
      n: sel.length, nPrev: prv.filter((i) => ps.includes(i.priority)).length,
      mttr: median(resolved.map((i) => i.mttr_minutes / 60)),
      within: resolved.length ? resolved.filter((i) => i.mttr_minutes / 60 <= TARGET_H[i.priority]).length / resolved.length : null,
      open: sel.filter((i) => i.status === 'Active'),
      topCause: [...causes.entries()].sort((a, b) => b[1] - a[1])[0],
    };
  }, [cur, prv, w, prio]); // eslint-disable-line react-hooks/exhaustive-deps

  const label = PRIO_OPTIONS.find((o) => o.value === prio)?.label ?? 'All';
  const rows = cur.filter((i) => ps.includes(i.priority) && (!pickDay || day(i) === pickDay) && (!pickSvc || i.service_id === pickSvc));
  const svcName = model?.bySvc.find((s) => s.key === pickSvc)?.label;
  const diff = model ? model.n - model.nPrev : 0;
  const changePrio = (v) => { setPrio(v); setPickDay(null); setPickSvc(null); };

  return (
    <div id="incidents" className="scroll-mt-4 space-y-5">
      <Panel title="Incidents by priority"
        tooltip="Incidents opened in the window by priority (region filter applies). Pick a priority; select a day or a service bar to filter the incident list below. P1 = critical, P2 = high, P3 = medium, P4 = low.">
        {!model ? <p className="text-sm text-slate-500">Loading…</p> : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Segmented label="Priority" value={prio} onChange={changePrio} options={PRIO_OPTIONS} />
              {pickDay && <Chip label={`Day: ${shortDate(pickDay)}`} onClear={() => setPickDay(null)} />}
              {pickSvc && <Chip label={`Service: ${svcName}`} onClear={() => setPickSvc(null)} />}
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Stat label={`${label} incidents this window`} value={loading ? '…' : model.n} note={`${diff > 0 ? '+' : ''}${diff} vs prior window (${model.nPrev})`} />
              <Stat label="Median time to resolve" value={model.mttr == null ? '—' : `${model.mttr.toFixed(1)} h`}
                note={ps.length === 1 ? `target ${TARGET_H[ps[0]]} h` : 'targets P1 4 h · P2 8 h · P3 24 h · P4 72 h'} />
              <Stat label="Resolved within target" value={model.within == null ? '—' : `${Math.round(model.within * 100)}%`} note="of resolved incidents" />
              <Stat label="Open now" value={model.open.length} note={model.topCause ? `top cause: ${model.topCause[0]} (${model.topCause[1]})` : null} />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
              <section className="xl:col-span-2 rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="mb-1 text-sm font-semibold text-slate-800">Per day</h3>
                <p className="mb-2 text-xs text-slate-500">Incidents opened each day. Hover for the services; select a bar to list that day's incidents.</p>
                <div className="h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={model.daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid {...gridProps} />
                      <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: INK.axis }} interval="preserveStartEnd" minTickGap={16} />
                      <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} width={28} />
                      <Tooltip {...tooltipStyle} cursor={{ fill: '#f1f5f9' }}
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const r = payload[0].payload;
                          return (
                            <div className="rounded-lg border border-black/10 bg-white px-3 py-2 text-xs shadow-sm">
                              <p className="font-semibold text-slate-700">{shortDate(r.date)}</p>
                              <p>{keys.map((k) => `${k}: ${r[k]}`).join(' · ')}</p>
                              {r.names.length > 0 && <p className="text-slate-600">{r.names.join(', ')}</p>}
                            </div>
                          );
                        }} />
                      {keys.length > 1 && <Legend wrapperStyle={{ fontSize: 12, color: INK.secondary }} itemSorter={(i) => keys.indexOf(i.value)} />}
                      {keys.map((k, idx) => (
                        <Bar key={k} dataKey={k} name={k} stackId="d" fill={PRIO_COLOR[k.slice(1)]} stroke="#fff" strokeWidth={1} maxBarSize={22}
                          radius={idx === keys.length - 1 ? [3, 3, 0, 0] : 0} isAnimationActive={false} cursor="pointer"
                          onClick={(e) => { const d = (e.payload ?? e).date; setPickDay(d === pickDay ? null : d); }} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>
              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="mb-1 text-sm font-semibold text-slate-800">By service</h3>
                <p className="mb-2 text-xs text-slate-500">Select a service to list its incidents.</p>
                {!model.bySvc.length ? <p className="py-10 text-center text-sm text-slate-500">None in this window.</p> : (
                  <div style={{ height: Math.max(170, model.bySvc.length * 28 + 50) }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={model.bySvc} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 0 }}>
                        <CartesianGrid stroke={INK.grid} horizontal={false} />
                        <XAxis type="number" allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} />
                        <YAxis type="category" dataKey="label" width={90} interval={0} tickLine={false} axisLine={{ stroke: INK.axis }}
                          tick={({ x, y, payload }) => {
                            const on = model.bySvc.find((s) => s.label === payload.value)?.key === pickSvc;
                            return <text x={x} y={y} dy={4} textAnchor="end" fontSize={12} fill={on ? INK.primary : INK.secondary} fontWeight={on ? 700 : 400}>{payload.value}</text>;
                          }} />
                        <Tooltip {...tooltipStyle} cursor={{ fill: '#f1f5f9' }} />
                        {keys.length > 1 && <Legend wrapperStyle={{ fontSize: 12, color: INK.secondary }} itemSorter={(i) => keys.indexOf(i.value)} />}
                        {keys.map((k, idx) => (
                          <Bar key={k} dataKey={k} name={k} stackId="s" fill={PRIO_COLOR[k.slice(1)]} stroke="#fff" strokeWidth={1} maxBarSize={16}
                            radius={idx === keys.length - 1 ? [0, 3, 3, 0] : 0} isAnimationActive={false} cursor="pointer"
                            onClick={(e) => { const s = (e.payload ?? e).key; setPickSvc(s === pickSvc ? null : s); }} />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </section>
            </div>
          </div>
        )}
      </Panel>

      <Panel title={`Incidents${prio !== 'all' ? ` · ${label}` : ''}${pickDay ? ` · ${shortDate(pickDay)}` : ''}${svcName ? ` · ${svcName}` : ''}`} flush
        tooltip="Incidents opened in the window, filtered by the priority, day and service selected above. Select one for its lifecycle, alerts and causing deployment.">
        <IncidentsTable rows={rows} loading={loading} onOpen={onIncident} empty="No incidents match." />
      </Panel>
    </div>
  );
}
