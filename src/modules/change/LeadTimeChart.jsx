import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Panel from '../../components/Panel';
import Segmented from '../../components/Segmented';
import { INK, axisTick, gridProps, tooltipStyle } from '../../lib/chartTheme';
import { TYPES, TYPE_COLOR, day, fmtHours, median, mondayOf, shortDate } from './changeData';

const BUCKETS = [
  { key: '< 8 h', max: 8 },
  { key: '8–24 h', max: 24 },
  { key: '1–2 days', max: 48 },
  { key: '2–4 days', max: 96 },
  { key: '4+ days', max: Infinity },
];
const monthLabel = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' });

/**
 * Lead time for changes (first commit → production) per change type.
 * Distribution: how many deployments fall in each lead-time band. Trend: median per week (window) or per month (12 months).
 * year = rows for the last 12 months (loaded when that range is picked); window = current-window rows. Both already in page scope.
 */
export default function LeadTimeChart({ windowDeps, yearDeps, yearLoading, range, setRange, ctype }) {
  const [view, setView] = useState('distribution');
  const rows = (range === 'year' ? yearDeps : windowDeps).filter((d) => d.lead_time_hours != null);
  const types = ctype ? [ctype] : TYPES;

  const dist = useMemo(() => BUCKETS.map((b, i) => {
    const lo = i ? BUCKETS[i - 1].max : 0;
    const r = { key: b.key };
    for (const t of types) r[t] = rows.filter((d) => d.change_type === t && d.lead_time_hours >= lo && d.lead_time_hours < b.max).length;
    return r;
  }), [rows, types]); // eslint-disable-line react-hooks/exhaustive-deps

  const trend = useMemo(() => {
    const m = new Map();
    for (const d of rows) {
      const k = range === 'year' ? `${day(d).slice(0, 7)}-01` : mondayOf(day(d));
      const x = m.get(k) || { key: k, label: range === 'year' ? monthLabel(k) : shortDate(k), ...Object.fromEntries(types.map((t) => [`_${t}`, []])) };
      if (x[`_${d.change_type}`]) x[`_${d.change_type}`].push(Number(d.lead_time_hours));
      m.set(k, x);
    }
    return [...m.values()].sort((a, b) => a.key.localeCompare(b.key))
      .map((x) => ({ ...x, ...Object.fromEntries(types.map((t) => [t, x[`_${t}`].length ? Math.round(median(x[`_${t}`]) * 10) / 10 : null])) }));
  }, [rows, range, types]); // eslint-disable-line react-hooks/exhaustive-deps

  const meds = types.map((t) => ({ t, m: median(rows.filter((d) => d.change_type === t).map((d) => Number(d.lead_time_hours))), n: rows.filter((d) => d.change_type === t).length }));
  const codeTrend = trend.filter((x) => x.Code != null);
  const change = range === 'year' && codeTrend.length > 1 ? { from: codeTrend[0], to: codeTrend[codeTrend.length - 1] } : null;

  return (
    <Panel title="Lead time for changes"
      tooltip="Hours from the first commit of a change to it running in production, per change type. Distribution shows how many deployments fall in each band; Trend shows the median per week (this window) or per month (last 12 months). Shorter is better: changes reach users faster and are smaller and safer.">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented label="View" value={view} onChange={setView} options={[{ value: 'distribution', label: 'Distribution' }, { value: 'trend', label: 'Trend' }]} />
        <Segmented label="Range" value={range} onChange={setRange} options={[{ value: 'window', label: 'This window' }, { value: 'year', label: 'Last 12 months' }]} />
      </div>
      <p className="mb-2 text-xs text-slate-600">
        Median: {meds.map((x, i) => (
          <span key={x.t}>{i > 0 && ' · '}<span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: TYPE_COLOR[x.t] }} />{x.t} <b className="text-slate-900">{fmtHours(x.m)}</b> ({x.n})</span></span>
        ))}
        {change && <> · Code went from <b className="text-slate-900">{fmtHours(change.from.Code)}</b> ({change.from.label}) to <b className="text-slate-900">{fmtHours(change.to.Code)}</b> ({change.to.label})</>}
      </p>
      {range === 'year' && yearLoading ? <p className="h-60 text-sm text-slate-500">Loading 12 months…</p> : (
        <div className="h-60">
          <ResponsiveContainer width="100%" height="100%">
            {view === 'distribution' ? (
              <BarChart data={dist} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="key" tick={axisTick} tickLine={false} axisLine={{ stroke: INK.axis }} />
                <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} width={34} label={{ value: 'deployments', angle: -90, position: 'insideLeft', fill: INK.muted, fontSize: 11 }} />
                <Tooltip {...tooltipStyle} cursor={{ fill: '#f1f5f9' }} formatter={(v, n) => [`${v} deployments`, n]} />
                {types.length > 1 && <Legend wrapperStyle={{ fontSize: 12, color: INK.secondary }} itemSorter={(i) => TYPES.indexOf(i.value)} />}
                {types.map((t, i) => <Bar key={t} dataKey={t} stackId="l" fill={TYPE_COLOR[t]} stroke="#fff" strokeWidth={1} radius={i === types.length - 1 ? [4, 4, 0, 0] : 0} isAnimationActive={false} />)}
              </BarChart>
            ) : (
              <LineChart data={trend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: INK.axis }} interval="preserveStartEnd" minTickGap={12} />
                <YAxis tickFormatter={(v) => `${v} h`} tick={axisTick} tickLine={false} axisLine={false} width={46} />
                <Tooltip {...tooltipStyle} formatter={(v, n) => [v == null ? '—' : fmtHours(v), `${n} median`]} />
                {types.length > 1 && <Legend wrapperStyle={{ fontSize: 12, color: INK.secondary }} itemSorter={(i) => TYPES.indexOf(i.value)} />}
                {types.map((t) => <Line key={t} dataKey={t} stroke={TYPE_COLOR[t]} strokeWidth={2} dot={{ r: 2 }} connectNulls isAnimationActive={false} />)}
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  );
}
