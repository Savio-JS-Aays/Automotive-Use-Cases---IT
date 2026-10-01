import { useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatMonth, formatPct } from '../../../lib/format';
import { INK, SERIES, axisTick, gridProps, tooltipStyle } from '../../../lib/chartTheme';

/**
 * Utilisation (active 30 d ÷ purchased) by month: the filtered portfolio plus up to two compared products.
 * Colours follow the entity: portfolio = slot 1, compare A = slot 2, compare B = slot 3.
 */
export default function UtilisationTrend({ trend = [], portfolio = [], target = 0.85 }) {
  const lowest = useMemo(() => [...portfolio].sort((a, b) => a.utilisation - b.utilisation).slice(0, 2).map((p) => p.software_id), [portfolio]);
  const [picked, setPicked] = useState(null); // null = default to the two lowest
  const compare = (picked ?? lowest).filter((id) => portfolio.some((p) => p.software_id === id));
  const name = (id) => portfolio.find((p) => p.software_id === id)?.software_name ?? id;

  const rows = useMemo(() => {
    const byMonth = new Map();
    for (const r of trend) {
      const m = byMonth.get(r.month) || { month: r.month, label: formatMonth(r.month), purchased: 0, active30: 0 };
      m.purchased += r.purchased;
      m.active30 += r.active30;
      if (compare.includes(r.software_id)) m[r.software_id] = r.purchased ? r.active30 / r.purchased : null;
      byMonth.set(r.month, m);
    }
    return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)).map((m) => ({ ...m, portfolio: m.purchased ? m.active30 / m.purchased : null }));
  }, [trend, compare]);

  const setSlot = (i, id) => {
    const next = [...compare];
    next[i] = id;
    setPicked(next.filter(Boolean));
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {[0, 1].map((i) => (
          <label key={i} className="flex items-center gap-2 text-xs text-slate-600">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: SERIES[i + 1] }} aria-hidden="true" />
            <span className="sr-only">Compare product {i + 1}</span>
            <select
              value={compare[i] ?? ''}
              onChange={(e) => setSlot(i, e.target.value)}
              className="rounded-md border border-slate-300 bg-white py-1 px-2 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              <option value="">None</option>
              {portfolio.map((p) => <option key={p.software_id} value={p.software_id}>{p.software_name}</option>)}
            </select>
          </label>
        ))}
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
            <Line dataKey="portfolio" name="Portfolio" stroke={SERIES[0]} strokeWidth={2} dot={false} />
            {compare.map((id, i) => (
              <Line key={id} dataKey={id} name={name(id)} stroke={SERIES[i + 1]} strokeWidth={2} dot={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
