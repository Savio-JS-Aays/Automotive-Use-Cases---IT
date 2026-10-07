import { Link, useSearchParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  AlarmClock, ArrowRight, BadgeIndianRupee, CalendarClock, FileWarning, PiggyBank, ReceiptIndianRupee, Scale, TrendingDown, TriangleAlert, UserCheck, Users, Wallet,
} from 'lucide-react';
import KpiCard from '../../../components/KpiCard';
import Panel from '../../../components/Panel';
import { useRpc } from '../../../hooks/useRpc';
import { formatDate, formatINR, formatINRAxis, formatMonth, formatNumber, formatPct, formatSignedPct } from '../../../lib/format';
import { INK, SERIES, axisTick, tooltipStyle } from '../../../lib/chartTheme';
import ValueMatrix from '../charts/ValueMatrix';
import RenewalTimeline from '../charts/RenewalTimeline';
import SubscriptionRegister from '../tables/SubscriptionRegister';
import DocGapsList from '../tables/DocGapsList';
import { useLicensing } from '../LicensingContext';

function SeeMore({ to, children }) {
  const [params] = useSearchParams();
  const keep = new URLSearchParams();
  ['vertical', 'vendor', 'category'].forEach((k) => params.get(k) && keep.set(k, params.get(k)));
  return (
    <Link to={{ pathname: to, search: keep.toString() ? `?${keep}` : '' }} className="inline-flex items-center gap-1 text-xs font-medium text-sky-700 hover:underline focus:outline-none focus:ring-2 focus:ring-sky-500 rounded">
      {children} <ArrowRight size={12} aria-hidden="true" />
    </Link>
  );
}

/** Licensing Overview: headline KPIs, what needs action, value-for-money, renewals, spend mix, savings, documentation gaps. */
export default function OverviewPage() {
  const { filters, kpis, meta, open } = useLicensing();
  const portfolio = useRpc('it_lic_portfolio', { p_filters: filters });
  const breakdown = useRpc('it_lic_spend_breakdown', { p_filters: filters });
  const optimisation = useRpc('it_lic_optimisation', { p_filters: filters });

  const k = kpis.data ?? {};
  const rows = portfolio.data ?? [];
  const show = (v, fmt) => (kpis.loading && !kpis.data ? '…' : v === null || v === undefined ? '—' : fmt(v));
  const prevLabel = k.as_of ? formatMonth(new Date(new Date(k.as_of).setMonth(new Date(k.as_of).getMonth() - 3))) : '';
  const utilDelta = k.utilisation != null && k.utilisation_prev != null ? k.utilisation - k.utilisation_prev : null;
  const shelfDelta = k.shelfware_prev ? k.shelfware / k.shelfware_prev - 1 : null;
  const decisions = rows.filter((r) => r.days_to_notice >= 0 && r.days_to_notice <= 30).sort((a, b) => a.days_to_notice - b.days_to_notice);
  const overDeployed = rows.filter((r) => r.trueup > 0);
  const savings = (optimisation.data ?? []).filter((o) => o.annual_saving > 0).slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard title="Annual Contract Value" value={show(k.acv, formatINR)} icon={<BadgeIndianRupee size={20} />}
          sub={`${formatNumber(k.contracts_active)} active contracts · ${formatNumber(k.products)} products`}
          tooltip="Sum of the annual value of every active contract at the as-of date. With a region filter, each contract is apportioned by that region's share of purchased seats." />
        <KpiCard title={`${meta.fyLabel} Spend to Date`} value={show(k.ytd_actual, formatINR)} icon={<Wallet size={20} />}
          delta={k.ytd_variance_pct != null ? `${formatSignedPct(k.ytd_variance_pct)} vs budget` : null} deltaTone={k.ytd_variance_pct > 0 ? 'bad' : 'good'}
          sub={`forecast ${formatINR(k.fy_forecast)} of ${formatINR(k.fy_budget)} budget`}
          tooltip="Actual spend April → as-of month against budget for the same months; forecast = spend to date + average of the last 3 months × remaining months." />
        <KpiCard title="Licence Utilisation" value={show(k.utilisation, (v) => formatPct(v))} icon={<UserCheck size={20} />}
          delta={utilDelta != null ? `${formatSignedPct(utilDelta, 1, ' pts')} vs ${prevLabel}` : null} deltaTone={utilDelta > 0 ? 'good' : utilDelta < 0 ? 'bad' : 'neutral'}
          sub={`target ${formatPct(meta.target, 0)}`}
          tooltip="Seats with a login in the last 30 days ÷ seats purchased (latest month)." />
        <KpiCard title="Shelfware Cost" value={show(k.shelfware, formatINR)} icon={<TrendingDown size={20} />}
          delta={shelfDelta != null ? `${formatSignedPct(shelfDelta)} vs ${prevLabel}` : null} deltaTone={shelfDelta > 0 ? 'bad' : 'good'}
          sub={`${formatINR(k.shelf_unassigned)} unassigned · ${formatINR(k.shelf_dormant)} dormant`}
          tooltip="Annualised cost of unassigned seats plus assigned seats with no login in 90 days." />
        <KpiCard title="Savings at Renewal (12 mo)" value={show(k.savings_at_renewal_12m, formatINR)} icon={<PiggyBank size={20} />}
          sub="shelfware on contracts renewing within a year"
          tooltip="Shelfware on contracts ending within 365 days: what right-sizing at the next renewal can realistically save." />
        <KpiCard title="Renewals in 90 Days" value={show(k.renewal_exposure, formatINR)} icon={<CalendarClock size={20} />}
          delta={k.decisions_due ? `${k.decisions_due} decision${k.decisions_due > 1 ? 's' : ''} due ≤ 30 d` : null} deltaTone="bad"
          sub={`${formatNumber(k.renewal_count)} contracts · uplift exposure ${formatINR(k.uplift_exposure_12m)} (12 mo)`}
          tooltip="Annual value of contracts ending within 90 days. Decisions due = notice deadline within 30 days. Uplift exposure = quoted (or capped) increase on contracts renewing in 12 months." />
        <KpiCard title="True-up Risk" value={show(k.trueup, formatINR)} icon={<Scale size={20} />}
          sub={k.trueup_products ? `${k.trueup_products} product over-deployed` : 'no over-deployment'}
          onClick={overDeployed.length ? () => open.product(overDeployed[0].software_id, 'Usage') : undefined}
          tooltip="Seats assigned beyond the purchased entitlement × unit price × 12. Click to open the product." />
        <KpiCard title="Cost per Active User" value={show(k.cost_per_active_user, (v) => `${formatINR(v)}/mo`)} icon={<Users size={20} />}
          tooltip="Monthly licence cost of the purchased entitlement ÷ seats active in the last 30 days." />
      </div>

      {(decisions.length > 0 || k.doc_gaps_critical > 0 || k.disputed_invoices > 0 || k.overdue_invoices > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {decisions.map((r) => (
            <button key={r.software_id} type="button" onClick={() => open.contract(r.contract_id)}
              className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-left hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-sky-500">
              <AlarmClock size={18} className="mt-0.5 text-red-700 shrink-0" aria-hidden="true" />
              <span className="text-sm text-red-900"><span className="font-semibold">{r.software_name}: notice due in {r.days_to_notice} d</span>
                <span className="block text-xs">{r.auto_renew ? 'Auto-renews' : 'Ends'} {formatDate(r.end_date)} · {formatINR(r.annual_cost)}/yr</span></span>
            </button>
          ))}
          {(k.disputed_invoices > 0 || k.overdue_invoices > 0) && (
            <Link to="/licensing-subs/spend#invoices" className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-sky-500">
              <ReceiptIndianRupee size={18} className="mt-0.5 text-amber-700 shrink-0" aria-hidden="true" />
              <span className="text-sm text-amber-900"><span className="font-semibold">{k.disputed_invoices} disputed · {k.overdue_invoices} overdue invoice{k.overdue_invoices === 1 ? '' : 's'}</span>
                <span className="block text-xs">{formatINR(k.problem_invoice_value)} incl. GST held up</span></span>
            </Link>
          )}
          {k.doc_gaps_critical > 0 && (
            <button type="button" onClick={() => open.docs({ gaps: true })}
              className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-sky-500">
              <FileWarning size={18} className="mt-0.5 text-amber-700 shrink-0" aria-hidden="true" />
              <span className="text-sm text-amber-900"><span className="font-semibold">{k.doc_gaps_critical} critical documentation gaps</span>
                <span className="block text-xs">{k.missing_signed_msa} unsigned MSA · {k.saas_without_dpa} SaaS without DPA · {k.assessments_attention} vendor assessments</span></span>
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Panel title="Value-for-money matrix" actions={<SeeMore to="/licensing-subs/usage">Usage</SeeMore>}
          tooltip="Each bubble is a product: utilisation (x) vs annual cost (y), size = seats. Top-left 'Optimise' = expensive and under-used.">
          <ValueMatrix data={rows} target={meta.target} onSelect={(id) => open.product(id)} />
        </Panel>
        <Panel title="Renewals · next 12 months" actions={<SeeMore to="/licensing-subs/renewals">Renewals</SeeMore>}
          tooltip="Decision window per contract: notice deadline (tick) to contract end (dot). Select a row to open the contract.">
          {k.as_of ? <RenewalTimeline data={rows} asOf={k.as_of} onSelect={(id) => { const r = rows.find((x) => x.software_id === id); if (r) open.contract(r.contract_id); }} /> : <p className="text-sm text-slate-500">Loading…</p>}
        </Panel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Panel title="Spend by category · FY to date" actions={<SeeMore to="/licensing-subs/spend">Spend</SeeMore>}
          tooltip="Actual spend this fiscal year by software category.">
          <div style={{ height: Math.max(220, (breakdown.data?.by_category.length ?? 0) * 26 + 40) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={breakdown.data?.by_category ?? []} layout="vertical" margin={{ top: 4, right: 48, left: 8, bottom: 0 }}>
                <CartesianGrid stroke={INK.grid} horizontal={false} />
                <XAxis type="number" tickFormatter={formatINRAxis} tick={axisTick} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="category" width={110} tick={{ fontSize: 12, fill: INK.secondary }} tickLine={false} axisLine={{ stroke: INK.axis }} />
                <Tooltip formatter={(v) => [formatINR(v), 'Actual']} {...tooltipStyle} cursor={{ fill: '#f1f5f9' }} />
                <Bar dataKey="actual" fill={SERIES[0]} radius={[0, 4, 4, 0]} maxBarSize={14} label={{ position: 'right', fill: INK.secondary, fontSize: 11, formatter: formatINR }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Top savings at renewal" actions={<SeeMore to="/licensing-subs/usage">Optimisation</SeeMore>} flush
          tooltip="Editions where purchased seats exceed 110% of 90-day active users; saving if reduced at renewal.">
          <ul className="divide-y divide-slate-100">
            {savings.map((o) => (
              <li key={`${o.software_id}-${o.edition}`}>
                <button type="button" onClick={() => open.product(o.software_id, 'Usage')} className="flex w-full items-center justify-between gap-3 px-4 sm:px-5 py-3 text-left hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500">
                  <span className="min-w-0"><span className="block text-sm font-medium text-slate-900">{o.software_name} · {o.edition}</span>
                    <span className="block text-xs text-slate-500">{formatNumber(o.purchased)} → {formatNumber(o.recommended)} seats · renews {formatDate(o.end_date)}</span></span>
                  <span className="shrink-0 text-sm font-semibold text-green-800 tabular-nums">{formatINR(o.annual_saving)}/yr</span>
                </button>
              </li>
            ))}
            {optimisation.data && !savings.length && <li className="px-5 py-4 text-sm text-slate-500">No reduction opportunities.</li>}
          </ul>
        </Panel>
        <Panel title="Documentation gaps" actions={<SeeMore to="/licensing-subs/documents">Documents</SeeMore>}
          tooltip="Missing or unsigned agreements, quotes awaiting signature, vendor assessments and invoice disputes.">
          <DocGapsList limit={6} />
          {k.doc_gaps > 6 && <p className="mt-2 text-xs text-slate-500"><TriangleAlert size={12} className="inline mr-1" aria-hidden="true" />{k.doc_gaps - 6} more on the Documents page.</p>}
        </Panel>
      </div>

      <Panel title="Subscription register" flush tooltip="Every subscription with cost, usage and renewal status. Select a product for the drill-down, or Documents for its files.">
        <SubscriptionRegister rows={rows} target={meta.target} onSelect={(id) => open.product(id)} onDocuments={(id) => open.docs({ software: id })} />
      </Panel>
    </div>
  );
}
