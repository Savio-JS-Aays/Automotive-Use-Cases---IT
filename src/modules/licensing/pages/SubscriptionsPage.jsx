import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { X } from 'lucide-react';
import KpiCard from '../../../components/KpiCard';
import Panel from '../../../components/Panel';
import Segmented from '../../../components/Segmented';
import { useRpc } from '../../../hooks/useRpc';
import { formatINR, formatINRAxis, formatNumber, formatPct, formatSignedPct } from '../../../lib/format';
import { INK, SERIES, STATUS, axisTick, tooltipStyle } from '../../../lib/chartTheme';
import SubscriptionsTable from '../tables/SubscriptionsTable';
import { useLicensing } from '../LicensingContext';

const inputCls = 'rounded-md border border-slate-200 bg-white py-1.5 px-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500';
const ACTIONS = [
  { key: 'Renew', color: STATUS.good, says: 'well used (≥ target) — renew as is' },
  { key: 'Review', color: STATUS.warning, says: 'partly used (60% – target) — renegotiate' },
  { key: 'Right-size', color: STATUS.serious, says: 'under 60% used — cut seats at renewal' },
  { key: 'True-up', color: STATUS.critical, says: 'more users than licences — buy more' },
];
const EMPTY = { q: '', action: '', budget: '', util: '', renewal: '', auto: '', docs: '', deployment: '' };
const utilBand = (u, t) => (u < 0.6 ? 'low' : u < t ? 'mid' : 'ok');
const BAND = { ok: { color: SERIES[0], label: 'at or above target' }, mid: { color: STATUS.warning, label: '60% to target' }, low: { color: STATUS.critical, label: 'under 60%' } };

/**
 * Subscriptions: one row per product combining contract, spend & budget, usage & savings and renewal data.
 * Every Licensing tab's per-product detail lives here; the sidebar (Vertical / Vendor / Category / Region) and the
 * filters below narrow it, and the KPI cards and charts are recomputed from the rows that remain.
 */
export default function SubscriptionsPage() {
  const { filters, meta, open, patch } = useLicensing();
  const portfolio = useRpc('it_lic_portfolio', { p_filters: filters });
  const variance = useRpc('it_lic_budget_variance', { p_filters: filters });
  const optim = useRpc('it_lic_optimisation', { p_filters: filters });
  const renewals = useRpc('it_lic_renewals', { p_filters: filters, p_months: 60 });
  const [f, setF] = useState(EMPTY);
  const [view, setView] = useState('overview');
  const [measure, setMeasure] = useState('annual_cost');
  const [group, setGroup] = useState('product');
  const target = meta.target;

  // One row per product: portfolio + budget variance + optimisation (summed over editions) + renewal quote
  const all = useMemo(() => {
    const v = new Map((variance.data ?? []).map((x) => [x.software_id, x]));
    const r = new Map((renewals.data ?? []).map((x) => [x.software_id, x]));
    const o = new Map();
    for (const x of optim.data ?? []) {
      const a = o.get(x.software_id) || { reduction: 0, annual_saving: 0 };
      a.reduction += Number(x.reduction || 0); a.annual_saving += Number(x.annual_saving || 0);
      o.set(x.software_id, a);
    }
    return (portfolio.data ?? []).map((p) => ({
      ...p,
      fy_budget: v.get(p.software_id)?.fy_budget ?? p.fy_budget,
      forecast: v.get(p.software_id)?.forecast ?? null,
      forecast_variance: v.get(p.software_id)?.forecast_variance ?? null,
      ytd_variance: v.get(p.software_id)?.ytd_variance ?? null,
      yoy: v.get(p.software_id)?.yoy ?? null,
      reduction: o.get(p.software_id)?.reduction ?? 0,
      annual_saving: o.get(p.software_id)?.annual_saving ?? 0,
      uplift_exposure: r.get(p.software_id)?.uplift_exposure ?? null,
      renewal_quote_inr: r.get(p.software_id)?.renewal_quote_inr ?? null,
      quote_file_url: r.get(p.software_id)?.quote_file_url ?? null,
    }));
  }, [portfolio.data, variance.data, optim.data, renewals.data]);

  const s = f.q.trim().toLowerCase();
  const rows = all.filter((r) => (!s || `${r.software_name} ${r.vendor_name} ${r.category} ${r.business_vertical}`.toLowerCase().includes(s))
    && (!f.action || r.recommendation === f.action)
    && (!f.budget || (f.budget === 'over' ? r.ytd_variance > 0 : f.budget === 'forecast' ? r.forecast_variance > 0 : r.ytd_variance <= 0))
    && (!f.util || utilBand(Number(r.utilisation), target) === f.util)
    && (!f.renewal || (f.renewal === 'notice30' ? r.days_to_notice >= 0 && r.days_to_notice <= 30 : r.days_to_renewal >= 0 && r.days_to_renewal <= Number(f.renewal)))
    && (!f.auto || (f.auto === 'yes') === Boolean(r.auto_renew))
    && (!f.docs || r.missing_signed_msa)
    && (!f.deployment || r.deployment === f.deployment));
  const active = Object.entries(f).some(([, v]) => v);
  const set = (p) => setF((x) => ({ ...x, ...p }));

  const sum = (k) => rows.reduce((t, r) => t + Number(r[k] || 0), 0);
  const ready = Boolean(portfolio.data);
  const show = (v, fmt) => (!ready ? '…' : v === null || v === undefined || Number.isNaN(v) ? '—' : fmt(v));
  const kp = {
    n: rows.length,
    acv: sum('annual_cost'),
    budgetVar: sum('ytd_budget') ? sum('ytd_actual') / sum('ytd_budget') - 1 : null,
    util: sum('purchased') ? sum('active30') / sum('purchased') : null,
    shelf: sum('shelfware'),
    saving: sum('annual_saving'),
    renew90: rows.filter((r) => r.days_to_renewal >= 0 && r.days_to_renewal <= 90).reduce((t, r) => t + Number(r.annual_cost), 0),
    decisions: rows.filter((r) => r.days_to_notice >= 0 && r.days_to_notice <= 30).length,
  };

  // Chart 1: value / shelfware / saving by product (coloured by utilisation band) or by vendor / category / vertical
  const chart1 = (() => {
    const keyOf = { product: (r) => r.software_id, vendor: (r) => r.vendor_id, category: (r) => r.category, vertical: (r) => r.business_vertical }[group];
    const labelOf = { product: (r) => r.short_name || r.software_name, vendor: (r) => r.vendor_name, category: (r) => r.category, vertical: (r) => r.business_vertical }[group];
    const m = new Map();
    for (const r of rows) {
      const k = keyOf(r);
      const x = m.get(k) || { key: k, label: labelOf(r), value: 0, purchased: 0, active30: 0, n: 0 };
      x.value += Number(r[measure] || 0); x.purchased += Number(r.purchased || 0); x.active30 += Number(r.active30 || 0); x.n += 1;
      m.set(k, x);
    }
    return [...m.values()].map((x) => ({ ...x, util: x.purchased ? x.active30 / x.purchased : 0 }))
      .filter((x) => x.value > 0).sort((a, b) => b.value - a.value).slice(0, 12)
      .map((x) => ({ ...x, tag: `${formatINR(x.value)} · ${formatPct(x.util, 0)} used` }));
  })();
  const MEASURES = { annual_cost: 'Annual value', shelfware: 'Shelfware / yr', annual_saving: 'Saving at renewal' };

  const chart2 = ACTIONS.map((a) => {
    const xs = rows.filter((r) => r.recommendation === a.key);
    return { ...a, n: xs.length, value: xs.reduce((t, r) => t + Number(r.annual_cost), 0), names: xs.map((r) => r.short_name || r.software_name), tag: `${xs.length} · ${formatINR(xs.reduce((t, r) => t + Number(r.annual_cost), 0))}` };
  });

  const pick1 = (e) => {
    const x = e.payload ?? e;
    if (group === 'product') open.product(x.key);
    else patch({ [group]: x.key });
  };

  const filterBar = (
    <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-5 py-3 text-xs font-semibold text-slate-600">
      <label className="flex flex-col gap-1">Search<input type="search" value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="Product, vendor…" className={`${inputCls} w-40 font-normal`} /></label>
      <label className="flex flex-col gap-1">Action<select value={f.action} onChange={(e) => set({ action: e.target.value })} className={inputCls}><option value="">All</option>{ACTIONS.map((a) => <option key={a.key}>{a.key}</option>)}</select></label>
      <label className="flex flex-col gap-1">Budget<select value={f.budget} onChange={(e) => set({ budget: e.target.value })} className={inputCls}><option value="">All</option><option value="over">Over budget to date</option><option value="forecast">Forecast over FY budget</option><option value="within">Within budget</option></select></label>
      <label className="flex flex-col gap-1">Utilisation<select value={f.util} onChange={(e) => set({ util: e.target.value })} className={inputCls}><option value="">All</option><option value="ok">At or above {formatPct(target, 0)}</option><option value="mid">60% – {formatPct(target, 0)}</option><option value="low">Under 60%</option></select></label>
      <label className="flex flex-col gap-1">Renewal<select value={f.renewal} onChange={(e) => set({ renewal: e.target.value })} className={inputCls}><option value="">All</option><option value="notice30">Notice deadline ≤ 30 d</option><option value="90">Renews ≤ 90 d</option><option value="365">Renews ≤ 12 months</option></select></label>
      <label className="flex flex-col gap-1">Auto-renew<select value={f.auto} onChange={(e) => set({ auto: e.target.value })} className={inputCls}><option value="">All</option><option value="yes">Yes</option><option value="no">No</option></select></label>
      <label className="flex flex-col gap-1">Deployment<select value={f.deployment} onChange={(e) => set({ deployment: e.target.value })} className={inputCls}><option value="">All</option><option>SaaS</option><option>On-prem</option><option>Hybrid</option></select></label>
      <label className="inline-flex items-center gap-1.5 pb-2 font-normal"><input type="checkbox" checked={Boolean(f.docs)} onChange={(e) => set({ docs: e.target.checked ? 'msa' : '' })} className="rounded border-slate-300 focus:ring-blue-500" />No signed MSA</label>
      {active && <button type="button" onClick={() => setF(EMPTY)} className="inline-flex items-center gap-1 pb-2 font-medium text-blue-700 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"><X size={12} />Clear</button>}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard title="Subscriptions" value={show(kp.n, formatNumber)} tooltip="Products with an active contract that match the sidebar and table filters." />
        <KpiCard title="Annual Contract Value" value={show(kp.acv, formatINR)} tooltip="Σ annual value of the active contracts shown (apportioned by seat share when a region is picked)." />
        <KpiCard title="Spend vs Budget (FY to date)" value={show(kp.budgetVar, (v) => formatSignedPct(v))} tooltip="Spent April → as-of month ÷ budget for the same months − 1. Negative = under budget." />
        <KpiCard title="Utilisation" value={show(kp.util, (v) => formatPct(v))} tooltip={`Seats used in the last 30 days ÷ seats bought (target ${formatPct(target, 0)}).`} />
        <KpiCard title="Shelfware / yr" value={show(kp.shelf, formatINR)} tooltip="Annual cost of seats nobody uses: unassigned + assigned but idle 90+ days." />
        <KpiCard title="Saving at Renewal" value={show(kp.saving, formatINR)} tooltip="If each product is cut to 110% of its 90-day active users at renewal: Σ (seats to cut × price × 12)." />
        <KpiCard title="Renewing in 90 Days" value={show(kp.renew90, formatINR)} onClick={() => set({ renewal: '90' })} tooltip="Annual value of the contracts shown that end within 90 days. Click to filter the table." />
        <KpiCard title="Decisions Due ≤ 30 d" value={show(kp.decisions, formatNumber)} onClick={() => { set({ renewal: 'notice30' }); setView('renewal'); }} tooltip="Contracts whose notice deadline is within 30 days; miss it and auto-renewals roll over. Click to list them." />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Panel title="Where the money sits"
          tooltip="Annual value, shelfware or the saving available at renewal, by product, vendor, category or vertical (top 12). By product, bars are coloured by how well the licences are used. Select a product to open it, or a vendor / category / vertical to filter the whole suite.">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Segmented label="Measure" value={measure} onChange={setMeasure} options={Object.entries(MEASURES).map(([value, label]) => ({ value, label }))} />
            <Segmented label="Group by" value={group} onChange={setGroup} options={[{ value: 'product', label: 'Product' }, { value: 'vendor', label: 'Vendor' }, { value: 'category', label: 'Category' }, { value: 'vertical', label: 'Vertical' }]} />
          </div>
          <p className="mb-2 text-xs text-slate-600">
            {MEASURES[measure]}: <b className="text-slate-900">{formatINR(sum(measure))}</b> across {rows.length} subscriptions
            {chart1[0] && <> · largest <b className="text-slate-900">{chart1[0].label}</b> ({formatINR(chart1[0].value)})</>}
          </p>
          {!chart1.length ? <p className="py-8 text-center text-sm text-slate-500">Nothing to show for these filters.</p> : (
            <>
              <div style={{ height: Math.max(170, chart1.length * 28 + 30) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart1} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid stroke={INK.grid} horizontal={false} />
                    <XAxis type="number" tickFormatter={formatINRAxis} tick={axisTick} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="label" width={group === 'vertical' ? 150 : 110} interval={0} tick={{ fontSize: 12, fill: INK.secondary }} tickLine={false} axisLine={{ stroke: INK.axis }} />
                    <YAxis yAxisId="v" orientation="right" type="category" dataKey="tag" width={150} interval={0} tick={{ fontSize: 11, fill: INK.secondary }} tickLine={false} axisLine={false} />
                    <Tooltip {...tooltipStyle} cursor={{ fill: '#f1f5f9' }} formatter={(v, n, p) => [`${formatINR(v)} · ${formatPct(p.payload.util, 0)} of seats used${group !== 'product' ? ` · ${p.payload.n} products` : ''}`, MEASURES[measure]]} />
                    <Bar dataKey="value" maxBarSize={16} radius={[0, 4, 4, 0]} isAnimationActive={false} cursor="pointer" onClick={pick1}>
                      {chart1.map((x) => <Cell key={x.key} fill={BAND[utilBand(x.util, target)].color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-2 flex flex-wrap gap-3 text-xs text-slate-600">
                {Object.values(BAND).map((b) => <span key={b.label} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: b.color }} />Utilisation {b.label}</span>)}
              </p>
            </>
          )}
        </Panel>

        <Panel title="What to do at renewal"
          tooltip="Every subscription gets one recommended action from its usage: Renew (well used), Review (partly used), Right-size (under 60% used) or True-up (more users than licences). Bars show the annual value in each group; select one to filter the table.">
          <p className="mb-3 text-xs text-slate-600">
            {chart2.filter((a) => a.n).map((a, i) => <span key={a.key}>{i > 0 && ' · '}<b className="text-slate-900">{a.n}</b> {a.key.toLowerCase()}</span>)}
            {f.action && <> · table filtered to <b className="text-slate-900">{f.action}</b></>}
          </p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart2} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid stroke={INK.grid} horizontal={false} />
                <XAxis type="number" tickFormatter={formatINRAxis} tick={axisTick} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="key" width={80} interval={0} tick={{ fontSize: 12, fill: INK.secondary }} tickLine={false} axisLine={{ stroke: INK.axis }} />
                <YAxis yAxisId="v" orientation="right" type="category" dataKey="tag" width={110} interval={0} tick={{ fontSize: 11, fill: INK.secondary }} tickLine={false} axisLine={false} />
                <Tooltip {...tooltipStyle} cursor={{ fill: '#f1f5f9' }} formatter={(v, n, p) => [`${formatINR(v)} · ${p.payload.names.join(', ') || 'none'}`, `${p.payload.key}: ${p.payload.says}`]} />
                <Bar dataKey="value" maxBarSize={20} radius={[0, 4, 4, 0]} isAnimationActive={false} cursor="pointer" onClick={(e) => { const k = (e.payload ?? e).key; set({ action: f.action === k ? '' : k }); }}>
                  {chart2.map((a) => <Cell key={a.key} fill={a.color} fillOpacity={f.action && f.action !== a.key ? 0.35 : 1} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-3 space-y-1 text-xs text-slate-600">
            {ACTIONS.map((a) => <li key={a.key} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: a.color }} /><b className="text-slate-800">{a.key}</b> — {a.says}</li>)}
          </ul>
        </Panel>
      </div>

      <Panel title="Subscriptions" flush
        tooltip="One row per product with an active contract. Switch the columns between Overview, Spend & budget, Usage & savings and Renewal; filter by action, budget, utilisation, renewal, auto-renew, deployment or missing MSA. Select a product for its full detail (spend, usage, contract, documents).">
        <SubscriptionsTable rows={rows} total={all.length} target={target} view={view} setView={setView} filterBar={filterBar}
          onSelect={(id) => open.product(id)} onDocuments={(id) => open.docs({ software: id })} />
      </Panel>
    </div>
  );
}
