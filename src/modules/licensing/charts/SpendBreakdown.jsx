import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Segmented, { ToolbarSelect } from '../../../components/Segmented';
import { formatINR, formatINRAxis, formatPct, formatSignedPct } from '../../../lib/format';
import { INK, SERIES, axisTick, tooltipStyle } from '../../../lib/chartTheme';

const DIMS = [
  { value: 'vendor', label: 'Vendor' },
  { value: 'vertical', label: 'Vertical' },
  { value: 'category', label: 'Category' },
  { value: 'product', label: 'Product' },
  { value: 'region', label: 'Region' },
];
const CLICK_HINT = {
  vendor: 'Select a vendor to open it.', vertical: 'Select a vertical to filter the suite.', category: 'Select a category to filter the suite.',
  product: 'Select a product to open it.', region: 'Select a region to set the Region filter.',
};

/**
 * One spend chart for every breakdown: actual vs budget per vendor / vertical / category / product / region,
 * FY to date or full-year forecast, top N with the rest folded into "Other". Variance on the right axis.
 * Products, vendors, verticals and categories aggregate it_lic_budget_variance; regions come from it_lic_spend_breakdown.
 */
export default function SpendBreakdown({ variance = [], byRegion = [], byVendor = [], onSelect }) {
  const [dim, setDim] = useState('vendor');
  const [measure, setMeasure] = useState('ytd');
  const [top, setTop] = useState('8');
  const [sort, setSort] = useState('spend');
  const [overOnly, setOverOnly] = useState(false);
  const m = dim === 'region' ? 'ytd' : measure; // regional forecast is not modelled

  const { rows, total } = useMemo(() => {
    const vendorId = new Map(byVendor.map((v) => [v.vendor_name, v.vendor_id]));
    let items;
    if (dim === 'region') {
      items = byRegion.map((r) => ({ id: r.region_id, label: r.region_name, actual: Number(r.actual), budget: Number(r.budget) }));
    } else {
      const keyOf = { vendor: (r) => r.vendor_name, vertical: (r) => r.business_vertical, category: (r) => r.category, product: (r) => r.software_id }[dim];
      const map = new Map();
      for (const r of variance) {
        const k = keyOf(r);
        const x = map.get(k) || {
          id: dim === 'vendor' ? vendorId.get(r.vendor_name) : dim === 'product' ? r.software_id : k,
          label: dim === 'product' ? r.short_name || r.software_name : k, actual: 0, budget: 0, count: 0,
        };
        x.actual += Number((m === 'ytd' ? r.ytd_actual : r.forecast) || 0);
        x.budget += Number((m === 'ytd' ? r.ytd_budget : r.fy_budget) || 0);
        x.count += 1;
        map.set(k, x);
      }
      items = [...map.values()];
    }
    const sum = items.reduce((s, x) => ({ actual: s.actual + x.actual, budget: s.budget + x.budget }), { actual: 0, budget: 0 });
    items = items.map((x) => ({ ...x, variance: x.budget ? x.actual / x.budget - 1 : 0, share: sum.actual ? x.actual / sum.actual : 0 }));
    if (overOnly) items = items.filter((x) => x.variance > 0);
    items.sort(sort === 'spend' ? (a, b) => b.actual - a.actual : sort === 'variance' ? (a, b) => b.variance - a.variance : (a, b) => a.label.localeCompare(b.label));
    const n = top === 'all' ? items.length : Number(top);
    if (items.length > n + 1) {
      const rest = items.slice(n);
      const o = rest.reduce((s, x) => ({ actual: s.actual + x.actual, budget: s.budget + x.budget }), { actual: 0, budget: 0 });
      items = [...items.slice(0, n), { id: null, label: `Other (${rest.length})`, ...o, variance: o.budget ? o.actual / o.budget - 1 : 0, share: sum.actual ? o.actual / sum.actual : 0, other: true }];
    }
    return { rows: items.map((x) => ({ ...x, varLabel: `${formatSignedPct(x.variance)}${x.variance > 0 ? ' over' : ''}` })), total: { ...sum, over: items.filter((x) => !x.other && x.variance > 0).length } };
  }, [dim, m, top, sort, overOnly, variance, byRegion, byVendor]);

  const actualName = m === 'ytd' ? 'Actual (FY to date)' : 'Forecast (full FY)';
  const budgetName = m === 'ytd' ? 'Budget (FY to date)' : 'FY budget';
  const select = (e) => { const r = e.payload ?? e; if (!r.other && r.id) onSelect?.(dim, r.id); };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented label="Break down by" options={DIMS} value={dim} onChange={setDim} />
        <Segmented label="Measure" value={m} onChange={setMeasure} options={[
          { value: 'ytd', label: 'FY to date' },
          { value: 'forecast', label: 'Full-year forecast', disabled: dim === 'region', title: dim === 'region' ? 'Forecast is not split by region' : undefined },
        ]} />
        <ToolbarSelect label="Sort" value={sort} onChange={setSort}>
          <option value="spend">Highest spend</option>
          <option value="variance">Most over budget</option>
          <option value="name">Name</option>
        </ToolbarSelect>
        <ToolbarSelect label="Show" value={top} onChange={setTop}>
          <option value="5">Top 5</option>
          <option value="8">Top 8</option>
          <option value="all">All</option>
        </ToolbarSelect>
        <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
          <input type="checkbox" checked={overOnly} onChange={(e) => setOverOnly(e.target.checked)} className="rounded border-slate-300 focus:ring-sky-500" />
          Over budget only
        </label>
      </div>
      <p className="mb-2 text-xs text-slate-600">
        {actualName}: <b className="text-slate-900">{formatINR(total.actual)}</b> vs {budgetName.toLowerCase()} {formatINR(total.budget)}
        {' · '}<b className="text-slate-900">{total.budget ? formatSignedPct(total.actual / total.budget - 1) : '—'}</b>
        {' · '}{total.over} over budget{overOnly ? ' (shown)' : ''}. {CLICK_HINT[dim]}
      </p>
      {!rows.length ? <p className="py-8 text-center text-sm text-slate-500">Nothing over budget for this breakdown.</p> : (
        <div style={{ height: Math.max(200, rows.length * 40 + 60) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 0 }} barGap={2} barCategoryGap={8}>
              <CartesianGrid stroke={INK.grid} horizontal={false} />
              <XAxis type="number" tickFormatter={formatINRAxis} tick={axisTick} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="label" width={dim === 'vertical' ? 170 : 130} tick={{ fontSize: 12, fill: INK.secondary }} tickLine={false} axisLine={{ stroke: INK.axis }} interval={0} />
              <YAxis yAxisId="var" orientation="right" type="category" dataKey="varLabel" width={86} tickLine={false} axisLine={false} interval={0}
                tick={({ x, y, payload }) => (
                  <text x={x} y={y} dy={4} fontSize={11} fill={payload.value.endsWith('over') ? '#b42318' : INK.muted} fontWeight={payload.value.endsWith('over') ? 700 : 400}>{payload.value}</text>
                )} />
              <Tooltip {...tooltipStyle} cursor={{ fill: '#f1f5f9' }}
                formatter={(v, n, p) => [n === actualName ? `${formatINR(v)} · ${formatPct(p.payload.share)} of total` : formatINR(v), n]} />
              <Legend wrapperStyle={{ fontSize: 12, color: INK.secondary }} />
              <Bar dataKey="actual" name={actualName} fill={SERIES[0]} radius={[0, 4, 4, 0]} maxBarSize={14} isAnimationActive={false} cursor="pointer" onClick={select} />
              <Bar dataKey="budget" name={budgetName} fill={INK.axis} radius={[0, 4, 4, 0]} maxBarSize={14} isAnimationActive={false} cursor="pointer" onClick={select} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
