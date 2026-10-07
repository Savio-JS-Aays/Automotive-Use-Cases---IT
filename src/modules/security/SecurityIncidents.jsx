import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { X } from 'lucide-react';
import Panel from '../../components/Panel';
import Segmented, { ToolbarSelect } from '../../components/Segmented';
import { INK, axisTick, tooltipStyle } from '../../lib/chartTheme';
import { INC_SEV, fmtDT, fmtH, hoursBetween, inRange } from './secData';

const GROUPS = [
  { value: 'vector', label: 'Vector' },
  { value: 'department', label: 'Department' },
  { value: 'month', label: 'Month' },
];
const monthLabel = (k) => new Date(`${k}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' });
const LEGEND = [INC_SEV[1].label, INC_SEV[2].label, INC_SEV[3].label];

/**
 * Security incidents as one filterable chart: grouped by vector, department or month, stacked by severity (1 = most severe).
 * Range: this window or the last 12 months; status filter. A bar filters the incident list below (→ incident drawer).
 */
export default function SecurityIncidents({ incs, window: w, onOpenIncident }) {
  const [group, setGroup] = useState('vector');
  const [range, setRange] = useState('window');
  const [status, setStatus] = useState('');
  const [pick, setPick] = useState(null); // { group, key }

  const from = range === 'window' ? w.d_from : (() => { const d = new Date(`${w.as_of}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 364); return d.toISOString().slice(0, 10); })();
  const base = incs.filter((i) => inRange(i.detected_time.slice(0, 10), from, w.d_to) && (!status || i.status === status));
  const keyOf = (i, g = group) => (g === 'month' ? i.detected_time.slice(0, 7) : i[g]);

  const rows = useMemo(() => {
    const m = new Map();
    for (const i of base) {
      const k = keyOf(i);
      const x = m.get(k) || { key: k, label: group === 'month' ? monthLabel(k) : k, n: 0, [LEGEND[0]]: 0, [LEGEND[1]]: 0, [LEGEND[2]]: 0 };
      x.n += 1; x[INC_SEV[i.severity].label] += 1;
      m.set(k, x);
    }
    const out = [...m.values()];
    return group === 'month' ? out.sort((a, b) => a.key.localeCompare(b.key)) : out.sort((a, b) => b.n - a.n);
  }, [base, group]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = base.filter((i) => !pick || keyOf(i, pick.group) === pick.key).sort((a, b) => b.detected_time.localeCompare(a.detected_time));
  const sev12 = base.filter((i) => i.severity <= 2).length;
  const open = base.filter((i) => i.status !== 'Resolved').length;
  const top = group !== 'month' ? rows[0] : null;
  const vertical = group !== 'month';

  return (
    <Panel title="Security incidents"
      tooltip="Security incidents (attacks or misuse that caused real impact), grouped by vector, department or month and split by severity (Sev 1 = most severe). Pick the range and status; select a bar to list those incidents below, then select one for its full timeline.">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented label="Group by" value={group} onChange={(v) => { setGroup(v); setPick(null); }} options={GROUPS} />
        <Segmented label="Range" value={range} onChange={(v) => { setRange(v); setPick(null); }} options={[{ value: 'window', label: 'This window' }, { value: 'year', label: 'Last 12 months' }]} />
        <ToolbarSelect label="Status" value={status} onChange={setStatus}>
          <option value="">All</option><option>Open</option><option>Contained</option><option>Resolved</option>
        </ToolbarSelect>
      </div>
      <p className="mb-2 text-xs text-slate-600">
        <b className="text-slate-900">{base.length}</b> incidents · <b className="text-slate-900">{sev12}</b> sev 1–2 · <b className="text-slate-900">{open}</b> not resolved
        {top && <> · most: <b className="text-slate-900">{top.label}</b> ({top.n})</>}
      </p>
      {!rows.length ? <p className="py-8 text-center text-sm text-slate-500">No security incidents for these filters.</p> : (
        <div style={{ height: vertical ? Math.max(170, rows.length * 30 + 60) : 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout={vertical ? 'vertical' : 'horizontal'} margin={{ top: 4, right: 24, left: 8, bottom: 0 }}>
              <CartesianGrid stroke={INK.grid} horizontal={!vertical} vertical={vertical} />
              {vertical ? (
                <>
                  <XAxis type="number" allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="label" width={130} interval={0} tick={{ fontSize: 12, fill: INK.secondary }} tickLine={false} axisLine={{ stroke: INK.axis }} />
                </>
              ) : (
                <>
                  <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: INK.axis }} />
                  <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} width={28} />
                </>
              )}
              <Tooltip {...tooltipStyle} cursor={{ fill: '#f1f5f9' }} />
              <Legend wrapperStyle={{ fontSize: 12, color: INK.secondary }} itemSorter={(i) => LEGEND.indexOf(i.value)} />
              {[1, 2, 3].map((sv, idx) => (
                <Bar key={sv} dataKey={INC_SEV[sv].label} stackId="s" fill={INC_SEV[sv].color} stroke="#fff" strokeWidth={1} maxBarSize={vertical ? 16 : 28} isAnimationActive={false}
                  radius={idx === 2 ? (vertical ? [0, 4, 4, 0] : [4, 4, 0, 0]) : 0} cursor="pointer"
                  onClick={(e) => { const k = (e.payload ?? e).key; setPick(pick?.key === k ? null : { group, key: k }); }} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="mt-4 rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-600">
          <span className="font-semibold text-slate-800">Incident list</span>
          {pick && (
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white py-0.5 pl-2.5 pr-1">
              {pick.group === 'month' ? monthLabel(pick.key) : pick.key}
              <button type="button" onClick={() => setPick(null)} aria-label="Clear selection" className="rounded-full p-0.5 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"><X size={12} /></button>
            </span>
          )}
          <span className="ml-auto tabular-nums">{list.length} incident{list.length === 1 ? '' : 's'}</span>
        </div>
        <div className="overflow-x-auto max-h-80">
          <table className="w-full text-sm text-left text-slate-600">
            <thead className="text-xs uppercase bg-white text-slate-500 border-b border-slate-200 sticky top-0">
              <tr>{['Incident', 'Vector', 'Severity', 'Department', 'Detected', 'Time to detect', 'Time to contain', 'Status'].map((h) => <th key={h} scope="col" className="px-4 py-2 font-semibold whitespace-nowrap">{h}</th>)}</tr>
            </thead>
            <tbody>
              {list.map((i) => (
                <tr key={i.sec_incident_id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2"><button type="button" onClick={() => onOpenIncident(i.sec_incident_id)} className="text-left font-medium text-blue-700 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded">{i.sec_incident_id}</button><span className="block text-xs text-slate-500">{i.title}</span></td>
                  <td className="px-4 py-2 whitespace-nowrap">{i.vector}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-xs font-semibold" style={{ color: INC_SEV[i.severity].color }}>{INC_SEV[i.severity].label}</td>
                  <td className="px-4 py-2">{i.department}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{fmtDT(i.detected_time)}</td>
                  <td className="px-4 py-2 tabular-nums">{fmtH(hoursBetween(i.impact_start_time, i.detected_time))}</td>
                  <td className="px-4 py-2 tabular-nums">{fmtH(hoursBetween(i.detected_time, i.contained_time))}</td>
                  <td className="px-4 py-2">{i.status}</td>
                </tr>
              ))}
              {!list.length && <tr><td colSpan={8} className="px-4 py-5 text-center text-slate-500">No incidents match.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </Panel>
  );
}
