import { useState } from 'react';
import { FileText } from 'lucide-react';
import { formatDate, formatINR } from '../../../lib/format';
import { downloadCsv } from '../../../lib/csv';
import { INVOICE_STYLE } from '../constants';
import { useLicensing } from '../LicensingContext';

const STATUSES = ['All', 'Paid', 'Due', 'Overdue', 'Disputed'];

/** Invoice register (it_lic_invoices rows). Each row links to its PDF and to its contract. */
export default function InvoiceTable({ rows = [], loading, compact = false }) {
  const { open } = useLicensing();
  const [status, setStatus] = useState('All');
  const shown = rows.filter((r) => status === 'All' || r.status === status);
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 py-2 border-b border-slate-100 text-xs text-slate-500">
        <span>{loading ? 'Loading…' : `${shown.length} invoice${shown.length === 1 ? '' : 's'} · ${formatINR(shown.reduce((s, r) => s + Number(r.total_inr), 0))} incl. GST`}</span>
        <div className="flex items-center gap-2">
          <label>
            <span className="sr-only">Invoice status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-md border border-slate-300 bg-white py-1 px-2 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500">
              {STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <button type="button" disabled={!shown.length} onClick={() => downloadCsv('invoices.csv', shown, [
            { key: 'invoice_id', label: 'Invoice' }, { key: 'software_name', label: 'Product' }, { key: 'vendor_name', label: 'Vendor' },
            { key: 'contract_id', label: 'Contract' }, { key: 'invoice_date', label: 'Invoice date' }, { key: 'due_date', label: 'Due date' },
            { key: 'amount_inr', label: 'Amount (INR)' }, { key: 'tax_inr', label: 'GST (INR)' }, { key: 'status', label: 'Status' }, { key: 'note', label: 'Note' },
          ])} className="rounded-md border border-slate-300 bg-white px-2 py-1 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-sky-500">Export CSV</button>
        </div>
      </div>
      <div className={`overflow-x-auto ${compact ? 'max-h-80' : 'max-h-[28rem]'}`}>
        <table className="w-full text-sm text-left text-slate-600">
          <thead className="text-xs uppercase bg-slate-50 text-slate-500 border-b border-slate-200 sticky top-0">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-semibold">Invoice</th>
              {!compact && <th scope="col" className="px-4 py-2.5 font-semibold">Vendor</th>}
              <th scope="col" className="px-4 py-2.5 font-semibold">Date / due</th>
              <th scope="col" className="px-4 py-2.5 font-semibold text-right">Amount</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Status</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Links</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.invoice_id} className="border-b border-slate-100 align-top">
                <td className="px-4 py-2.5 min-w-[14rem]">
                  <span className="block font-medium text-slate-900">{r.description}</span>
                  <span className="block text-xs text-slate-500">{r.invoice_id}</span>
                </td>
                {!compact && <td className="px-4 py-2.5 whitespace-nowrap">{r.vendor_name}</td>}
                <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">{formatDate(r.invoice_date)}<span className="block text-xs text-slate-500">due {formatDate(r.due_date)}</span></td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap tabular-nums">{formatINR(r.amount_inr)}<span className="block text-xs text-slate-500">+ GST {formatINR(r.tax_inr)}</span></td>
                <td className="px-4 py-2.5">
                  <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${INVOICE_STYLE[r.status]}`}>{r.status}{r.days_past_due > 0 ? ` · ${r.days_past_due} d` : ''}</span>
                  {r.note && <span className="mt-1 block max-w-[14rem] text-xs text-slate-500">{r.note}</span>}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {r.file_url && (
                      <a href={r.file_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-sky-700 hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-500">
                        <FileText size={14} aria-hidden="true" />PDF
                      </a>
                    )}
                    <button type="button" onClick={() => open.contract(r.contract_id)} className="rounded-md px-2 py-1 text-xs font-medium text-sky-700 hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-500">Contract</button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && !shown.length && <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500">No invoices match.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
