import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlarmClock, BadgeIndianRupee, CalendarClock, FileText, PiggyBank, Scale, TrendingDown, TriangleAlert, UserCheck, Users, Wallet,
} from 'lucide-react';
import KpiCard from '../../components/KpiCard';
import ChartCard from '../../components/ChartCard';
import { useGlobalStore } from '../../store/useGlobalStore';
import { useRawTables } from '../../hooks/useRawTables';
import { useRpc } from '../../hooks/useRpc';
import { BackendMissingError } from '../../lib/rpc';
import { formatDate, formatINR, formatMonth, formatNumber, formatPct, formatSignedPct } from '../../lib/format';
import SpendVsBudget from './charts/SpendVsBudget';
import ValueMatrix from './charts/ValueMatrix';
import SeatFunnel from './charts/SeatFunnel';
import RenewalTimeline from './charts/RenewalTimeline';
import SpendByVertical from './charts/SpendByVertical';
import UtilisationTrend from './charts/UtilisationTrend';
import SubscriptionRegister from './tables/SubscriptionRegister';
import ReclaimTable from './tables/ReclaimTable';
import ProductDrawer from './ProductDrawer';
import DocumentDrawer from './DocumentDrawer';

// Small lookup tables for the page filters (defined outside the component so useRawTables stays stable)
const OPTION_SPECS = {
  vendors: { table: 'it_dim_vendor', select: 'vendor_id, vendor_name', options: { orderBy: 'vendor_name' } },
  software: { table: 'it_dim_software', select: 'software_id, category, business_vertical', options: { orderBy: 'software_id' } },
};

const PAGE_FILTERS = [
  { key: 'vertical', label: 'Vertical' },
  { key: 'vendor', label: 'Vendor' },
  { key: 'category', label: 'Category' },
];

function Section({ title, tooltip, children, className = '' }) {
  return (
    <section className={`bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-4 sm:px-5 py-4 border-b border-slate-200">
        <h3 className="text-sm font-bold tracking-wide uppercase text-slate-700">{title}</h3>
        {tooltip && <p className="hidden md:block text-xs text-slate-500 max-w-md text-right">{tooltip}</p>}
      </div>
      {children}
    </section>
  );
}

export default function LicensingModule() {
  const regionId = useGlobalStore((s) => s.regionId);
  const [params, setParams] = useSearchParams();

  const setParam = useCallback((key, value) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    }, { replace: key === 'month' });
  }, [setParams]);

  // Filter contract for the it_lic_* RPCs: null = no filter
  const filters = useMemo(() => ({
    region: regionId && regionId !== 'All' ? regionId : null,
    vertical: params.get('vertical'),
    vendor: params.get('vendor'),
    category: params.get('category'),
  }), [regionId, params]);

  const kpis = useRpc('it_lic_kpis', { p_filters: filters });
  const portfolio = useRpc('it_lic_portfolio', { p_filters: filters });
  const spend = useRpc('it_lic_spend_monthly', { p_filters: filters });
  const trend = useRpc('it_lic_util_trend', { p_filters: filters });
  const reclaim = useRpc('it_lic_reclaim', { p_filters: filters, p_limit: 200 });
  const month = params.get('month');
  const monthLines = useRpc('it_lic_spend_month', { p_filters: filters, p_month: month }, Boolean(month));
  const { data: options } = useRawTables(OPTION_SPECS);

  const k = kpis.data ?? {};
  const rows = portfolio.data ?? [];
  const target = Number(k.target_utilisation ?? 0.85);
  const selected = rows.find((r) => r.software_id === params.get('sw'));
  const docsMode = params.get('docs');
  const overDeployed = rows.filter((r) => r.trueup > 0);
  const decisionsDue = rows.filter((r) => r.days_to_notice >= 0 && r.days_to_notice <= 30).sort((a, b) => a.days_to_notice - b.days_to_notice);
  const prevLabel = k.as_of ? formatMonth(new Date(new Date(k.as_of).setMonth(new Date(k.as_of).getMonth() - 3))) : '';
  const fyLabel = k.fy_start ? `FY ${new Date(k.fy_start).getFullYear()}-${String(new Date(k.fy_start).getFullYear() + 1).slice(2)}` : '';

  const filterOptions = useMemo(() => {
    const sw = options.software ?? [];
    return {
      vertical: [...new Set(sw.map((s) => s.business_vertical))].sort().map((v) => ({ value: v, label: v })),
      category: [...new Set(sw.map((s) => s.category))].sort().map((v) => ({ value: v, label: v })),
      vendor: (options.vendors ?? []).map((v) => ({ value: v.vendor_id, label: v.vendor_name })),
    };
  }, [options]);

  const error = [kpis, portfolio, spend, trend, reclaim].find((r) => r.error)?.error;
  if (error) {
    return (
      <div className={`rounded-xl border p-5 text-sm ${error instanceof BackendMissingError ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-red-200 bg-white text-red-700'}`}>
        <p className="font-semibold mb-1">{error instanceof BackendMissingError ? 'Licensing data is not set up yet' : 'Could not load licensing data'}</p>
        <p>{error.message}</p>
      </div>
    );
  }

  const show = (v, fmt) => (kpis.loading && !kpis.data ? '…' : fmt(v));
  const utilDelta = k.utilisation != null && k.utilisation_prev != null ? k.utilisation - k.utilisation_prev : null;
  const shelfDelta = k.shelfware_prev ? k.shelfware / k.shelfware_prev - 1 : null;
  const cpauDelta = k.cost_per_active_user_prev ? k.cost_per_active_user / k.cost_per_active_user_prev - 1 : null;

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Licensing &amp; Subscriptions</h1>
          <p className="text-sm text-slate-500">
            As of {formatDate(k.as_of)} · {fyLabel} (Apr–Mar) · all figures in ₹
            {filters.region && ' · region filter applied to seats and spend; contract values apportioned by seat share'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setParam('docs', 'all')}
          className="inline-flex items-center gap-2 self-start rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
        >
          <FileText size={16} aria-hidden="true" /> Contracts &amp; documents
        </button>
      </div>

      {/* Page filters */}
      <div className="flex flex-wrap items-end gap-3 bg-white px-4 py-3 rounded-xl border border-slate-200 shadow-sm">
        {PAGE_FILTERS.map((f) => (
          <label key={f.key} className="flex flex-col text-xs font-semibold text-slate-600">
            {f.label}
            <select
              value={params.get(f.key) ?? ''}
              onChange={(e) => setParam(f.key, e.target.value)}
              className="mt-1 min-w-40 rounded-md border border-slate-300 bg-white py-1.5 px-2 text-sm font-normal text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              <option value="">All</option>
              {filterOptions[f.key].map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        ))}
        {PAGE_FILTERS.some((f) => params.get(f.key)) && (
          <button type="button" onClick={() => setParams({})} className="text-sm font-medium text-sky-700 hover:underline focus:outline-none focus:ring-2 focus:ring-sky-500 rounded px-1 py-1.5">
            Clear filters
          </button>
        )}
        <p className="ml-auto text-xs text-slate-500">{formatNumber(k.products)} products · {formatNumber(k.purchased)} seats</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard title="Annual Contract Value" value={show(k.acv, formatINR)} icon={<BadgeIndianRupee size={20} />}
          sub={`${formatNumber(k.products)} active contracts`}
          tooltip="Sum of the annual value of every active contract at the as-of date (run-rate). With a region filter, each contract is apportioned by that region's share of purchased seats." />
        <KpiCard title={`${fyLabel} Spend to Date`} value={show(k.ytd_actual, formatINR)} icon={<Wallet size={20} />}
          delta={k.ytd_variance_pct != null ? `${formatSignedPct(k.ytd_variance_pct)} vs budget` : null}
          deltaTone={k.ytd_variance_pct > 0 ? 'bad' : 'good'}
          sub={`budget ${formatINR(k.ytd_budget)}`}
          tooltip="Actual software spend from April to the as-of month, against the budget for the same months. Variance = (actual − budget) ÷ budget." />
        <KpiCard title="Licence Utilisation" value={show(k.utilisation, (v) => formatPct(v))} icon={<UserCheck size={20} />}
          delta={utilDelta != null ? `${formatSignedPct(utilDelta, 1, ' pts')} vs ${prevLabel}` : null}
          deltaTone={utilDelta > 0 ? 'good' : utilDelta < 0 ? 'bad' : 'neutral'}
          sub={`target ${formatPct(target, 0)}`}
          tooltip="Seats with a login in the last 30 days ÷ seats purchased (latest month). Target 85%." />
        <KpiCard title="Shelfware Cost" value={show(k.shelfware, formatINR)} icon={<TrendingDown size={20} />}
          delta={shelfDelta != null ? `${formatSignedPct(shelfDelta)} vs ${prevLabel}` : null}
          deltaTone={shelfDelta > 0 ? 'bad' : 'good'}
          sub={`${formatINR(k.shelf_unassigned)} unassigned · ${formatINR(k.shelf_dormant)} dormant`}
          tooltip="Annualised cost of seats paid for but not used: unassigned seats (purchased − assigned) plus dormant seats (assigned, no login in 90 days), × unit price × 12." />
        <KpiCard title="Savings at Renewal (12 mo)" value={show(k.savings_at_renewal_12m, formatINR)} icon={<PiggyBank size={20} />}
          sub="shelfware on contracts renewing within a year"
          tooltip="Shelfware cost on contracts whose term ends within 365 days, i.e. what right-sizing quantities at the next renewal can realistically save." />
        <KpiCard title="Renewal Exposure (90 d)" value={show(k.renewal_exposure, formatINR)} icon={<CalendarClock size={20} />}
          delta={k.decisions_due ? `${k.decisions_due} decision${k.decisions_due > 1 ? 's' : ''} due ≤ 30 d` : null}
          deltaTone="bad"
          sub={`${formatNumber(k.renewal_count)} contracts end within 90 days`}
          tooltip="Annual value of contracts ending within 90 days. 'Decisions due' = contracts whose notice deadline (end date − notice period) falls within 30 days." />
        <KpiCard title="True-up Risk" value={show(k.trueup, formatINR)} icon={<Scale size={20} />}
          sub={k.trueup_products ? `${k.trueup_products} product over-deployed` : 'no over-deployment'}
          onClick={overDeployed.length ? () => setParam('sw', overDeployed[0].software_id) : undefined}
          tooltip="Seats assigned beyond the purchased entitlement × unit price × 12: the likely compliance true-up bill. Click to open the product." />
        <KpiCard title="Cost per Active User" value={show(k.cost_per_active_user, (v) => `${formatINR(v)}/mo`)} icon={<Users size={20} />}
          delta={cpauDelta != null ? `${formatSignedPct(cpauDelta)} vs ${prevLabel}` : null}
          deltaTone={cpauDelta > 0 ? 'bad' : 'good'}
          tooltip="Monthly licence cost of the purchased entitlement ÷ seats active in the last 30 days." />
      </div>

      {/* Action strip */}
      {(decisionsDue.length > 0 || k.missing_signed_msa > 0 || overDeployed.length > 0) && (
        <div className="flex flex-col md:flex-row gap-3">
          {decisionsDue.map((r) => (
            <button key={r.software_id} type="button" onClick={() => setParam('sw', r.software_id)}
              className="flex flex-1 items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-left hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-sky-500">
              <AlarmClock size={18} className="mt-0.5 text-red-700 shrink-0" aria-hidden="true" />
              <span className="text-sm text-red-900">
                <span className="font-semibold">{r.software_name}: notice due in {r.days_to_notice} d</span>
                <span className="block text-xs">{r.auto_renew ? 'Auto-renews' : 'Ends'} {formatDate(r.end_date)} · {formatINR(r.annual_cost)}/yr · {formatPct(r.utilisation, 0)} utilised</span>
              </span>
            </button>
          ))}
          {k.missing_signed_msa > 0 && (
            <button type="button" onClick={() => setParam('docs', 'missing')}
              className="flex flex-1 items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-sky-500">
              <TriangleAlert size={18} className="mt-0.5 text-amber-700 shrink-0" aria-hidden="true" />
              <span className="text-sm text-amber-900">
                <span className="font-semibold">{k.missing_signed_msa} contract{k.missing_signed_msa > 1 ? 's' : ''} without a signed MSA</span>
                <span className="block text-xs">Open the documents to chase signatures</span>
              </span>
            </button>
          )}
        </div>
      )}

      {/* Spend + funnel */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <ChartCard title={`Spend vs Budget · ${fyLabel}`} tooltip="Monthly actual spend against budget for the fiscal year, or cumulative with a run-rate forecast to March. Select a bar to drill into that month.">
            {spend.loading && !spend.data ? <p className="h-72 text-sm text-slate-500">Loading…</p> : (
              <SpendVsBudget data={spend.data ?? []} selectedMonth={month} onMonthClick={(m) => setParam('month', m === month ? null : m)} />
            )}
            {month && (
              <div className="mt-4 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200">
                  <p className="text-sm font-semibold text-slate-800">{formatMonth(month)} by product</p>
                  <button type="button" onClick={() => setParam('month', null)} className="text-xs font-medium text-sky-700 hover:underline focus:outline-none focus:ring-2 focus:ring-sky-500 rounded">Close</button>
                </div>
                <div className="overflow-x-auto max-h-64">
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase text-slate-500 bg-slate-50 sticky top-0">
                      <tr>
                        <th scope="col" className="text-left px-3 py-2">Product</th>
                        <th scope="col" className="text-right px-3 py-2">Budget</th>
                        <th scope="col" className="text-right px-3 py-2">Actual</th>
                        <th scope="col" className="text-right px-3 py-2">Variance</th>
                      </tr>
                    </thead>
                    <tbody className="tabular-nums">
                      {(monthLines.data ?? []).map((l) => {
                        const v = l.budget ? l.actual / l.budget - 1 : null;
                        return (
                          <tr key={l.software_id} className="border-t border-slate-100">
                            <td className="px-3 py-2">
                              <button type="button" onClick={() => setParam('sw', l.software_id)} className="text-left text-slate-900 hover:text-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 rounded">{l.software_name}</button>
                              {l.note && <span className="block text-xs text-amber-700">{l.note}</span>}
                            </td>
                            <td className="px-3 py-2 text-right">{formatINR(l.budget)}</td>
                            <td className="px-3 py-2 text-right">{l.actual == null ? 'Not yet invoiced' : formatINR(l.actual)}</td>
                            <td className={`px-3 py-2 text-right ${v > 0.02 ? 'text-red-700 font-semibold' : 'text-slate-600'}`}>{v == null || l.actual == null ? '—' : formatSignedPct(v)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </ChartCard>
        </div>
        <ChartCard title="Seat Funnel" tooltip="Where purchased seats go: assigned to someone, used in the last 90 days, used in the last 30 days.">
          <SeatFunnel purchased={k.purchased} assigned={k.assigned} active90={rows.reduce((s, r) => s + r.active90, 0)} active30={k.active30}
            shelfUnassigned={k.shelf_unassigned} shelfDormant={k.shelf_dormant} />
        </ChartCard>
      </div>

      {/* Matrix + renewals */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ChartCard title="Value-for-Money Matrix" tooltip="Each bubble is a product: utilisation (x) vs annual cost (y), size = purchased seats. Top-left 'Optimise' = expensive and under-used. Select a bubble to open the product.">
          <ValueMatrix data={rows} target={target} onSelect={(id) => setParam('sw', id)} />
        </ChartCard>
        <ChartCard title="Renewal Timeline · next 12 months" tooltip="Decision window per contract, from the notice deadline to the contract end. Select a row to open the product.">
          {k.as_of ? <RenewalTimeline data={rows} asOf={k.as_of} onSelect={(id) => setParam('sw', id)} /> : <p className="text-sm text-slate-500">Loading…</p>}
        </ChartCard>
      </div>

      {/* Trend + vertical */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ChartCard title="Utilisation Trend" tooltip="Active-30-day seats ÷ purchased seats by month, for the filtered portfolio and up to two products (defaults to the two least utilised).">
          <UtilisationTrend trend={trend.data ?? []} portfolio={rows} target={target} />
        </ChartCard>
        <ChartCard title="Spend vs Budget by Vertical · FY to date" tooltip="Actual vs budget by the business vertical that owns each product. Select a vertical to filter the page.">
          <SpendByVertical portfolio={rows} onSelect={(v) => setParam('vertical', v)} />
        </ChartCard>
      </div>

      <Section title="Subscription Register" tooltip="Every subscription with its cost, usage and renewal status. Select a product for the drill-down, or Documents for its contract files.">
        <SubscriptionRegister rows={rows} target={target} onSelect={(id) => setParam('sw', id)} onDocuments={(id) => setParam('docs', id)} />
      </Section>

      <Section title="Reclaim Candidates" tooltip="Assigned seats with no login for 90+ days (or never used): harvest these before buying more.">
        <ReclaimTable data={reclaim.data} loading={reclaim.loading} />
      </Section>

      {selected && <ProductDrawer key={selected.software_id} product={selected} target={target} onClose={() => setParam('sw', null)} />}
      <DocumentDrawer mode={docsMode} portfolio={rows} onClose={() => setParam('docs', null)} />
    </div>
  );
}
