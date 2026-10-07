import { Armchair, PiggyBank, Scale, UserCheck, UserX, Users } from 'lucide-react';
import KpiCard from '../../../components/KpiCard';
import Panel from '../../../components/Panel';
import { useRpc } from '../../../hooks/useRpc';
import { formatINR, formatNumber, formatPct, formatSignedPct } from '../../../lib/format';
import SeatFunnel from '../charts/SeatFunnel';
import UtilisationTrend from '../charts/UtilisationTrend';
import ReclaimTable from '../tables/ReclaimTable';
import UtilisationHeatmap from '../charts/UtilisationHeatmap';
import DepartmentSeats from '../charts/DepartmentSeats';
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

      <Panel title="Utilisation heatmap" tooltip="Active-30-day ÷ purchased seats. By month: every product and month (trend). By region: where each product's seats are used in the latest month. The % after each product is its latest utilisation. Neutral = at or above the 85% target; darker orange = lower. Select a cell to open the product.">
        <UtilisationHeatmap byMonth={matrix.data?.by_month ?? []} byRegion={matrix.data?.by_region ?? []} target={meta.target ?? 0.85} onProduct={(id) => open.product(id, 'Usage')} />
      </Panel>

      <Panel title="Seats by department" tooltip="Assigned seats by department: active in 30 days, inactive 30–90 days, dormant 90+ days (with annual cost). Filter by product, switch to % of assigned to compare departments of different size, and hide the company-wide pools. Select a bar to filter the reclaim list.">
        <DepartmentSeats filters={filters} products={rows} selected={dept} onSelect={(d) => patch({ dept: d === dept ? null : d })} />
      </Panel>

      <Panel title={`Reclaim candidates${dept ? ` · ${dept}` : ''}`} flush
        actions={dept && <button type="button" onClick={() => patch({ dept: null })} className="text-xs font-medium text-sky-700 hover:underline focus:outline-none focus:ring-2 focus:ring-sky-500 rounded">All departments</button>}
        tooltip="Assigned seats with no login for 90+ days (or never used), most expensive first.">
        <ReclaimTable data={reclaim.data} loading={reclaim.loading} />
      </Panel>
    </div>
  );
}
