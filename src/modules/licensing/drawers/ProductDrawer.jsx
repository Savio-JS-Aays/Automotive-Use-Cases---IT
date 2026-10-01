import { useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Drawer from '../../../components/Drawer';
import { useRpc } from '../../../hooks/useRpc';
import { formatDate, formatINR, formatMonth, formatNumber, formatPct, formatSignedPct } from '../../../lib/format';
import { INK, SERIES, axisTick, gridProps, tooltipStyle } from '../../../lib/chartTheme';
import SeatFunnel from '../charts/SeatFunnel';
import ReclaimTable from '../tables/ReclaimTable';
import InvoiceTable from '../tables/InvoiceTable';
import DocumentList from '../DocumentList';
import { RECOMMENDATION_STYLE } from '../constants';
import { useLicensing } from '../LicensingContext';
import { PriorityBadge } from '../../../components/StatusBadge';

const TABS = ['Overview', 'Usage', 'Spend', 'Reclaim', 'Risk', 'Documents'];
const SEV_TEXT = { Critical: 'text-red-700', High: 'text-amber-700', Medium: 'text-slate-700', Low: 'text-slate-500' };

function reasoning(p, target) {
  if (p.recommendation === 'True-up') {
    return `${formatNumber(p.assigned - p.purchased)} more seats are assigned than purchased. Expect a true-up of about ${formatINR(p.trueup)}/yr; reclaim dormant seats first, then buy the remainder.`;
  }
  if (p.recommendation === 'Right-size') {
    return `Only ${formatPct(p.utilisation, 0)} of purchased seats were used in the last 30 days. Reduce quantities at renewal: ${formatINR(p.shelfware)}/yr is shelfware.`;
  }
  if (p.recommendation === 'Review') {
    return `Utilisation of ${formatPct(p.utilisation, 0)} is below the ${formatPct(target, 0)} target. Reclaim dormant seats (${formatINR(p.shelf_dormant)}/yr) before renewing.`;
  }
  return `Utilisation of ${formatPct(p.utilisation, 0)} meets the ${formatPct(target, 0)} target. Renew on current terms; negotiate the ${p.uplift_cap_pct}% uplift.`;
}

function Fact({ label, children }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-sm font-medium text-slate-900">{children}</dd>
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-600">{title}</h3>
      {children}
    </section>
  );
}

export default function ProductDrawer({ softwareId, onClose, initialTab = 'Overview' }) {
  const { filters, meta, open } = useLicensing();
  const target = meta.target;
  const [tab, setTab] = useState(TABS.includes(initialTab) ? initialTab : 'Overview');
  const id = softwareId;
  const portfolio = useRpc('it_lic_portfolio', { p_filters: { ...filters, vertical: null, vendor: null, category: null, software: id } });
  const product = portfolio.data?.[0];
  const variance = useRpc('it_lic_budget_variance', { p_filters: { region: filters.region, software: id } }, tab === 'Spend');
  const invoices = useRpc('it_lic_invoices', { p_filters: { software: id } }, tab === 'Spend');
  const detail = useRpc('it_lic_product_detail', { p_software_id: id }, Boolean(id));
  const reclaim = useRpc('it_lic_reclaim', { p_filters: { software: id }, p_limit: 300 }, Boolean(id) && tab === 'Reclaim');
  const risk = useRpc('it_lic_product_risk', { p_software_id: id, p_days: 90 }, Boolean(id) && tab === 'Risk');

  if (!product) {
    return (
      <Drawer open onClose={onClose} title={softwareId} subtitle={portfolio.error ? portfolio.error.message : 'Loading…'}>
        <p className="text-sm text-slate-500">{portfolio.loading ? 'Loading…' : 'Product not found for the current filters.'}</p>
      </Drawer>
    );
  }
  const p = product;
  const v = variance.data?.[0];
  const trend = (detail.data?.trend ?? []).map((r) => ({ ...r, label: formatMonth(r.month) }));

  return (
    <Drawer open onClose={onClose} title={p.software_name} subtitle={`${p.vendor_name} · ${p.category} · ${p.business_vertical} · Tier ${p.criticality_tier}`}>
      <div role="tablist" aria-label="Product views" className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-sky-500 ${tab === t ? 'border-sky-600 text-sky-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >
            {t === 'Documents' ? `Documents (${p.doc_count})` : t}
          </button>
        ))}
      </div>

      {tab === 'Overview' && (
        <div className="space-y-4">
          <Panel title="Recommendation">
            <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${RECOMMENDATION_STYLE[p.recommendation]}`}>{p.recommendation}</span>
            <p className="mt-2 text-sm text-slate-700">{reasoning(p, target)}</p>
          </Panel>
          <Panel title="Contract">
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <Fact label="Contract">
                <button type="button" onClick={() => open.contract(p.contract_id)} className="text-sky-700 hover:underline focus:outline-none focus:ring-2 focus:ring-sky-500 rounded">{p.contract_id}</button>
              </Fact>
              <Fact label="Vendor">
                <button type="button" onClick={() => open.vendor(p.vendor_id)} className="text-sky-700 hover:underline focus:outline-none focus:ring-2 focus:ring-sky-500 rounded">{p.vendor_name}</button>
              </Fact>
              <Fact label="Annual value">{formatINR(p.annual_cost)}</Fact>
              <Fact label="Billing">{p.billing_frequency}</Fact>
              <Fact label="Term">{formatDate(p.start_date)} – {formatDate(p.end_date)}</Fact>
              <Fact label="Notice deadline">
                <span className={p.days_to_notice <= 30 ? 'text-red-700' : ''}>{formatDate(p.notice_deadline)} ({p.days_to_notice} d)</span>
              </Fact>
              <Fact label="Auto-renew">{p.auto_renew ? `Yes (uplift cap ${p.uplift_cap_pct}%)` : 'No'}</Fact>
              <Fact label="Contract currency">{p.original_currency} (paid in INR)</Fact>
              <Fact label="Business owner">{p.business_owner}</Fact>
              <Fact label="Deployment">{p.deployment}</Fact>
            </dl>
          </Panel>
          <Panel title="Entitlements (all regions)">
            {detail.loading ? <p className="text-sm text-slate-500">Loading…</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase text-slate-500">
                    <tr>
                      <th scope="col" className="text-left py-2 pr-3">Edition</th>
                      <th scope="col" className="text-left py-2 pr-3">Metric</th>
                      <th scope="col" className="text-right py-2 pr-3">Purchased</th>
                      <th scope="col" className="text-right py-2 pr-3">Assigned</th>
                      <th scope="col" className="text-right py-2 pr-3">Active 30 d</th>
                      <th scope="col" className="text-right py-2 pr-3">₹ / seat / month</th>
                      <th scope="col" className="text-right py-2">₹ / yr</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {(detail.data?.entitlements ?? []).map((e) => (
                      <tr key={e.edition} className="border-t border-slate-100">
                        <td className="py-2 pr-3 font-medium text-slate-900">{e.edition}</td>
                        <td className="py-2 pr-3 text-slate-600">{e.license_metric}</td>
                        <td className="py-2 pr-3 text-right">{formatNumber(e.seats_purchased)}</td>
                        <td className={`py-2 pr-3 text-right ${e.assigned > e.seats_purchased ? 'text-red-700 font-semibold' : ''}`}>{formatNumber(e.assigned)}</td>
                        <td className="py-2 pr-3 text-right">{formatNumber(e.active30)}</td>
                        <td className="py-2 pr-3 text-right">{formatINR(e.unit_price_inr_month, { compact: false })}</td>
                        <td className="py-2 text-right">{formatINR(e.annual_cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      )}

      {tab === 'Usage' && (
        <div className="space-y-4">
          <Panel title="Seat funnel (filtered scope)">
            <SeatFunnel purchased={p.purchased} assigned={p.assigned} active90={p.active90} active30={p.active30} shelfUnassigned={p.shelf_unassigned} shelfDormant={p.shelf_dormant} />
          </Panel>
          <Panel title="Seats by month (all regions)">
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: INK.axis }} interval="preserveStartEnd" />
                  <YAxis tick={axisTick} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => formatNumber(v)} />
                  <Tooltip formatter={(v, n) => [formatNumber(v), n]} {...tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12, color: INK.secondary }} />
                  <Line dataKey="purchased" name="Purchased" stroke={INK.secondary} strokeDasharray="5 4" strokeWidth={2} dot={false} />
                  <Line dataKey="assigned" name="Assigned" stroke={SERIES[1]} strokeWidth={2} dot={false} />
                  <Line dataKey="active30" name="Active 30 d" stroke={SERIES[0]} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Panel>
          <Panel title="By region (latest month)">
            <ul className="space-y-2">
              {(detail.data?.regions ?? []).map((r) => {
                const util = r.purchased ? r.active30 / r.purchased : 0;
                return (
                  <li key={r.region_id} className="grid grid-cols-[90px_1fr_auto] items-center gap-3 text-sm">
                    <span className="text-slate-700">{r.region_name}</span>
                    <span className="h-2 rounded-full bg-slate-100" aria-hidden="true">
                      <span className="block h-full rounded-full" style={{ width: `${Math.min(100, util * 100)}%`, background: SERIES[0] }} />
                    </span>
                    <span className="tabular-nums text-slate-600">{formatPct(util, 0)} · {formatNumber(r.active30)}/{formatNumber(r.purchased)}</span>
                  </li>
                );
              })}
            </ul>
          </Panel>
        </div>
      )}

      {tab === 'Spend' && (
        <div className="space-y-4">
          <Panel title={`Budget · ${meta.fyLabel}`}>
            {!v ? <p className="text-sm text-slate-500">Loading…</p> : (
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <Fact label="FY budget">{formatINR(v.fy_budget)}</Fact>
                <Fact label="Spend to date">{formatINR(v.ytd_actual)} <span className={`text-xs ${v.ytd_variance > 0 ? 'text-red-700' : 'text-green-800'}`}>({formatSignedPct(v.ytd_variance)} vs budget)</span></Fact>
                <Fact label="Full-year forecast">{formatINR(v.forecast)} <span className={`text-xs ${v.forecast_variance > 0 ? 'text-red-700' : 'text-green-800'}`}>({formatSignedPct(v.forecast_variance)})</span></Fact>
                <Fact label="Growth vs last FY (same months)">{formatSignedPct(v.yoy)}</Fact>
                <Fact label="Budget to date">{formatINR(v.ytd_budget)}</Fact>
              </dl>
            )}
          </Panel>
          <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <InvoiceTable rows={invoices.data ?? []} loading={invoices.loading} compact />
          </section>
        </div>
      )}

      {tab === 'Reclaim' && (
        <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <ReclaimTable data={reclaim.data} loading={reclaim.loading} hideProduct />
        </section>
      )}

      {tab === 'Risk' && (
        <div className="space-y-4">
          {risk.error && <p className="text-sm text-amber-800">Operational data is not set up yet (run migrations 004–007).</p>}
          <Panel title="Services running on this product (last 90 days)">
            {risk.loading && <p className="text-sm text-slate-500">Loading…</p>}
            {risk.data && !risk.data.services.length && <p className="text-sm text-slate-500">No monitored IT service runs on this product.</p>}
            <ul className="space-y-1 text-sm">
              {(risk.data?.services ?? []).map((s) => (
                <li key={s.service_id} className="flex justify-between gap-3">
                  <span className="text-slate-800">{s.service_name}</span>
                  <span className={s.availability < s.slo ? 'text-red-700 font-semibold' : 'text-slate-600'}>
                    {formatPct(s.availability, 2)} vs SLO {formatPct(s.slo, 2)} · {s.incidents} incidents
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title={`Incidents (${risk.data?.incidents.length ?? 0})`}>
            <ul className="divide-y divide-slate-100 text-sm">
              {(risk.data?.incidents ?? []).slice(0, 12).map((i) => (
                <li key={i.incident_id} className="flex items-center justify-between gap-3 py-1.5">
                  <span className="text-slate-800">{i.title}<span className="block text-xs text-slate-500">{i.incident_id} · {i.root_cause_type} · {formatDate(i.open_time)} · {i.status}</span></span>
                  <PriorityBadge priority={i.priority} />
                </li>
              ))}
              {risk.data && !risk.data.incidents.length && <li className="py-1.5 text-slate-500">No incidents.</li>}
            </ul>
          </Panel>
          <Panel title={`Open vulnerabilities (${risk.data?.vulnerabilities.length ?? 0})`}>
            <ul className="divide-y divide-slate-100 text-sm">
              {(risk.data?.vulnerabilities ?? []).map((v) => (
                <li key={v.vuln_id} className="flex items-center justify-between gap-3 py-1.5">
                  <span className="text-slate-800">{v.title}<span className="block text-xs text-slate-500">{v.vuln_id} · {v.asset_class} · CVSS {v.cvss} · due {formatDate(v.due_date)}</span></span>
                  <span className={`text-xs font-semibold ${SEV_TEXT[v.severity]}`}>{v.severity}{v.past_sla ? ' · overdue' : ''}</span>
                </li>
              ))}
              {risk.data && !risk.data.vulnerabilities.length && <li className="py-1.5 text-slate-500">No open vulnerabilities.</li>}
            </ul>
          </Panel>
        </div>
      )}

      {tab === 'Documents' && <DocumentList scope={{ software: id }} showFilters={false} />}
    </Drawer>
  );
}
