import { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, LabelList, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CalendarRange, Gauge, HandCoins, ReceiptIndianRupee, TrendingUp, Wallet } from 'lucide-react';
import KpiCard from '../../../components/KpiCard';
import Panel from '../../../components/Panel';
import { useRpc } from '../../../hooks/useRpc';
import { formatINR, formatINRAxis, formatMonth, formatPct, formatSignedPct } from '../../../lib/format';
import { downloadCsv } from '../../../lib/csv';
import { INK, SERIES, axisTick, gridProps, tooltipStyle } from '../../../lib/chartTheme';
import SpendVsBudget from '../charts/SpendVsBudget';
import SpendByVertical from '../charts/SpendByVertical';
import InvoiceTable from '../tables/InvoiceTable';
import { useLicensing } from '../LicensingContext';

/** Spend & Budget: fiscal-year spend, forecast, year-on-year, where the money goes, budget variance and invoices. */
export default function SpendPage() {
  const { filters, kpis, meta, open, params, patch } = useLicensing();
  const month = params.get('month');
  const location = useLocation();
  const spend = useRpc('it_lic_spend_monthly', { p_filters: filters });
  const breakdown = useRpc('it_lic_spend_breakdown', { p_filters: filters });
  const portfolio = useRpc('it_lic_portfolio', { p_filters: filters });
  const variance = useRpc('it_lic_budget_variance', { p_filters: filters });
  const invoices = useRpc('it_lic_invoices', { p_filters: filters });
  const monthLines = useRpc('it_lic_spend_month', { p_filters: filters, p_month: month }, Boolean(month));

  useEffect(() => {
    if (location.hash === '#invoices' && invoices.data) document.getElementById('invoices')?.scrollIntoView({ behavior: 'smooth' });
  }, [location.hash, invoices.data]);

  const k = kpis.data ?? {};
  const show = (v, fmt) => (kpis.loading && !kpis.data ? '…' : v === null || v === undefined ? '—' : fmt(v));
  const forecastVar = k.fy_budget ? k.fy_forecast / k.fy_budget - 1 : null;
  const yoy = useMemo(() => (breakdown.data?.yoy ?? []).map((r) => ({ ...r, label: formatMonth(r.month) })), [breakdown.data]);
  const vendors = (breakdown.data?.by_vendor ?? []).map((v) => ({ ...v, cumLabel: formatPct(v.cum_share, 0) }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <KpiCard title={`${meta.fyLabel} Spend to Date`} value={show(k.ytd_actual, formatINR)} icon={<Wallet size={20} />}
          delta={k.ytd_variance_pct != null ? `${formatSignedPct(k.ytd_variance_pct)} vs budget` : null} deltaTone={k.ytd_variance_pct > 0 ? 'bad' : 'good'}
          sub={`budget to date ${formatINR(k.ytd_budget)}`} tooltip="Accrued licence spend April → as-of month vs budget for the same months." />
        <KpiCard title="Full-Year Forecast" value={show(k.fy_forecast, formatINR)} icon={<CalendarRange size={20} />}
          delta={forecastVar != null ? `${formatSignedPct(forecastVar)} vs FY budget` : null} deltaTone={forecastVar > 0 ? 'bad' : 'good'}
          sub={`FY budget ${formatINR(k.fy_budget)}`} tooltip="Spend to date + average of the last 3 months × months left in the fiscal year." />
        <KpiCard title="Growth vs Last Year" value={show(k.ytd_growth_pct, (v) => formatSignedPct(v))} icon={<TrendingUp size={20} />}
          sub={`same months last FY: ${formatINR(k.prior_ytd_actual)}`} tooltip="Spend to date ÷ spend in the same months of the previous fiscal year − 1 (renewal uplifts and seat growth)." />
        <KpiCard title="Monthly Run-Rate" value={show(k.run_rate_month, formatINR)} icon={<Gauge size={20} />}
          tooltip="Average monthly actual spend over the last 3 months." />
        <KpiCard title="Invoices Due" value={show(k.due_invoice_value, formatINR)} icon={<HandCoins size={20} />}
          sub="not yet due for payment (incl. GST)" tooltip="Issued invoices whose due date is after the as-of date." />
        <KpiCard title="Invoices Held Up" value={show(k.problem_invoice_value, formatINR)} icon={<ReceiptIndianRupee size={20} />}
          delta={k.disputed_invoices || k.overdue_invoices ? `${k.disputed_invoices} disputed · ${k.overdue_invoices} overdue` : null} deltaTone="bad"
          onClick={() => document.getElementById('invoices')?.scrollIntoView({ behavior: 'smooth' })}
          tooltip="Disputed or overdue invoices (incl. GST). Click to jump to the invoice register." />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Panel title={`Spend vs budget · ${meta.fyLabel}`} tooltip="Monthly actual vs budget, or cumulative with a run-rate forecast to March. Select a month's bar for its spend by product.">
          {spend.loading && !spend.data ? <p className="h-72 text-sm text-slate-500">Loading…</p> : (
            <SpendVsBudget data={spend.data ?? []} selectedMonth={month} onMonthClick={(m) => patch({ month: m === month ? null : m })} />
          )}
          {month && (
            <div className="mt-4 rounded-lg border border-slate-200">
              <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200">
                <p className="text-sm font-semibold text-slate-800">{formatMonth(month)} by product</p>
                <button type="button" onClick={() => patch({ month: null })} className="text-xs font-medium text-sky-700 hover:underline focus:outline-none focus:ring-2 focus:ring-sky-500 rounded">Close</button>
              </div>
              <div className="overflow-x-auto max-h-64">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase text-slate-500 bg-slate-50 sticky top-0"><tr>
                    <th scope="col" className="text-left px-3 py-2">Product</th><th scope="col" className="text-right px-3 py-2">Budget</th>
                    <th scope="col" className="text-right px-3 py-2">Actual</th><th scope="col" className="text-right px-3 py-2">Variance</th>
                  </tr></thead>
                  <tbody className="tabular-nums">
                    {(monthLines.data ?? []).map((l) => {
                      const v = l.budget && l.actual != null ? l.actual / l.budget - 1 : null;
                      return (
                        <tr key={l.software_id} className="border-t border-slate-100">
                          <td className="px-3 py-2">
                            <button type="button" onClick={() => open.product(l.software_id, 'Spend')} className="text-left text-slate-900 hover:text-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 rounded">{l.software_name}</button>
                            {l.note && <span className="block text-xs text-amber-700">{l.note}</span>}
                          </td>
                          <td className="px-3 py-2 text-right">{formatINR(l.budget)}</td>
                          <td className="px-3 py-2 text-right">{l.actual == null ? 'Not yet invoiced' : formatINR(l.actual)}</td>
                          <td className={`px-3 py-2 text-right ${v > 0.02 ? 'text-red-700 font-semibold' : 'text-slate-600'}`}>{v == null ? '—' : formatSignedPct(v)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Panel>
        <Panel title="This year vs last year" tooltip="Monthly actual spend this fiscal year against the same month of the previous fiscal year.">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={yoy} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: INK.axis }} />
                <YAxis tickFormatter={formatINRAxis} tick={axisTick} tickLine={false} axisLine={false} width={64} />
                <Tooltip formatter={(v, n) => [formatINR(v), n]} {...tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12, color: INK.secondary }} />
                <Line dataKey="last_fy" name="Last FY" stroke={INK.muted} strokeWidth={2} strokeDasharray="5 4" dot={false} />
                <Line dataKey="this_fy" name="This FY" stroke={SERIES[0]} strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Spend by vendor · FY to date" tooltip="Pareto: vendors ranked by spend; the label shows the cumulative share. One INR axis. Select a vendor for its drill-down.">
          <div style={{ height: Math.max(240, vendors.length * 28 + 40) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={vendors} layout="vertical" margin={{ top: 4, right: 56, left: 8, bottom: 0 }}>
                <CartesianGrid stroke={INK.grid} horizontal={false} />
                <XAxis type="number" tickFormatter={formatINRAxis} tick={axisTick} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="vendor_name" width={140} tick={{ fontSize: 12, fill: INK.secondary }} tickLine={false} axisLine={{ stroke: INK.axis }} />
                <Tooltip formatter={(v, n, p) => [`${formatINR(v)} (${formatPct(p.payload.share)} · cumulative ${formatPct(p.payload.cum_share)})`, 'Actual']} {...tooltipStyle} cursor={{ fill: '#f1f5f9' }} />
                <Bar dataKey="actual" fill={SERIES[0]} radius={[0, 4, 4, 0]} maxBarSize={14} cursor="pointer" onClick={(e) => open.vendor((e.payload ?? e).vendor_id)}>
                  <LabelList dataKey="cumLabel" position="right" fill={INK.muted} fontSize={11} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <div className="space-y-6">
          <Panel title="Spend vs budget by vertical · FY to date" tooltip="Actual vs budget by owning vertical; select one to filter the suite.">
            <SpendByVertical portfolio={portfolio.data ?? []} onSelect={(v) => patch({ vertical: v })} />
          </Panel>
          <Panel title="Spend by region · FY to date" tooltip="Spend is allocated to regions by seat share.">
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={breakdown.data?.by_region ?? []} margin={{ top: 16, right: 8, left: 4, bottom: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="region_name" tick={axisTick} tickLine={false} axisLine={{ stroke: INK.axis }} />
                  <YAxis tickFormatter={formatINRAxis} tick={axisTick} tickLine={false} axisLine={false} width={56} />
                  <Tooltip formatter={(v) => [formatINR(v), 'Actual']} {...tooltipStyle} cursor={{ fill: '#f1f5f9' }} />
                  <Bar dataKey="actual" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={36} label={{ position: 'top', fill: INK.secondary, fontSize: 11, formatter: formatINR }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </div>
      </div>

      <Panel title="Budget variance by product" flush
        actions={<button type="button" disabled={!variance.data?.length} onClick={() => downloadCsv('budget-variance.csv', variance.data, [
          { key: 'software_name', label: 'Product' }, { key: 'vendor_name', label: 'Vendor' }, { key: 'business_vertical', label: 'Vertical' },
          { key: 'fy_budget', label: 'FY budget' }, { key: 'ytd_budget', label: 'Budget to date' }, { key: 'ytd_actual', label: 'Actual to date' },
          { key: 'ytd_variance', label: 'Variance to date' }, { key: 'forecast', label: 'FY forecast' }, { key: 'forecast_variance', label: 'Forecast vs FY budget' }, { key: 'yoy', label: 'Growth vs last FY' }])}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-sky-500">Export CSV</button>}
        tooltip="Per product, worst forecast first. Forecast = spend to date + 3-month run-rate × remaining months.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-slate-600">
            <thead className="text-xs uppercase bg-slate-50 text-slate-500 border-b border-slate-200"><tr>
              {['Product', 'Vertical', 'FY budget', 'Budget to date', 'Actual to date', 'Variance', 'FY forecast', 'Forecast vs budget', 'vs last FY'].map((h, i) => (
                <th key={h} scope="col" className={`px-4 py-2.5 font-semibold whitespace-nowrap ${i > 1 ? 'text-right' : ''}`}>{h}</th>))}
            </tr></thead>
            <tbody className="tabular-nums whitespace-nowrap">
              {(variance.data ?? []).map((r) => (
                <tr key={r.software_id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2.5"><button type="button" onClick={() => open.product(r.software_id, 'Spend')} className="text-left font-medium text-slate-900 hover:text-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 rounded">{r.software_name}</button><span className="block text-xs text-slate-500">{r.vendor_name}</span></td>
                  <td className="px-4 py-2.5">{r.business_vertical}</td>
                  <td className="px-4 py-2.5 text-right">{formatINR(r.fy_budget)}</td>
                  <td className="px-4 py-2.5 text-right">{formatINR(r.ytd_budget)}</td>
                  <td className="px-4 py-2.5 text-right">{formatINR(r.ytd_actual)}</td>
                  <td className={`px-4 py-2.5 text-right ${r.ytd_variance > 0.02 ? 'text-red-700 font-semibold' : ''}`}>{formatSignedPct(r.ytd_variance)}</td>
                  <td className="px-4 py-2.5 text-right">{formatINR(r.forecast)}</td>
                  <td className={`px-4 py-2.5 text-right ${r.forecast_variance > 0.02 ? 'text-red-700 font-semibold' : ''}`}>{formatSignedPct(r.forecast_variance)}</td>
                  <td className="px-4 py-2.5 text-right">{formatSignedPct(r.yoy)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div id="invoices" className="scroll-mt-4">
        <Panel title="Invoice register" flush tooltip="Every invoice since Apr-2025 with its PDF. Disputed: payment withheld (e.g. unsigned MSA). Overdue: past due date and unpaid.">
          <InvoiceTable rows={invoices.data ?? []} loading={invoices.loading} />
        </Panel>
      </div>
    </div>
  );
}
