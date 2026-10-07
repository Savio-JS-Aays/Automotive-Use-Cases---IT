import { useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Segmented from '../../../components/Segmented';
import { formatMonth, formatPct } from '../../../lib/format';
import { INK, SERIES, axisTick, gridProps, tooltipStyle } from '../../../lib/chartTheme';

const SLOTS = [0, 1];

/**
 * Utilisation (active 30 d ÷ purchased) by month: the filtered portfolio plus up to two compared products.
 * Each selector owns a fixed slot and colour (portfolio = SERIES[0], A = SERIES[1], B = SERIES[2]), so clearing
 * one never moves the other. Picks that the page filters exclude fall back to "None" for that slot only.
 */
export default function UtilisationTrend({ trend = [], portfolio = [], target = 0.85 }) {
  const lowest = useMemo(() => [...portfolio].sort((a, b) => a.utilisation - b.utilisation).slice(0, 2).map((p) => p.software_id), [portfolio]);
  const [picked, setPicked] = useState(null); // null = the two least utilised; otherwise [slotA, slotB]
  const [range, setRange] = useState('12');
  const inScope = useMemo(() => new Set(portfolio.map((p) => p.software_id)), [portfolio]);
  const base = picked ?? lowest;
  const compare = SLOTS.map((i) => (base[i] && inScope.has(base[i]) ? base[i] : null));
  const name = (id) => portfolio.find((p) => p.software_id === id)?.software_name ?? id;

  const rows = (() => {
    const ids = compare.filter(Boolean);
    const byMonth = new Map();
    for (const r of trend) {
      if (!inScope.has(r.software_id)) continue;
      const m = byMonth.get(r.month) || { month: r.month, label: formatMonth(r.month), purchased: 0, active30: 0 };
      m.purchased += r.purchased;
      m.active30 += r.active30;
      if (ids.includes(r.software_id)) m[r.software_id] = r.purchased ? r.active30 / r.purchased : null;
      byMonth.set(r.month, m);
    }
    const all = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)).map((m) => ({ ...m, portfolio: m.purchased ? m.active30 / m.purchased : null }));
    return range === 'all' ? all : all.slice(-Number(range));
  })();

  const setSlot = (i, id) => {
    const next = [...compare];
    next[i] = id || null;
    setPicked(next);
  };
  const sorted = [...portfolio].sort((a, b) => a.software_name.localeCompare(b.software_name));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {SLOTS.map((i) => (
          <label key={i} className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: SERIES[i + 1] }} aria-hidden="true" />
            <span className="sr-only">Compare product {i + 1}</span>
            <select value={compare[i] ?? ''} onChange={(e) => setSlot(i, e.target.value)}
              className="max-w-48 rounded-md border border-slate-300 bg-white py-1 px-2 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500">
              <option value="">None</option>
              {sorted.map((p) => (
                <option key={p.software_id} value={p.software_id} disabled={compare[1 - i] === p.software_id}>
                  {p.software_name} ({formatPct(p.utilisation, 0)})
                </option>
              ))}
            </select>
          </label>
        ))}
        {picked && (
          <button type="button" onClick={() => setPicked(null)} className="text-xs font-medium text-sky-700 hover:underline focus:outline-none focus:ring-2 focus:ring-sky-500 rounded">
            Least utilised
          </button>
        )}
        <span className="ml-auto">
          <Segmented label="Months" value={range} onChange={setRange} options={[{ value: '6', label: '6 m' }, { value: '12', label: '12 m' }, { value: 'all', label: 'All' }]} />
        </span>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: INK.axis }} interval="preserveStartEnd" />
            <YAxis domain={[0, 1.2]} ticks={[0, 0.25, 0.5, 0.75, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} tick={axisTick} tickLine={false} axisLine={false} width={44} />
            <Tooltip formatter={(v, n) => [formatPct(v), n]} {...tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 12, color: INK.secondary }} />
            <ReferenceLine y={target} stroke={INK.muted} strokeDasharray="4 4" label={{ value: `Target ${Math.round(target * 100)}%`, position: 'insideTopRight', fill: INK.muted, fontSize: 11 }} />
            <Line dataKey="portfolio" name={portfolio.length === 1 ? 'Selection' : 'Portfolio (filtered)'} stroke={SERIES[0]} strokeWidth={2} dot={false} isAnimationActive={false} />
            {SLOTS.map((i) => compare[i] && (
              <Line key={`slot-${i}`} dataKey={compare[i]} name={name(compare[i])} stroke={SERIES[i + 1]} strokeWidth={2} dot={false} isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
