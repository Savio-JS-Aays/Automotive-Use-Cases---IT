import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatINR, formatINRAxis, formatSignedPct } from '../../../lib/format';
import { INK, SERIES, axisTick, tooltipStyle } from '../../../lib/chartTheme';

/**
 * FY-to-date actual vs budget by business vertical (grouped horizontal bars, one INR axis).
 * The variance is written next to each vertical; clicking a vertical filters the page to it.
 */
export default function SpendByVertical({ portfolio = [], onSelect }) {
  const map = new Map();
  for (const p of portfolio) {
    const r = map.get(p.business_vertical) || { vertical: p.business_vertical, actual: 0, budget: 0 };
    r.actual += Number(p.ytd_actual || 0);
    r.budget += Number(p.ytd_budget || 0);
    map.set(p.business_vertical, r);
  }
  const rows = [...map.values()]
    .map((r) => ({ ...r, variance: r.budget ? r.actual / r.budget - 1 : 0 }))
    .sort((a, b) => b.actual - a.actual);

  return (
    <div style={{ height: Math.max(220, rows.length * 44 + 60) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }} barGap={2}>
          <CartesianGrid stroke={INK.grid} horizontal={false} />
          <XAxis type="number" tickFormatter={formatINRAxis} tick={axisTick} tickLine={false} axisLine={false} />
          <YAxis
            type="category"
            dataKey="vertical"
            width={200}
            tickLine={false}
            axisLine={{ stroke: INK.axis }}
            tick={({ x, y, payload }) => {
              const r = rows.find((d) => d.vertical === payload.value);
              const over = r && r.variance > 0;
              return (
                <text x={x - 6} y={y} dy={4} textAnchor="end" fontSize={12} fill={INK.secondary}>
                  {r?.vertical}
                  <tspan fill={over ? '#b42318' : INK.muted} fontWeight={over ? 700 : 400}> {formatSignedPct(r?.variance)}{over ? ' over' : ''}</tspan>
                </text>
              );
            }}
          />
          <Tooltip formatter={(v, name) => [formatINR(v), name]} {...tooltipStyle} cursor={{ fill: '#f1f5f9' }} />
          <Legend wrapperStyle={{ fontSize: 12, color: INK.secondary }} />
          <Bar dataKey="actual" name="Actual (FY to date)" fill={SERIES[0]} radius={[0, 4, 4, 0]} maxBarSize={14} cursor="pointer" onClick={(e) => onSelect?.((e.payload ?? e).vertical)} />
          <Bar dataKey="budget" name="Budget (FY to date)" fill={INK.axis} radius={[0, 4, 4, 0]} maxBarSize={14} cursor="pointer" onClick={(e) => onSelect?.((e.payload ?? e).vertical)} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
