import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Armchair, PiggyBank, Scale, UserCheck, UserX, Users } from 'lucide-react';
import KpiCard from '../../../components/KpiCard';
import Panel from '../../../components/Panel';
import Heatmap from '../../../components/Heatmap';
import { useRpc } from '../../../hooks/useRpc';
import { formatDate, formatINR, formatMonth, formatNumber, formatPct, formatSignedPct } from '../../../lib/format';
import { downloadCsv } from '../../../lib/csv';
import { INK, SERIES, STATUS, axisTick, tooltipStyle } from '../../../lib/chartTheme';
import SeatFunnel from '../charts/SeatFunnel';
import UtilisationTrend from '../charts/UtilisationTrend';
import ReclaimTable from '../tables/ReclaimTable';
import { UTIL_BUCKETS, utilColor } from '../constants';
import { useLicensing } from '../LicensingContext';

/** Usage & Optimisation: who uses what, where seats are wasted, and what to cut or true-up at renewal. */
export default function UsagePage() {
  const { filters, kpis, meta, open, params, patch } = useLicensing();
  const dept = params.get('dept');
  const portfolio = useRpc('it_lic_portfolio', { p_filters: filters });
  const trend = useRpc('it_lic_util_trend', { p_filters: filters });
  const matrix = useRpc('it_lic_usage_matrix', { p_filters: filters });
  const depts = useRpc('it_lic_department_usage', { p_filters: filters });
  const optimisation = useRpc('it_lic_optimisation', { p_filters: filters });
  const reclaim = useRpc('it_lic_reclaim', { p_filters: { ...filters, department: dept }, p_limit: 200 });

  const k = kpis.data ?? {};
  const rows = portfolio.data ?? [];
  const show = (v, fmt) => (kpis.loading && !kpis.data ? '…' : v === null || v === undefined ? '—' : fmt(v));
  const active90 = rows.reduce((s, r) => s + r.active90, 0);
  const unassigned = rows.reduce((s, r) => s + Math.max(0, r.purchased - r.assigned), 0);
  const dormant = (depts.data ?? []).reduce((s, d) => s + d.dormant, 0);
  const utilDelta = k.utilisation != null && k.utilisation_prev != null ? k.utilisation - k.utilisation_prev : null;

  const heat = useMemo(() => {
    const cells = matrix.data?.by_month ?? [];
    const months = [...new Set(cells.map((c) => c.month))].sort();
    const last = months[months.length - 1];
    const byKey = new Map(cells.map((c) => [`${c.software_id}|${c.month}`, c]));
    const products = [...new Map(cells.map((c) => [c.software_id, c.short_name])).entries()]
      .map(([id, name]) => ({ key: id, label: name, util: byKey.get(`${id}|${last}`)?.util ?? 1 }))
      .sort((a, b) => a.util - b.util);
    const regionCells = matrix.data?.by_region ?? [];
    const regions = [...new Map(regionCells.map((c) => [c.region_id, c.region_name])).entries()].map(([key, label]) => ({ key, label }));
    const byRegion = new Map(regionCells.map((c) => [`${c.software_id}|${c.region_id}`, c]));
    return {
      products, byKey, byRegion, regions,
      months: months.map((m) => ({ key: m, label: formatMonth(m) })),
    };
  }, [matrix.data]);

  const deptRows = (depts.data ?? []).map((d) => ({ ...d, inactive: Math.max(0, d.assigned - d.active30 - d.dormant) })).sort((a, b) => b.dormant_cost - a.dormant_cost).slice(0, 12);
  const legend = UTIL_BUCKETS.map((b) => ({ label: b.label, color: b.color }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard title="Licence Utilisation" value={show(k.utilisation, (v) => formatPct(v))} icon={<UserCheck size={20} />}
          delta={utilDelta != null ? `${formatSignedPct(utilDelta, 1, ' pts')} vs 3 months ago` : null} deltaTone={utilDelta > 0 ? 'good' : utilDelta < 0 ? 'bad' : 'neutral'}
          sub={`target ${formatPct(meta.target, 0)}`} tooltip="Seats active in the last 30 days ÷ seats purchased." />
        <KpiCard title="Active Users (30 d)" value={show(k.active30, formatNumber)} icon={<Users size={20} />}
          sub={`of ${formatNumber(k.purchased)} purchased · ${formatNumber(k.assigned)} assigned`} tooltip="Seats with a login in the last 30 days." />
        <KpiCard title="Dormant Seats" value={depts.data ? formatNumber(dormant) : '…'} icon={<UserX size={20} />}
          sub={`${formatINR(k.shelf_dormant)}/yr reclaimable`} tooltip="Assigned seats with no login for 90+ days, or never used." />
        <KpiCard title="Unassigned Seats" value={portfolio.data ? formatNumber(unassigned) : '…'} icon={<Armchair size={20} />}
          sub={`${formatINR(k.shelf_unassigned)}/yr`} tooltip="Purchased seats not assigned to anyone." />
        <KpiCard title="Reclaimable Now" value={show(k.shelf_dormant, formatINR)} icon={<PiggyBank size={20} />}
          sub="harvest dormant seats before buying more" tooltip="Annual cost of dormant seats (reassign instead of buying)." />
        <KpiCard title="Saving at Renewal" value={optimisation.data ? formatINR(optimisation.data.reduce((s, o) => s + Number(o.annual_saving), 0)) : '…'} icon={<PiggyBank size={20} />}
          sub="reduce to 110% of 90-day active users" tooltip="Σ (purchased − ceil(active 90 d × 1.1)) × unit price × 12, per edition, realisable at each contract's renewal." />
        <KpiCard title="True-up Risk" value={show(k.trueup, formatINR)} icon={<Scale size={20} />}
          sub={k.trueup_products ? `${k.trueup_products} product over-deployed` : 'none'} tooltip="Seats assigned beyond entitlement × unit price × 12." />
        <KpiCard title="Cost per Active User" value={show(k.cost_per_active_user, (v) => `${formatINR(v)}/mo`)} icon={<Users size={20} />}
          tooltip="Monthly licence cost ÷ seats active in the last 30 days." />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Panel title="Seat funnel" tooltip="Purchased → assigned → active in 90 days → active in 30 days.">
          <SeatFunnel purchased={k.purchased} assigned={k.assigned} active90={active90} active30={k.active30} shelfUnassigned={k.shelf_unassigned} shelfDormant={k.shelf_dormant} />
        </Panel>
        <Panel title="Utilisation trend" className="xl:col-span-2" tooltip="Portfolio utilisation by month and up to two products (defaults to the two least utilised).">
          <UtilisationTrend trend={trend.data ?? []} portfolio={rows} target={meta.target} />
        </Panel>
      </div>

      <Panel title="Utilisation by product and month" tooltip="Active-30-day ÷ purchased seats for every product and month, least utilised first. Neutral = at or above the 85% target. Select a cell to open the product.">
        {heat.products.length ? (
          <Heatmap rows={heat.products} cols={heat.months} rowLabelWidth={100}
            value={(r, c) => heat.byKey.get(`${r}|${c}`)?.util ?? null}
            colorFor={utilColor}
            titleFor={(r, c, v) => { const x = heat.byKey.get(`${r.key}|${c.key}`); return `${r.label} · ${c.label}: ${v == null ? 'no data' : `${formatPct(v)} (${formatNumber(x.active30)} of ${formatNumber(x.purchased)})`}`; }}
            onCell={(r) => open.product(r.key, 'Usage')} legend={legend} />
        ) : <p className="text-sm text-slate-500">Loading…</p>}
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Panel title="Utilisation by product and region · latest month" tooltip="Where each product's seats are used. Select a cell to open the product.">
          {heat.regions.length ? (
            <Heatmap rows={heat.products} cols={heat.regions} rowLabelWidth={100} minWidth={380}
              value={(r, c) => heat.byRegion.get(`${r}|${c}`)?.util ?? null}
              colorFor={utilColor}
              titleFor={(r, c, v) => { const x = heat.byRegion.get(`${r.key}|${c.key}`); return `${r.label} · ${c.label}: ${v == null ? 'no seats' : `${formatPct(v)} (${formatNumber(x.active30)} of ${formatNumber(x.purchased)})`}`; }}
              onCell={(r) => open.product(r.key, 'Usage')} legend={legend} />
          ) : <p className="text-sm text-slate-500">Loading…</p>}
        </Panel>
        <Panel title="Seats by department" tooltip="Assigned seats by department: active in 30 days, inactive 30–90 days, dormant 90+ days. Select a department to filter the reclaim list.">
          <div style={{ height: Math.max(240, deptRows.length * 26 + 60) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={deptRows} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid stroke={INK.grid} horizontal={false} />
                <XAxis type="number" tick={axisTick} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="department" width={150} tick={{ fontSize: 12, fill: INK.secondary }} tickLine={false} axisLine={{ stroke: INK.axis }} />
                <Tooltip {...tooltipStyle} cursor={{ fill: '#f1f5f9' }} formatter={(v, n, p) => [n === 'Dormant 90 d+' ? `${formatNumber(v)} (${formatINR(p.payload.dormant_cost)}/yr)` : formatNumber(v), n]} />
                <Legend wrapperStyle={{ fontSize: 12, color: INK.secondary }} />
                <Bar dataKey="active30" name="Active 30 d" stackId="d" fill={SERIES[0]} stroke={INK.surface} strokeWidth={1} cursor="pointer" onClick={(e) => patch({ dept: (e.payload ?? e).department })} />
                <Bar dataKey="inactive" name="Inactive 30–90 d" stackId="d" fill={INK.axis} stroke={INK.surface} strokeWidth={1} cursor="pointer" onClick={(e) => patch({ dept: (e.payload ?? e).department })} />
                <Bar dataKey="dormant" name="Dormant 90 d+" stackId="d" fill={STATUS.serious} stroke={INK.surface} strokeWidth={1} radius={[0, 4, 4, 0]} cursor="pointer" onClick={(e) => patch({ dept: (e.payload ?? e).department })} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel title="Optimisation opportunities" flush
        actions={<button type="button" disabled={!optimisation.data?.length} onClick={() => downloadCsv('optimisation.csv', optimisation.data, [
          { key: 'software_name', label: 'Product' }, { key: 'edition', label: 'Edition' }, { key: 'purchased', label: 'Purchased' }, { key: 'assigned', label: 'Assigned' },
          { key: 'active90', label: 'Active 90d' }, { key: 'recommended', label: 'Recommended' }, { key: 'reduction', label: 'Reduce by' },
          { key: 'annual_saving', label: 'Saving (INR/yr)' }, { key: 'trueup_cost', label: 'True-up (INR/yr)' }, { key: 'end_date', label: 'Renewal' }, { key: 'action', label: 'Action' }])}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-sky-500">Export CSV</button>}
        tooltip="Per edition: recommended seats = 110% of users active in 90 days. Reduce at renewal, or true-up where assigned exceeds purchased.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-slate-600">
            <thead className="text-xs uppercase bg-slate-50 text-slate-500 border-b border-slate-200"><tr>
              {['Product / edition', 'Purchased', 'Assigned', 'Active 90 d', 'Recommended', 'Reduce by', 'Saving / yr', 'True-up / yr', 'Renewal', 'Action'].map((h, i) => (
                <th key={h} scope="col" className={`px-4 py-2.5 font-semibold whitespace-nowrap ${i > 0 && i < 8 ? 'text-right' : ''}`}>{h}</th>))}
            </tr></thead>
            <tbody className="tabular-nums whitespace-nowrap">
              {(optimisation.data ?? []).map((o) => (
                <tr key={`${o.software_id}-${o.edition}`} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2.5"><button type="button" onClick={() => open.product(o.software_id, 'Usage')} className="text-left font-medium text-slate-900 hover:text-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 rounded">{o.software_name}</button><span className="block text-xs text-slate-500">{o.edition}</span></td>
                  <td className="px-4 py-2.5 text-right">{formatNumber(o.purchased)}</td>
                  <td className={`px-4 py-2.5 text-right ${o.assigned > o.purchased ? 'text-red-700 font-semibold' : ''}`}>{formatNumber(o.assigned)}</td>
                  <td className="px-4 py-2.5 text-right">{formatNumber(o.active90)}</td>
                  <td className="px-4 py-2.5 text-right">{formatNumber(o.recommended)}</td>
                  <td className="px-4 py-2.5 text-right">{o.reduction ? formatNumber(o.reduction) : '—'}</td>
                  <td className={`px-4 py-2.5 text-right ${o.annual_saving > 0 ? 'text-green-800 font-semibold' : ''}`}>{o.annual_saving > 0 ? formatINR(o.annual_saving) : '—'}</td>
                  <td className={`px-4 py-2.5 text-right ${o.trueup_cost > 0 ? 'text-red-700 font-semibold' : ''}`}>{o.trueup_cost > 0 ? formatINR(o.trueup_cost) : '—'}</td>
                  <td className="px-4 py-2.5">{formatDate(o.end_date)}<span className="block text-xs text-slate-500">notice {formatDate(o.notice_deadline)}</span></td>
                  <td className="px-4 py-2.5">{o.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title={`Reclaim candidates${dept ? ` · ${dept}` : ''}`} flush
        actions={dept && <button type="button" onClick={() => patch({ dept: null })} className="text-xs font-medium text-sky-700 hover:underline focus:outline-none focus:ring-2 focus:ring-sky-500 rounded">All departments</button>}
        tooltip="Assigned seats with no login for 90+ days (or never used), most expensive first.">
        <ReclaimTable data={reclaim.data} loading={reclaim.loading} />
      </Panel>
    </div>
  );
}
