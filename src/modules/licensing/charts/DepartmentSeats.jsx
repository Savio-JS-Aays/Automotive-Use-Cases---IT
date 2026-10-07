import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Segmented, { ToolbarSelect } from '../../../components/Segmented';
import { useRpc } from '../../../hooks/useRpc';
import { formatINR, formatNumber, formatPct } from '../../../lib/format';
import { INK, SERIES, STATUS, axisTick, tooltipStyle } from '../../../lib/chartTheme';

const LEGEND_ORDER = ['Active 30 d', 'Inactive 30–90 d', 'Dormant 90 d+'];
const isPool = (d) => /^All /.test(d.department); // company-wide pools (All Employees, All Endpoints)

/**
 * Assigned seats by department: active 30 d / inactive 30–90 d / dormant 90 d+.
 * Filters: product (refetches it_lic_department_usage with p_filters.software), seats vs share,
 * sort, top N and hiding the company-wide pools. A bar filters the reclaim list to that department.
 */
export default function DepartmentSeats({ filters, products = [], selected, onSelect }) {
  const [software, setSoftware] = useState('');
  const [mode, setMode] = useState('seats');
  const [sort, setSort] = useState('cost');
  const [top, setTop] = useState('12');
  const [hidePools, setHidePools] = useState(false);
  const { data, loading } = useRpc('it_lic_department_usage', { p_filters: { ...filters, software: software || null } });

  const { rows, totals } = useMemo(() => {
    let r = (data ?? []).map((d) => {
      const inactive = Math.max(0, d.assigned - d.active30 - d.dormant);
      return { ...d, inactive, dormantShare: d.assigned ? d.dormant / d.assigned : 0, s_active: d.active30 / d.assigned, s_inactive: inactive / d.assigned, s_dormant: d.dormant / d.assigned };
    });
    if (hidePools) r = r.filter((d) => !isPool(d));
    const t = r.reduce((s, d) => ({ assigned: s.assigned + d.assigned, dormant: s.dormant + d.dormant, cost: s.cost + Number(d.dormant_cost) }), { assigned: 0, dormant: 0, cost: 0 });
    const cmp = { cost: (a, b) => b.dormant_cost - a.dormant_cost, dormant: (a, b) => b.dormant - a.dormant, share: (a, b) => b.dormantShare - a.dormantShare, assigned: (a, b) => b.assigned - a.assigned }[sort];
    r.sort(cmp);
    return { rows: top === 'all' ? r : r.slice(0, Number(top)), totals: { ...t, departments: r.length } };
  }, [data, hidePools, sort, top]);

  const share = mode === 'share';
  const click = (e) => onSelect((e.payload ?? e).department);
  const keys = share ? ['s_active', 's_inactive', 's_dormant'] : ['active30', 'inactive', 'dormant'];
  const sorted = [...products].sort((a, b) => a.software_name.localeCompare(b.software_name));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <ToolbarSelect label="Product" value={software} onChange={setSoftware}>
          <option value="">All products</option>
          {sorted.map((p) => <option key={p.software_id} value={p.software_id}>{p.software_name}</option>)}
        </ToolbarSelect>
        <Segmented label="Show as" value={mode} onChange={setMode} options={[{ value: 'seats', label: 'Seats' }, { value: 'share', label: '% of assigned' }]} />
        <ToolbarSelect label="Sort" value={sort} onChange={setSort}>
          <option value="cost">Dormant cost</option>
          <option value="dormant">Dormant seats</option>
          <option value="share">Dormant %</option>
          <option value="assigned">Assigned seats</option>
        </ToolbarSelect>
        <ToolbarSelect label="Show" value={top} onChange={setTop}>
          <option value="12">Top 12</option>
          <option value="25">Top 25</option>
          <option value="all">All</option>
        </ToolbarSelect>
        <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
          <input type="checkbox" checked={hidePools} onChange={(e) => setHidePools(e.target.checked)} className="rounded border-slate-300 focus:ring-sky-500" />
          Hide company-wide pools
        </label>
      </div>
      <p className="mb-2 text-xs text-slate-600">
        {formatNumber(totals.departments)} departments · {formatNumber(totals.assigned)} assigned · <b className="text-slate-900">{formatNumber(totals.dormant)}</b> dormant
        ({totals.assigned ? formatPct(totals.dormant / totals.assigned, 0) : '—'}) · <b className="text-slate-900">{formatINR(totals.cost)}/yr</b> reclaimable.
        {selected ? ` Reclaim list filtered to ${selected}.` : ' Select a bar to filter the reclaim list.'}
      </p>
      {loading && !data ? <p className="h-60 text-sm text-slate-500">Loading…</p> : !rows.length ? <p className="py-6 text-center text-sm text-slate-500">No assigned seats for this selection.</p> : (
        <div style={{ height: Math.max(220, rows.length * 26 + 60) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid stroke={INK.grid} horizontal={false} />
              <XAxis type="number" domain={share ? [0, 1] : [0, 'auto']} tickFormatter={share ? (v) => `${Math.round(v * 100)}%` : formatNumber} tick={axisTick} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="department" width={150} interval={0} tickLine={false} axisLine={{ stroke: INK.axis }}
                tick={({ x, y, payload }) => (
                  <text x={x} y={y} dy={4} textAnchor="end" fontSize={12} fill={payload.value === selected ? INK.primary : INK.secondary} fontWeight={payload.value === selected ? 700 : 400}>{payload.value}</text>
                )} />
              <Tooltip {...tooltipStyle} cursor={{ fill: '#f1f5f9' }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="rounded-lg border border-black/10 bg-white px-3 py-2 text-xs shadow-sm">
                      <p className="font-semibold text-slate-700">{d.department}</p>
                      <p>{formatNumber(d.assigned)} assigned across {d.products} product{d.products === 1 ? '' : 's'}</p>
                      <p>Active 30 d: {formatNumber(d.active30)} ({formatPct(d.s_active, 0)})</p>
                      <p>Inactive 30–90 d: {formatNumber(d.inactive)} ({formatPct(d.s_inactive, 0)})</p>
                      <p className="font-semibold">Dormant 90 d+: {formatNumber(d.dormant)} ({formatPct(d.s_dormant, 0)}) · {formatINR(d.dormant_cost)}/yr</p>
                    </div>
                  );
                }} />
              <Legend wrapperStyle={{ fontSize: 12, color: INK.secondary }} itemSorter={(item) => LEGEND_ORDER.indexOf(item.value)} />
              <Bar dataKey={keys[0]} name="Active 30 d" stackId="d" fill={SERIES[0]} stroke={INK.surface} strokeWidth={1} cursor="pointer" onClick={click} isAnimationActive={false} />
              <Bar dataKey={keys[1]} name="Inactive 30–90 d" stackId="d" fill={INK.axis} stroke={INK.surface} strokeWidth={1} cursor="pointer" onClick={click} isAnimationActive={false} />
              <Bar dataKey={keys[2]} name="Dormant 90 d+" stackId="d" fill={STATUS.serious} stroke={INK.surface} strokeWidth={1} radius={[0, 4, 4, 0]} cursor="pointer" onClick={click} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
