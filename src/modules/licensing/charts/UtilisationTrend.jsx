import { useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Segmented from '../../../components/Segmented';
import { formatMonth, formatPct } from '../../../lib/format';
import { INK, SERIES, axisTick, gridProps, tooltipStyle } from '../../../lib/chartTheme';

const MAX = 3;

/**
 * Utilisation (active 30 d ÷ purchased) by month: the filtered portfolio plus up to three products picked from chips.
 * Each pick keeps its colour slot (SERIES[1..3]) while it stays picked; the portfolio line is always SERIES[0].
 * Default: the two least-utilised products. Products excluded by the sidebar filters drop out automatically.
 */
export default function UtilisationTrend({ trend = [], portfolio = [], target = 0.85 }) {
  const lowest = useMemo(() => [...portfolio].sort((a, b) => a.utilisation - b.utilisation).slice(0, 2)
    .map((p, i) => ({ id: p.software_id, slot: i })), [portfolio]);
  const [picked, setPicked] = useState(null); // null = default (two least utilised)
  const [range, setRange] = useState('12');
  const inScope = new Set(portfolio.map((p) => p.software_id));
  const current = (picked ?? lowest).filter((p) => inScope.has(p.id));
  const name = (id) => portfolio.find((p) => p.software_id === id)?.short_name || portfolio.find((p) => p.software_id === id)?.software_name || id;

  const toggle = (id) => {
    if (current.some((p) => p.id === id)) return setPicked(current.filter((p) => p.id !== id));
    if (current.length >= MAX) return undefined;
    const used = new Set(current.map((p) => p.slot));
    return setPicked([...current, { id, slot: [0, 1, 2].find((x) => !used.has(x)) }]);
  };

  const rows = (() => {
    const ids = current.map((p) => p.id);
    const byMonth = new Map();
    for (const r of trend) {
      if (!inScope.has(r.software_id)) continue;
      const m = byMonth.get(r.month) || { month: r.month, label: formatMonth(r.month), purchased: 0, active30: 0 };
      m.purchased += r.purchased; m.active30 += r.active30;
      if (ids.includes(r.software_id)) m[r.software_id] = r.purchased ? r.active30 / r.purchased : null;
      byMonth.set(r.month, m);
    }
    const all = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)).map((m) => ({ ...m, portfolio: m.purchased ? m.active30 / m.purchased : null }));
    return range === 'all' ? all : all.slice(-Number(range));
  })();
  const sorted = [...portfolio].sort((a, b) => a.utilisation - b.utilisation);
  const chip = 'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40';

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Segmented label="Months" value={range} onChange={setRange} options={[{ value: '6', label: '6 m' }, { value: '12', label: '12 m' }, { value: 'all', label: 'All' }]} />
        {picked && <button type="button" onClick={() => setPicked(null)} className="text-xs font-medium text-blue-700 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded">Reset to least utilised</button>}
        <span className="text-[11px] text-slate-400">compare up to {MAX} products · least utilised first</span>
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Products to compare">
        {sorted.map((p) => {
          const pk = current.find((x) => x.id === p.software_id);
          const full = !pk && current.length >= MAX;
          return (
            <button key={p.software_id} type="button" aria-pressed={Boolean(pk)} disabled={full} onClick={() => toggle(p.software_id)}
              title={full ? `Compare up to ${MAX} products` : `${p.software_name}: ${formatPct(p.utilisation, 0)} utilised`}
              className={`${chip} ${pk ? 'border-slate-500 bg-white text-slate-900' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-400'}`}>
              {pk && <span className="h-2.5 w-2.5 rounded-full" style={{ background: SERIES[pk.slot + 1] }} aria-hidden="true" />}
              {p.short_name || p.software_name} <span className="text-slate-400">{formatPct(p.utilisation, 0)}</span>
            </button>
          );
        })}
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
            <Line dataKey="portfolio" name={portfolio.length === 1 ? 'Selection' : 'Portfolio (filtered)'} stroke={SERIES[0]} strokeWidth={2.5} dot={false} isAnimationActive={false} />
            {current.map((p) => (
              <Line key={p.id} dataKey={p.id} name={name(p.id)} stroke={SERIES[p.slot + 1]} strokeWidth={2} dot={false} isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
