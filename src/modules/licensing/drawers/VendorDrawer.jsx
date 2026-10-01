import { useMemo, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Drawer from '../../../components/Drawer';
import { useRpc } from '../../../hooks/useRpc';
import { formatDate, formatINR, formatINRAxis, formatMonth, formatPct } from '../../../lib/format';
import { INK, SERIES, axisTick, gridProps, tooltipStyle } from '../../../lib/chartTheme';
import DocumentList from '../DocumentList';
import InvoiceTable from '../tables/InvoiceTable';
import { RECOMMENDATION_STYLE } from '../constants';
import { useLicensing } from '../LicensingContext';

const TABS = ['Overview', 'Contracts', 'Invoices', 'Documents'];

function Fact({ label, children }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-sm font-medium text-slate-900">{children}</dd>
    </div>
  );
}

/** Vendor drill-down: profile, spend trend, products, contracts, invoices and every vendor document. */
export default function VendorDrawer({ vendorId, onClose }) {
  const { open } = useLicensing();
  const [tab, setTab] = useState('Overview');
  const { data, loading, error } = useRpc('it_lic_vendor_detail', { p_vendor_id: vendorId });
  const v = data?.vendor;
  const spend = useMemo(() => (data?.spend ?? []).map((m) => ({ ...m, label: formatMonth(m.month) })), [data]);

  return (
    <Drawer open onClose={onClose} title={v ? v.vendor_name : vendorId}
      subtitle={v ? `${v.vendor_category} · ${v.hq_country} · risk ${v.risk_tier}${v.preferred ? ' · preferred supplier' : ''}` : error ? error.message : 'Loading…'}>
      {loading && !v && <p className="text-sm text-slate-500">Loading…</p>}
      {v && (
        <>
          <div role="tablist" aria-label="Vendor views" className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
            {TABS.map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-sky-500 ${tab === t ? 'border-sky-600 text-sky-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
                {t === 'Contracts' ? `Contracts (${data.contracts.length})` : t === 'Invoices' ? `Invoices (${data.invoices.length})` : t}
              </button>
            ))}
          </div>

          {tab === 'Overview' && (
            <div className="space-y-4">
              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <Fact label="Risk tier">{v.risk_tier}</Fact>
                  <Fact label="Support tier">{v.support_tier}</Fact>
                  <Fact label="Payment terms">{v.payment_terms_days ? `Net ${v.payment_terms_days} days` : '—'}</Fact>
                  <Fact label="Certifications">{v.certifications?.length ? v.certifications.join(', ') : <span className="text-red-700">None provided</span>}</Fact>
                  <Fact label="Account team">{v.account_team ?? '—'}</Fact>
                  <Fact label="Preferred supplier">{v.preferred ? 'Yes' : 'No'}</Fact>
                </dl>
              </section>
              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-600">Monthly spend vs budget</h3>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={spend} margin={{ top: 4, right: 8, left: 4, bottom: 0 }}>
                      <CartesianGrid {...gridProps} />
                      <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: INK.axis }} interval="preserveStartEnd" minTickGap={20} />
                      <YAxis tickFormatter={formatINRAxis} tick={axisTick} tickLine={false} axisLine={false} width={60} />
                      <Tooltip formatter={(val, n) => [formatINR(val), n]} {...tooltipStyle} cursor={{ fill: '#f1f5f9' }} />
                      <Legend wrapperStyle={{ fontSize: 12, color: INK.secondary }} />
                      <Bar dataKey="actual" name="Actual" fill={SERIES[0]} radius={[3, 3, 0, 0]} maxBarSize={18} isAnimationActive={false} />
                      <Line dataKey="budget" name="Budget" stroke={INK.secondary} strokeDasharray="5 4" strokeWidth={2} dot={false} isAnimationActive={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </section>
              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-600">Products</h3>
                <ul className="divide-y divide-slate-100">
                  {data.products.map((p) => (
                    <li key={p.software_id} className="flex items-center justify-between gap-3 py-2">
                      <button type="button" onClick={() => open.product(p.software_id)} className="text-left text-sm font-medium text-slate-900 hover:text-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 rounded">
                        {p.software_name}<span className="block text-xs font-normal text-slate-500">{formatINR(p.annual_cost)}/yr · {formatPct(p.utilisation, 0)} utilised · renews {formatDate(p.end_date)}</span>
                      </button>
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${RECOMMENDATION_STYLE[p.recommendation]}`}>{p.recommendation}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          )}

          {tab === 'Contracts' && (
            <ul className="space-y-2">
              {data.contracts.map((c) => (
                <li key={c.contract_id}>
                  <button type="button" onClick={() => open.contract(c.contract_id)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-left hover:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-500">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-slate-900">{c.contract_name}</span>
                      <span className={`text-xs font-medium ${c.status === 'Active' ? 'text-green-800' : 'text-slate-500'}`}>{c.status}</span>
                    </span>
                    <span className="block text-xs text-slate-500">{c.contract_id} · {formatDate(c.start_date)} – {formatDate(c.end_date)} · {formatINR(c.annual_value)}/yr · {c.doc_count} documents{!c.signed_msa ? ' · no signed MSA' : ''}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {tab === 'Invoices' && (
            <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <InvoiceTable rows={data.invoices} compact />
            </section>
          )}

          {tab === 'Documents' && <DocumentList scope={{ vendor: vendorId }} />}
        </>
      )}
    </Drawer>
  );
}
