import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Panel from '../../components/Panel';
import Segmented from '../../components/Segmented';
import { INK, SERIES, STATUS, axisTick, gridProps, tooltipStyle } from '../../lib/chartTheme';
import { TYPES, TYPE_COLOR, addDays, day, longDate, mondayOf, shortDate } from './changeData';

const OUTCOME_KEYS = [
  { key: 'Successful', color: SERIES[0] },
  { key: 'Failed · rolled back', color: STATUS.serious },
  { key: 'Failed · fixed forward', color: STATUS.critical },
];

/**
 * Deployments over time, per day or per week, stacked by outcome or by change type. A bar filters the table to that period.
 */
export default function DeploymentTrend({ deps, window: w, onSelectRange }) {
  const [grain, setGrain] = useState(null); // null = auto (day ≤ 14 days, else week)
  const [colour, setColour] = useState('outcome');
  const g = grain ?? ((w?.days ?? 30) <= 14 ? 'day' : 'week');
  const keys = colour === 'outcome' ? OUTCOME_KEYS : TYPES.map((t) => ({ key: t, color: TYPE_COLOR[t] }));

  const rows = useMemo(() => {
    if (!w) return [];
    const m = new Map();
    for (let d = w.d_from; d <= w.d_to; d = addDays(d, 1)) {
      const k = g === 'day' ? d : mondayOf(d);
      if (!m.has(k)) m.set(k, { key: k, from: d, to: d, n: 0, failed: 0, ...Object.fromEntries(keys.map((x) => [x.key, 0])) });
      m.get(k).to = d;
    }
    for (const d of deps) {
      const r = m.get(g === 'day' ? day(d) : mondayOf(day(d)));
      if (!r) continue;
      r.n += 1;
      if (d.status === 'Failed') r.failed += 1;
      const k = colour === 'outcome' ? (d.status !== 'Failed' ? 'Successful' : d.rolled_back_by ? 'Failed · rolled back' : 'Failed · fixed forward') : d.change_type;
      r[k] += 1;
    }
    return [...m.values()].map((r) => ({ ...r, label: g === 'day' ? shortDate(r.from) : shortDate(r.from) }));
  }, [deps, w, g, colour]); // eslint-disable-line react-hooks/exhaustive-deps

  const busiest = rows.reduce((b, r) => (!b || r.n > b.n ? r : b), null);
  const avg = rows.length ? rows.reduce((t, r) => t + r.n, 0) / rows.length : 0;
  const unit = g === 'day' ? 'day' : 'week';

  return (
    <Panel title={`Deployments per ${unit}`}
      tooltip="Production deployments (rollbacks excluded) per day or per week, stacked by outcome or by change type. It shows release waves and whether failures rise with volume. Select a bar to list that period's deployments in the table.">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented label="Period" value={g} onChange={setGrain} options={[{ value: 'day', label: 'Per day' }, { value: 'week', label: 'Per week' }]} />
        <Segmented label="Colour by" value={colour} onChange={setColour} options={[{ value: 'outcome', label: 'Outcome' }, { value: 'type', label: 'Change type' }]} />
      </div>
      <p className="mb-2 text-xs text-slate-600">
        Average <b className="text-slate-900">{avg.toFixed(1)}</b> per {unit}
        {busiest && busiest.n > 0 && <> · busiest {g === 'day' ? longDate(busiest.from) : `week of ${shortDate(busiest.from)}`} (<b className="text-slate-900">{busiest.n}</b>{busiest.failed ? `, ${busiest.failed} failed` : ''})</>}
      </p>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="20%">
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: INK.axis }} interval="preserveStartEnd" minTickGap={14} />
            <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} width={30} />
            <Tooltip {...tooltipStyle} cursor={{ fill: '#f1f5f9' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const r = payload[0].payload;
                return (
                  <div className="rounded-lg border border-black/10 bg-white px-3 py-2 text-xs shadow-sm">
                    <p className="font-semibold text-slate-700">{g === 'day' ? longDate(r.from) : `Week of ${shortDate(r.from)}${r.from !== r.to ? ` – ${shortDate(r.to)}` : ''}`}</p>
                    <p className="text-slate-900">{r.n} deployments{r.n ? ` · ${r.failed} failed (${Math.round((r.failed / r.n) * 100)}%)` : ''}</p>
                    {keys.filter((k) => r[k.key]).map((k) => <p key={k.key} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: k.color }} />{k.key}: {r[k.key]}</p>)}
                    <p className="mt-1 text-slate-500">Click to list them</p>
                  </div>
                );
              }} />
            <Legend wrapperStyle={{ fontSize: 12, color: INK.secondary }} itemSorter={(i) => keys.findIndex((k) => k.key === i.value)} />
            {keys.map((k, idx) => (
              <Bar key={k.key} dataKey={k.key} stackId="d" fill={k.color} stroke="#fff" strokeWidth={1} isAnimationActive={false} cursor="pointer"
                radius={idx === keys.length - 1 ? [4, 4, 0, 0] : 0} onClick={(e) => onSelectRange((e.payload ?? e).from, (e.payload ?? e).to)} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}
