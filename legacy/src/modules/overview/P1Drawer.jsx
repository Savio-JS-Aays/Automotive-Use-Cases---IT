import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { X } from 'lucide-react';
import Drawer from '../../components/Drawer';
import Segmented from '../../components/Segmented';
import IncidentsTable from '../../components/IncidentsTable';
import { INK, SERIES, STATUS, axisTick, gridProps, tooltipStyle } from '../../lib/chartTheme';

const shortDate = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });
const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const day = (i) => i.open_time.slice(0, 10);
const median = (xs) => { if (!xs.length) return null; const a = [...xs].sort((x, y) => x - y); const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
const PRIO_COLOR = { 1: STATUS.critical, 2: STATUS.serious };
const LEGEND_ORDER = ['P1', 'P2'];

function Stat({ label, value, note }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-xl font-semibold text-slate-900 tabular-nums">{value}</p>
      {note && <p className="text-xs text-slate-500">{note}</p>}
    </div>
  );
}

/**
 * P1 detail pop-up for the Overview card: daily P1/P2 bars, pace vs the prior window, by service, and the incident list.
 * cur / prv are it_ops_incidents rows already filtered to the Overview scope (region, vertical, service).
 */
export default function P1Drawer({ open, onClose, cur = [], prv = [], allInScope = [], window: w, scopeLabel, onIncident }) {
  const [prio, setPrio] = useState('p1');
  const [pickDay, setPickDay] = useState(null);
  const [pickSvc, setPickSvc] = useState(null);
  const maxP = prio === 'p1' ? 1 : 2;

  const model = useMemo(() => {
    if (!w) return null;
    const days = [];
    for (let d = w.d_from; d <= w.d_to; d = addDays(d, 1)) days.push(d);
    const major = cur.filter((i) => i.priority <= maxP);
    const daily = days.map((d) => {
      const xs = major.filter((i) => day(i) === d);
      return { date: d, label: shortDate(d), P1: xs.filter((i) => i.priority === 1).length, P2: xs.filter((i) => i.priority === 2).length, names: [...new Set(xs.map((i) => i.short_name))] };
    });
    // pace: cumulative count by day number, this window vs the prior one
    const prevDays = days.map((_, k) => addDays(w.p_from, k));
    let c = 0; let p = 0;
    const pace = days.map((d, k) => {
      c += cur.filter((i) => i.priority <= maxP && day(i) === d).length;
      p += prv.filter((i) => i.priority <= maxP && day(i) === prevDays[k]).length;
      return { n: k + 1, label: `Day ${k + 1}`, current: c, prior: p, curDate: d, prvDate: prevDays[k] };
    });
    const svc = new Map();
    for (const i of major) {
      const x = svc.get(i.service_id) || { key: i.service_id, label: i.short_name, P1: 0, P2: 0 };
      x[`P${i.priority}`] += 1;
      svc.set(i.service_id, x);
    }
    const bySvc = [...svc.values()].sort((a, b) => (b.P1 - a.P1) || (b.P1 + b.P2 - a.P1 - a.P2));
    const p1Res = cur.filter((i) => i.priority === 1 && i.status === 'Resolved').map((i) => i.mttr_minutes / 60);
    const causes = new Map();
    cur.filter((i) => i.priority === 1).forEach((i) => causes.set(i.root_cause_type, (causes.get(i.root_cause_type) ?? 0) + 1));
    return {
      daily, pace, bySvc,
      p1: cur.filter((i) => i.priority === 1).length, p1Prev: prv.filter((i) => i.priority === 1).length,
      p2: cur.filter((i) => i.priority === 2).length,
      open: allInScope.filter((i) => i.status === 'Active'),
      p1Mttr: median(p1Res),
      topCause: [...causes.entries()].sort((a, b) => b[1] - a[1])[0],
    };
  }, [cur, prv, allInScope, w, maxP]);

  if (!model) return null;
  const rows = cur.filter((i) => i.priority <= maxP && (!pickDay || day(i) === pickDay) && (!pickSvc || i.service_id === pickSvc));
  const svcName = model.bySvc.find((s) => s.key === pickSvc)?.label;
  const keys = prio === 'p1' ? ['P1'] : ['P1', 'P2'];
  const diff = model.p1 - model.p1Prev;
  const openMajor = model.open.filter((i) => i.priority <= 2);

  return (
    <Drawer open={open} onClose={onClose} width="max-w-4xl" title="P1 incidents · detail"
      subtitle={`${shortDate(w.d_from)} – ${shortDate(w.d_to)} vs ${shortDate(w.p_from)} – ${shortDate(w.p_to)}${scopeLabel ? ` · ${scopeLabel}` : ''}`}>
      <div className="space-y-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="P1 this window" value={model.p1} note={`${diff > 0 ? '+' : ''}${diff} vs prior (${model.p1Prev})`} />
          <Stat label="P2 this window" value={model.p2} />
          <Stat label="Median P1 time to resolve" value={model.p1Mttr == null ? '—' : `${model.p1Mttr.toFixed(1)} h`} note="target 4 h" />
          <Stat label="Open now" value={model.open.length} note={`${openMajor.length} P1/P2${model.topCause ? ` · top P1 cause: ${model.topCause[0]}` : ''}`} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Segmented label="Priorities" value={prio} onChange={(v) => { setPrio(v); setPickDay(null); setPickSvc(null); }}
            options={[{ value: 'p1', label: 'P1 only' }, { value: 'p12', label: 'P1 + P2' }]} />
          {pickDay && <Chip label={`Day: ${shortDate(pickDay)}`} onClear={() => setPickDay(null)} />}
          {pickSvc && <Chip label={`Service: ${svcName}`} onClear={() => setPickSvc(null)} />}
        </div>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-1 text-sm font-semibold text-slate-800">Per day</h3>
          <p className="mb-2 text-xs text-slate-500">Incidents opened each day. Hover for the services; select a bar to list that day's incidents below.</p>
          <div className="h-56">
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
                        <p>P1: {r.P1}{prio === 'p12' ? ` · P2: ${r.P2}` : ''}</p>
                        {r.names.length > 0 && <p className="text-slate-600">{r.names.join(', ')}</p>}
                      </div>
                    );
                  }} />
                {keys.length > 1 && <Legend wrapperStyle={{ fontSize: 12, color: INK.secondary }} itemSorter={(i) => LEGEND_ORDER.indexOf(i.value)} />}
                {keys.map((k, idx) => (
                  <Bar key={k} dataKey={k} name={k} stackId="d" fill={PRIO_COLOR[k.slice(1)]} stroke="#fff" strokeWidth={1} maxBarSize={22}
                    radius={idx === keys.length - 1 ? [3, 3, 0, 0] : 0} isAnimationActive={false} cursor="pointer"
                    onClick={(e) => { const d = (e.payload ?? e).date; setPickDay(d === pickDay ? null : d); }} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-1 text-sm font-semibold text-slate-800">Pace vs prior window</h3>
            <p className="mb-2 text-xs text-slate-500">Running total by day of the window; above the dashed line = more than last time by the same point.</p>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={model.pace} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="n" tick={axisTick} tickLine={false} axisLine={{ stroke: INK.axis }} tickFormatter={(n) => `D${n}`} interval="preserveStartEnd" minTickGap={16} />
                  <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} width={28} />
                  <Tooltip {...tooltipStyle} labelFormatter={(n) => `Day ${n}`}
                    formatter={(v, name, p) => [`${v} (to ${shortDate(name === 'This window' ? p.payload.curDate : p.payload.prvDate)})`, name]} />
                  <Legend wrapperStyle={{ fontSize: 12, color: INK.secondary }} />
                  <Line dataKey="prior" name="Prior window" stroke={INK.muted} strokeDasharray="5 4" strokeWidth={2} dot={false} isAnimationActive={false} type="stepAfter" />
                  <Line dataKey="current" name="This window" stroke={SERIES[0]} strokeWidth={2} dot={false} isAnimationActive={false} type="stepAfter" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-1 text-sm font-semibold text-slate-800">By service</h3>
            <p className="mb-2 text-xs text-slate-500">Select a service to list its incidents below.</p>
            {!model.bySvc.length ? <p className="py-10 text-center text-sm text-slate-500">None in this window.</p> : (
              <div style={{ height: Math.max(150, model.bySvc.length * 30 + 40) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={model.bySvc} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 0 }}>
                    <CartesianGrid stroke={INK.grid} horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="label" width={90} interval={0} tick={{ fontSize: 12, fill: INK.secondary }} tickLine={false} axisLine={{ stroke: INK.axis }} />
                    <Tooltip {...tooltipStyle} cursor={{ fill: '#f1f5f9' }} />
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

        <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <h3 className="px-4 pt-3 text-sm font-semibold text-slate-800">{prio === 'p1' ? 'P1' : 'P1 and P2'} incidents{pickDay ? ` · ${shortDate(pickDay)}` : ''}{svcName ? ` · ${svcName}` : ''}</h3>
          <IncidentsTable rows={rows} onOpen={onIncident} empty="No incidents match." />
        </section>
      </div>
    </Drawer>
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
