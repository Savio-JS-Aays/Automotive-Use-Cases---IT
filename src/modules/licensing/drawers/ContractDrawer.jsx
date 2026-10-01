import { useState } from 'react';
import { ArrowRight, CheckCircle2, Download, ExternalLink, TriangleAlert } from 'lucide-react';
import Drawer from '../../../components/Drawer';
import { useRpc } from '../../../hooks/useRpc';
import { formatDate, formatINR, formatNumber, formatSignedPct } from '../../../lib/format';
import { INVOICE_STYLE } from '../constants';
import { useLicensing } from '../LicensingContext';

const TABS = ['Terms', 'History', 'Documents', 'Invoices'];

function Fact({ label, children }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-sm font-medium text-slate-900">{children}</dd>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-600">{title}</h3>
      {children}
    </section>
  );
}

/** Contract drill-down: terms and quote, renewal history with price change, full document timeline, invoices. */
export default function ContractDrawer({ contractId, onClose }) {
  const { open } = useLicensing();
  const [tab, setTab] = useState('Terms');
  const { data, loading, error } = useRpc('it_lic_contract_detail', { p_contract_id: contractId });
  const c = data?.contract;

  return (
    <Drawer open onClose={onClose} title={c ? c.contract_name : contractId}
      subtitle={c ? `${c.contract_id} · ${c.vendor_name} · ${c.status}` : error ? error.message : 'Loading…'}>
      {loading && !c && <p className="text-sm text-slate-500">Loading…</p>}
      {c && (
        <>
          <div className="mb-3 flex flex-wrap gap-2 text-xs">
            <button type="button" onClick={() => open.product(c.software_id)} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 font-medium text-sky-700 hover:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-500">Product: {c.software_name} <ArrowRight size={12} aria-hidden="true" /></button>
            <button type="button" onClick={() => open.vendor(c.vid)} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 font-medium text-sky-700 hover:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-500">Vendor: {c.vendor_name} <ArrowRight size={12} aria-hidden="true" /></button>
          </div>
          <div role="tablist" aria-label="Contract views" className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
            {TABS.map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-sky-500 ${tab === t ? 'border-sky-600 text-sky-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
                {t === 'Documents' ? `Documents (${data.documents.length})` : t === 'Invoices' ? `Invoices (${data.invoices.length})` : t}
              </button>
            ))}
          </div>

          {tab === 'Terms' && (
            <div className="space-y-4">
              <Section title="Terms">
                <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <Fact label="Annual value">{formatINR(c.annual_value_inr)}</Fact>
                  <Fact label="Term">{formatDate(c.start_date)} – {formatDate(c.end_date)}</Fact>
                  <Fact label="Billing">{c.billing_frequency}</Fact>
                  <Fact label="Notice deadline">
                    <span className={c.status === 'Active' && c.days_to_notice <= 30 ? 'text-red-700' : ''}>{formatDate(c.notice_deadline)}{c.status === 'Active' ? ` (${c.days_to_notice} d)` : ''}</span>
                  </Fact>
                  <Fact label="Auto-renew">{c.auto_renew ? 'Yes' : 'No'} · cap {c.uplift_cap_pct}%</Fact>
                  <Fact label="Contract currency">{c.original_currency} (paid in INR)</Fact>
                  <Fact label="Cost centre">{c.cost_center_vertical}</Fact>
                  <Fact label="Procurement owner">{c.procurement_owner}</Fact>
                  <Fact label="Deployment">{c.deployment}</Fact>
                </dl>
              </Section>
              {c.renewal_quote_inr && (
                <Section title="Renewal quote vs current">
                  <dl className="grid grid-cols-3 gap-4">
                    <Fact label="Current annual">{formatINR(c.annual_value_inr)}</Fact>
                    <Fact label="Quoted annual">{formatINR(c.renewal_quote_inr)}</Fact>
                    <Fact label="Increase"><span className="text-red-700">{formatINR(c.renewal_quote_inr - c.annual_value_inr)} ({formatSignedPct(c.renewal_quote_inr / c.annual_value_inr - 1)})</span></Fact>
                  </dl>
                </Section>
              )}
              {data.entitlements.length > 0 && (
                <Section title="Entitlements">
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase text-slate-500"><tr>
                      <th scope="col" className="text-left py-1.5">Edition</th><th scope="col" className="text-left py-1.5">Metric</th>
                      <th scope="col" className="text-right py-1.5">Seats</th><th scope="col" className="text-right py-1.5">₹ / seat / month</th><th scope="col" className="text-right py-1.5">₹ / yr</th>
                    </tr></thead>
                    <tbody className="tabular-nums">
                      {data.entitlements.map((e) => (
                        <tr key={e.edition} className="border-t border-slate-100">
                          <td className="py-1.5 font-medium text-slate-900">{e.edition}</td><td className="py-1.5 text-slate-600">{e.license_metric}</td>
                          <td className="py-1.5 text-right">{formatNumber(e.seats_purchased)}</td>
                          <td className="py-1.5 text-right">{formatINR(e.unit_price_inr_month, { compact: false })}</td>
                          <td className="py-1.5 text-right">{formatINR(e.annual_cost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Section>
              )}
            </div>
          )}

          {tab === 'History' && (
            <Section title="Renewal history">
              <ol className="relative ml-2 border-l border-slate-200">
                {data.history.map((h) => (
                  <li key={h.contract_id} className="mb-4 ml-4 last:mb-0">
                    <span className={`absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full ${h.status === 'Active' ? 'bg-sky-600' : 'bg-slate-400'}`} aria-hidden="true" />
                    <button type="button" onClick={() => open.contract(h.contract_id)} disabled={h.contract_id === c.contract_id}
                      className="text-left text-sm font-medium text-slate-900 enabled:hover:text-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 rounded">
                      {h.contract_id} · {h.status}{h.contract_id === c.contract_id ? ' (this contract)' : ''}
                    </button>
                    <p className="text-xs text-slate-500">{formatDate(h.start_date)} – {formatDate(h.end_date)} · {formatINR(h.annual_value)}/yr
                      {h.change_pct != null && <span className={h.change_pct > 0 ? 'text-red-700' : 'text-green-800'}> · {formatSignedPct(h.change_pct)} at renewal</span>}
                    </p>
                  </li>
                ))}
                {c.renewal_quote_inr && (
                  <li className="ml-4">
                    <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-amber-500 bg-white" aria-hidden="true" />
                    <p className="text-sm font-medium text-slate-900">Next term (quoted, not signed)</p>
                    <p className="text-xs text-slate-500">{formatINR(c.renewal_quote_inr)}/yr · {formatSignedPct(c.renewal_quote_inr / c.annual_value_inr - 1)}</p>
                  </li>
                )}
              </ol>
            </Section>
          )}

          {tab === 'Documents' && (
            <Section title="Document timeline">
              <ul className="divide-y divide-slate-100">
                {data.documents.map((d) => (
                  <li key={d.document_id} className="flex flex-col sm:flex-row sm:items-center gap-2 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-800">{d.title}</p>
                      <p className="text-xs text-slate-500">
                        {d.doc_type} · v{d.version} · {formatDate(d.effective_date)}{!d.is_current ? ' · superseded' : ''}
                        {d.doc_type !== 'Invoice' && (d.is_signed
                          ? <span className="ml-1 inline-flex items-center gap-0.5 text-green-800"><CheckCircle2 size={12} aria-hidden="true" />signed</span>
                          : <span className="ml-1 inline-flex items-center gap-0.5 text-red-700"><TriangleAlert size={12} aria-hidden="true" />{d.doc_type === 'Renewal Quote' ? 'awaiting signature' : 'unsigned'}</span>)}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <a href={d.file_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-sky-700 hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-500"><ExternalLink size={13} aria-hidden="true" />Open</a>
                      <a href={d.file_url} download className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-sky-700 hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-500"><Download size={13} aria-hidden="true" />Download</a>
                    </div>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => open.docs({ contract: c.contract_id })} className="mt-3 text-xs font-medium text-sky-700 hover:underline focus:outline-none focus:ring-2 focus:ring-sky-500 rounded">Preview in the document viewer</button>
            </Section>
          )}

          {tab === 'Invoices' && (
            <Section title="Invoices">
              {!data.invoices.length && <p className="text-sm text-slate-500">No invoices in the period (Apr-2025 onwards).</p>}
              <ul className="divide-y divide-slate-100">
                {data.invoices.map((i) => (
                  <li key={i.invoice_id} className="flex flex-col sm:flex-row sm:items-center gap-2 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-800">{i.description}</p>
                      <p className="text-xs text-slate-500">{i.invoice_id} · {formatDate(i.invoice_date)} · due {formatDate(i.due_date)}{i.note ? ` · ${i.note}` : ''}</p>
                    </div>
                    <span className="text-sm tabular-nums text-slate-900">{formatINR(i.amount_inr)}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${INVOICE_STYLE[i.status]}`}>{i.status}</span>
                    {i.file_url && <a href={i.file_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-sky-700 hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-500"><ExternalLink size={13} aria-hidden="true" />PDF</a>}
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </>
      )}
    </Drawer>
  );
}
