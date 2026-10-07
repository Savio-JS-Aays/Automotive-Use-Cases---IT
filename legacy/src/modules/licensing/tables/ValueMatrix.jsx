import { CartesianGrid, LabelList, ReferenceArea, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts';
import { formatINR, formatNumber, formatPct } from '../../../lib/format';
import { INK, SERIES, axisTick } from '../../../lib/chartTheme';

function MatrixTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-lg">
      <p className="font-semibold text-slate-900">{p.software_name}</p>
      <p className="text-slate-500 mb-1">{p.vendor_name} · {p.category}</p>
      <p className="text-slate-700">Annual cost <span className="font-semibold">{formatINR(p.annual_cost)}</span></p>
      <p className="text-slate-700">Utilisation <span className="font-semibold">{formatPct(p.utilisation)}</span></p>
      <p className="text-slate-700">Seats <span className="font-semibold">{formatNumber(p.active30)} active / {formatNumber(p.purchased)}</span></p>
      <p className="text-slate-700">Shelfware <span className="font-semibold">{formatINR(p.shelfware)}</span></p>
    </div>
  );
}

/**
 * Value-for-money matrix: utilisation (x) vs annual cost (y), bubble size = purchased seats.
 * Quadrants split at the utilisation target and the median annual cost. One colour; products
 * below target are labelled directly so identity never depends on colour.
 */
export default function ValueMatrix({ data = [], target = 0.85, onSelect }) {
  const rows = data.map((d) => ({ ...d, x: Number(d.utilisation) * 100, y: Number(d.annual_cost) / 1e7 }));
  const costs = rows.map((r) => r.y).sort((a, b) => a - b);
  const median = costs.length ? costs[Math.floor(costs.length / 2)] : 0;
  const maxY = Math.max(1, ...costs) * 1.15;
  const t = target * 100;

  return (
    <div className="h-[26rem]">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 24, right: 16, left: 4, bottom: 16 }}>
          <CartesianGrid stroke={INK.grid} />
          <ReferenceArea x1={0} x2={t} y1={median} y2={maxY} fill="#d03b3b" fillOpacity={0.05} label={{ value: 'Optimise', position: 'insideTopLeft', fill: INK.secondary, fontSize: 12, fontWeight: 600 }} />
          <ReferenceArea x1={t} x2={110} y1={median} y2={maxY} fill="#0ca30c" fillOpacity={0.04} label={{ value: 'Protect', position: 'insideTopRight', fill: INK.secondary, fontSize: 12, fontWeight: 600 }} />
          <ReferenceArea x1={0} x2={t} y1={0} y2={median} fill="#fab219" fillOpacity={0.05} label={{ value: 'Review', position: 'insideBottomLeft', fill: INK.secondary, fontSize: 12, fontWeight: 600 }} />
          <ReferenceArea x1={t} x2={110} y1={0} y2={median} fillOpacity={0} label={{ value: 'Fine', position: 'insideBottomRight', fill: INK.secondary, fontSize: 12, fontWeight: 600 }} />
          <ReferenceLine x={t} stroke={INK.muted} strokeDasharray="4 4" label={{ value: `Target ${t.toFixed(0)}%`, position: 'top', fill: INK.muted, fontSize: 11 }} />
          <ReferenceLine y={median} stroke={INK.muted} strokeDasharray="4 4" />
          <XAxis type="number" dataKey="x" name="Utilisation" unit="%" domain={[0, 110]} ticks={[0, 25, 50, 75, 100]} tick={axisTick} tickLine={false} axisLine={{ stroke: INK.axis }}
            label={{ value: 'Utilisation (active 30 d ÷ purchased)', position: 'insideBottom', offset: -10, fill: INK.muted, fontSize: 11 }} />
          <YAxis type="number" dataKey="y" name="Annual cost" domain={[0, maxY]} tickFormatter={(v) => `₹${v.toFixed(0)}Cr`} tick={axisTick} tickLine={false} axisLine={false} width={56} />
          <ZAxis type="number" dataKey="purchased" range={[60, 600]} />
          <Tooltip content={<MatrixTooltip />} cursor={{ strokeDasharray: '3 3' }} />
          <Scatter
            data={rows}
            fill={SERIES[0]}
            fillOpacity={0.75}
            stroke={INK.surface}
            strokeWidth={2}
            cursor="pointer"
            onClick={(e) => onSelect?.((e.payload ?? e).software_id)}
          >
            <LabelList dataKey={(d) => (d.x < t && d.x <= 65 ? d.short_name : '')} position="right" fill={INK.secondary} fontSize={11} />
            <LabelList dataKey={(d) => (d.x < t && d.x > 65 ? d.short_name : '')} position="left" fill={INK.secondary} fontSize={11} />
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
