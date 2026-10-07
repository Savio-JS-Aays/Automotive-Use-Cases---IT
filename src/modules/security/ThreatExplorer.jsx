import { useMemo, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { X } from 'lucide-react';
import Panel from '../../components/Panel';
import Segmented from '../../components/Segmented';
import { INK, SERIES, axisTick, gridProps, tooltipStyle } from '../../lib/chartTheme';
import { formatNumber, formatPct } from '../../lib/format';
import { INC_SEV, INCIDENT_VECTOR_OF, THREAT_VECTORS, VECTOR_COLOR, fmtDT, fmtH, hoursBetween, inRange } from './secData';

const shortDate = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });
const monthLabel = (iso) => new Date(`${iso}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' });

/** Phishing drill-down: monthly simulation click / report rates and the latest campaign by department. */
function PhishingDetail({ phish, department }) {
  const rows = phish.filter((p) => !department || p.department === department);
  const months = useMemo(() => {
    const m = new Map();
    for (const p of rows) {
      const k = p.campaign_date.slice(0, 7);
      const x = m.get(k) || { k, label: monthLabel(k), sent: 0, clicked: 0, reported: 0 };
      x.sent += p.emails_sent; x.clicked += p.clicked; x.reported += p.reported;
      m.set(k, x);
    }
    return [...m.values()].sort((a, b) => a.k.localeCompare(b.k)).map((x) => ({ ...x, Clicked: x.clicked / x.sent, Reported: x.reported / x.sent }));
  }, [rows]);
  const last = months[months.length - 1]?.k;
  const byDept = phish.filter((p) => p.campaign_date.slice(0, 7) === last)
    .map((p) => ({ dept: p.department, click: p.clicked / p.emails_sent, sent: p.emails_sent, clicked: p.clicked }))
    .sort((a, b) => b.click - a.click);
  const first = months[0];
  const end = months[months.length - 1];

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-bold text-slate-900">Phishing simulations{department ? ` · ${department}` : ''}</h3>
      <p className="mb-2 text-xs text-slate-500">
        Monthly fake phishing emails sent to staff: who clicked (lower is better) and who reported it (higher is better).
        {first && end && <> Click rate went from <b className="text-slate-900">{formatPct(first.Clicked, 1)}</b> ({first.label}) to <b className="text-slate-900">{formatPct(end.Clicked, 1)}</b> ({end.label}).</>}
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={months} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: INK.axis }} interval="preserveStartEnd" />
              <YAxis tickFormatter={(v) => `${Math.round(v * 100)}%`} tick={axisTick} tickLine={false} axisLine={false} width={40} />
              <Tooltip {...tooltipStyle} formatter={(v, n, p) => [`${formatPct(v)} (${formatNumber(n === 'Clicked' ? p.payload.clicked : p.payload.reported)} of ${formatNumber(p.payload.sent)})`, n]} />
              <Legend wrapperStyle={{ fontSize: 12, color: INK.secondary }} />
              <Line dataKey="Clicked" stroke={SERIES[1]} strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line dataKey="Reported" stroke={SERIES[0]} strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold text-slate-600">Latest campaign ({last ? monthLabel(last) : '—'}) · click rate by department</p>
          <div style={{ height: Math.max(150, byDept.length * 24 + 30) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byDept} layout="vertical" margin={{ top: 0, right: 40, left: 8, bottom: 0 }}>
                <CartesianGrid stroke={INK.grid} horizontal={false} />
                <XAxis type="number" tickFormatter={(v) => `${Math.round(v * 100)}%`} tick={axisTick} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="dept" width={110} interval={0} tick={{ fontSize: 11, fill: INK.secondary }} tickLine={false} axisLine={{ stroke: INK.axis }} />
                <Tooltip {...tooltipStyle} cursor={{ fill: '#f1f5f9' }} formatter={(v, n, p) => [`${formatPct(v)} (${p.payload.clicked} of ${p.payload.sent})`, 'Clicked']} />
                <Bar dataKey="click" fill={SERIES[1]} radius={[0, 4, 4, 0]} maxBarSize={14} isAnimationActive={false}
                  label={{ position: 'right', fontSize: 11, fill: INK.secondary, formatter: (v) => formatPct(v, 0) }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Threats by vector: one tile per threat vector (detected, blocked %, got through, real incidents). A tile opens its
 * drill-down: daily trend (detected or got through), the phishing simulation charts for phishing, and that vector's
 * security incidents (→ incident drawer). Threat feed rows have no region or department.
 */
export default function ThreatExplorer({ threats, incs, phish, window: w, department, onOpenIncident }) {
  const [sel, setSel] = useState(null);
  const [metric, setMetric] = useState('through');

  const stats = useMemo(() => THREAT_VECTORS.map((v) => {
    const rows = threats.filter((t) => t.vector === v && inRange(t.date_id, w.d_from, w.d_to));
    const detected = rows.reduce((s, r) => s + r.detected, 0);
    const blocked = rows.reduce((s, r) => s + r.blocked, 0);
    const iv = INCIDENT_VECTOR_OF[v];
    const vi = incs.filter((i) => i.vector === iv && inRange(i.detected_time.slice(0, 10), w.d_from, w.d_to));
    return { v, iv, detected, blocked, through: detected - blocked, rate: detected ? blocked / detected : null, incidents: vi.length, severe: vi.filter((i) => i.severity <= 2).length };
  }), [threats, incs, w]);

  const weekly = useMemo(() => {
    const m = new Map();
    for (const t of threats.filter((x) => inRange(x.date_id, w.d_from, w.d_to))) {
      const idx = Math.floor((new Date(`${w.d_to}T00:00:00Z`) - new Date(`${t.date_id}T00:00:00Z`)) / (7 * 864e5));
      const x = m.get(idx) || { idx, end: t.date_id, ...Object.fromEntries(THREAT_VECTORS.map((v) => [v, 0])) };
      x[t.vector] += t.detected - t.blocked;
      if (t.date_id > x.end) x.end = t.date_id;
      m.set(idx, x);
    }
    return [...m.values()].sort((a, b) => b.idx - a.idx).map((x) => ({ ...x, label: `wk to ${shortDate(x.end)}` }));
  }, [threats, w]);

  const s = stats.find((x) => x.v === sel);
  const daily = sel ? threats.filter((t) => t.vector === sel && inRange(t.date_id, w.d_from, w.d_to))
    .sort((a, b) => a.date_id.localeCompare(b.date_id)).map((t) => ({ label: shortDate(t.date_id), Detected: t.detected, 'Got through': t.detected - t.blocked })) : [];
  const vecIncs = sel ? incs.filter((i) => i.vector === s.iv && inRange(i.detected_time.slice(0, 10), w.d_from, w.d_to))
    .sort((a, b) => b.detected_time.localeCompare(a.detected_time)) : [];
  const key = metric === 'through' ? 'Got through' : 'Detected';

  return (
    <Panel title="Threats by vector"
      tooltip="Attack attempts seen by email, endpoint and network controls in the window, per vector: how many were detected, what share was blocked, and how many got through. 'Real incidents' are security incidents of the matching type (Intrusion attempt ↔ Vulnerability exploit, Phishing email ↔ Phishing). Select a tile to drill in; the chart below shows the attempts that got through each week.">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {stats.map((x) => (
          <button key={x.v} type="button" onClick={() => setSel(sel === x.v ? null : x.v)} aria-pressed={sel === x.v}
            className={`rounded-xl border p-3 text-left transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${sel === x.v ? 'border-slate-900 ring-1 ring-slate-900' : 'border-slate-200 hover:border-slate-400'}`}>
            <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900"><span className="h-2.5 w-2.5 rounded-full" style={{ background: VECTOR_COLOR[x.v] }} />{x.v}</p>
            <p className="mt-2 text-xl font-bold tabular-nums text-slate-900">{formatNumber(x.detected)}</p>
            <p className="text-xs text-slate-500">detected · {x.rate == null ? '—' : formatPct(x.rate, 2)} blocked</p>
            <p className="mt-1 text-xs"><b className="text-slate-900 tabular-nums">{formatNumber(x.through)}</b> got through · <b className="text-slate-900">{x.incidents}</b> real incident{x.incidents === 1 ? '' : 's'}</p>
          </button>
        ))}
      </div>

      {!sel ? (
        <div className="mt-5">
          <p className="mb-2 text-xs text-slate-600">Attempts that <b>got through</b> the controls, per week and vector. Select a tile above to drill into one vector.</p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: INK.axis }} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} width={32} />
                <Tooltip {...tooltipStyle} cursor={{ fill: '#f1f5f9' }} formatter={(v, n) => [`${v} got through`, n]} />
                <Legend wrapperStyle={{ fontSize: 12, color: INK.secondary }} itemSorter={(i) => THREAT_VECTORS.indexOf(i.value)} />
                {THREAT_VECTORS.map((v, i) => (
                  <Bar key={v} dataKey={v} stackId="t" fill={VECTOR_COLOR[v]} stroke="#fff" strokeWidth={1} isAnimationActive={false} cursor="pointer"
                    radius={i === THREAT_VECTORS.length - 1 ? [4, 4, 0, 0] : 0} onClick={() => setSel(v)} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white py-0.5 pl-2.5 pr-1 text-sm font-semibold text-slate-800">
              {sel}
              <button type="button" onClick={() => setSel(null)} aria-label="Close vector drill-down" className="rounded-full p-0.5 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"><X size={13} /></button>
            </span>
            <Segmented label="Daily metric" value={metric} onChange={setMetric} options={[{ value: 'through', label: 'Got through' }, { value: 'detected', label: 'Detected' }]} />
            <span className="text-xs text-slate-600">{formatNumber(s.detected)} detected · {formatNumber(s.blocked)} blocked · {formatNumber(s.through)} got through · {s.incidents} incidents ({s.severe} sev 1–2)</span>
          </div>
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-1 text-sm font-bold text-slate-900">{sel} · {key.toLowerCase()} per day</h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={daily} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: INK.axis }} interval="preserveStartEnd" minTickGap={16} />
                  <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => formatNumber(v)} />
                  <Tooltip {...tooltipStyle} formatter={(v, n) => [formatNumber(v), n]} />
                  <Area dataKey={key} stroke={VECTOR_COLOR[sel]} fill={VECTOR_COLOR[sel]} fillOpacity={0.15} strokeWidth={2} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>
          {sel === 'Phishing email' && <PhishingDetail phish={phish} department={department} />}
          <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <h3 className="px-4 pt-3 text-sm font-bold text-slate-900">{s.iv} incidents in the window ({vecIncs.length})</h3>
            {!vecIncs.length ? <p className="px-4 py-4 text-sm text-slate-500">None — every {sel.toLowerCase()} attempt this window was blocked or caused no impact.</p> : (
              <table className="mt-2 w-full text-sm text-left text-slate-600">
                <thead className="text-xs uppercase bg-slate-50 text-slate-500 border-y border-slate-200">
                  <tr>{['Incident', 'Severity', 'Department', 'Detected', 'Time to detect', 'Time to contain', 'Status'].map((h) => <th key={h} scope="col" className="px-4 py-2 font-semibold whitespace-nowrap">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {vecIncs.map((i) => (
                    <tr key={i.sec_incident_id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-2"><button type="button" onClick={() => onOpenIncident(i.sec_incident_id)} className="text-left font-medium text-blue-700 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded">{i.sec_incident_id}</button><span className="block text-xs text-slate-500">{i.title}</span></td>
                      <td className="px-4 py-2 whitespace-nowrap text-xs font-semibold" style={{ color: INC_SEV[i.severity].color }}>{INC_SEV[i.severity].label}</td>
                      <td className="px-4 py-2">{i.department}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{fmtDT(i.detected_time)}</td>
                      <td className="px-4 py-2 tabular-nums">{fmtH(hoursBetween(i.impact_start_time, i.detected_time))}</td>
                      <td className="px-4 py-2 tabular-nums">{fmtH(hoursBetween(i.detected_time, i.contained_time))}</td>
                      <td className="px-4 py-2">{i.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      )}
    </Panel>
  );
}
