import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { CalendarRange, Gauge, HandCoins, ReceiptIndianRupee, TrendingUp, Wallet } from 'lucide-react';
import KpiCard from '../../../components/KpiCard';
import Panel from '../../../components/Panel';
import { useRpc } from '../../../hooks/useRpc';
import { formatINR, formatMonth, formatSignedPct } from '../../../lib/format';
import { useGlobalStore } from '../../../store/useGlobalStore';
import SpendVsBudget from '../charts/SpendVsBudget';
import YearOnYear from '../charts/YearOnYear';
import SpendBreakdown from '../charts/SpendBreakdown';
import InvoiceTable from '../tables/InvoiceTable';
import { useLicensing } from '../LicensingContext';

/** Spend & Budget: fiscal-year spend, forecast, year-on-year, where the money goes, budget variance and invoices. */
export default function SpendPage() {
  const { filters, kpis, meta, open, params, patch } = useLicensing();
  const month = params.get('month');
  const location = useLocation();
  const setRegion = useGlobalStore((st) => st.setGlobalFilter);
  const spend = useRpc('it_lic_spend_monthly', { p_filters: filters });
  const breakdown = useRpc('it_lic_spend_breakdown', { p_filters: filters });
  const variance = useRpc('it_lic_budget_variance', { p_filters: filters });
  const invoices = useRpc('it_lic_invoices', { p_filters: filters });
  const monthLines = useRpc('it_lic_spend_month', { p_filters: filters, p_month: month }, Boolean(month));

  useEffect(() => {
    if (location.hash === '#invoices' && invoices.data) document.getElementById('invoices')?.scrollIntoView({ behavior: 'smooth' });
  }, [location.hash, invoices.data]);

  const k = kpis.data ?? {};
  const show = (v, fmt) => (kpis.loading && !kpis.data ? '…' : v === null || v === undefined ? '—' : fmt(v));
  const forecastVar = k.fy_budget ? k.fy_forecast / k.fy_budget - 1 : null;

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
        <Panel title="This year vs last year" tooltip="This fiscal year against the previous one. Change view: this FY minus the same month last FY, with the % change on each bar. Monthly: both years side by side. Cumulative: running totals.">
          {breakdown.loading && !breakdown.data ? <p className="h-72 text-sm text-slate-500">Loading…</p> : <YearOnYear yoy={breakdown.data?.yoy ?? []} />}
        </Panel>
      </div>

      <Panel title="Where the money goes" tooltip="Actual vs budget broken down by vendor, vertical, category, product or region; FY to date or full-year forecast (forecast = spend to date + 3-month run-rate × months left). The right-hand column is the variance. Region spend is allocated by seat share.">
        {variance.loading && !variance.data ? <p className="h-72 text-sm text-slate-500">Loading…</p> : (
          <SpendBreakdown variance={variance.data ?? []} byRegion={breakdown.data?.by_region ?? []} byVendor={breakdown.data?.by_vendor ?? []}
            onSelect={(dim, id) => {
              if (dim === 'vendor') open.vendor(id);
              else if (dim === 'product') open.product(id, 'Spend');
              else if (dim === 'region') setRegion('regionId', id);
              else patch({ [dim]: id });
            }} />
        )}
      </Panel>

      <div id="invoices" className="scroll-mt-4">
        <Panel title="Invoice register" flush tooltip="Every invoice since Apr-2025 with its PDF. Disputed: payment withheld (e.g. unsigned MSA). Overdue: past due date and unpaid.">
          <InvoiceTable rows={invoices.data ?? []} loading={invoices.loading} />
        </Panel>
      </div>
    </div>
  );
}
