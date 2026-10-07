import { CheckCircle2, CircleAlert, FileCheck2, FileQuestion, FileWarning, Minus, PenLine, ShieldCheck, TriangleAlert } from 'lucide-react';
import KpiCard from '../../../components/KpiCard';
import Panel from '../../../components/Panel';
import { useRpc } from '../../../hooks/useRpc';
import { formatDate, formatNumber, formatPct } from '../../../lib/format';
import DocumentList from '../DocumentList';
import GapsExplorer from '../tables/GapsExplorer';
import { useLicensing } from '../LicensingContext';

// Status is always shown as an icon + a text label, never colour alone
const CELL = {
  signed: { Icon: CheckCircle2, label: 'Signed', cls: 'text-green-800 bg-green-50' },
  unsigned: { Icon: TriangleAlert, label: 'Unsigned', cls: 'text-red-700 bg-red-50' },
  awaiting: { Icon: PenLine, label: 'Awaiting', cls: 'text-amber-800 bg-amber-50' },
  missing: { Icon: CircleAlert, label: 'Missing', cls: 'text-red-700 bg-red-50' },
  na: { Icon: Minus, label: 'n/a', cls: 'text-slate-400 bg-slate-50' },
};
const ASSESSMENT = {
  valid: { label: 'Valid', cls: 'text-green-800 bg-green-50' },
  expiring: { label: 'Expiring', cls: 'text-amber-800 bg-amber-50' },
  expired: { label: 'Expired', cls: 'text-red-700 bg-red-50' },
  missing: { label: 'Missing', cls: 'text-red-700 bg-red-50' },
};
const INVOICE_CELL = { ok: 'Invoices OK', issue: 'Issue', missing: 'None' };

function MatrixCell({ cell, row, open }) {
  const c = CELL[cell.status];
  const label = `${row.software_name} · ${cell.doc_type}: ${c.label}`;
  const body = (
    <span className={`flex h-9 w-full items-center justify-center gap-1 rounded-md text-xs font-medium ${c.cls}`}>
      <c.Icon size={13} aria-hidden="true" />{c.label}
    </span>
  );
  if (cell.file_url) {
    return <a href={cell.file_url} target="_blank" rel="noopener noreferrer" title={`${label} (open document)`} aria-label={label} className="block rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500 hover:opacity-80">{body}</a>;
  }
  if (cell.status === 'missing') {
    return <button type="button" title={`${label} — no document on file`} aria-label={label} onClick={() => open.docs({ gaps: true })} className="block w-full rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500 hover:opacity-80">{body}</button>;
  }
  return <span title={label}>{body}</span>;
}

/** Documents & Compliance: a coverage matrix (contracts × document types), the gaps to chase, and the full library. */
export default function DocumentsPage() {
  const { filters, kpis, open } = useLicensing();
  const coverage = useRpc('it_lic_doc_coverage', { p_filters: filters });
  const k = kpis.data ?? {};
  const rows = coverage.data ?? [];
  const types = rows[0]?.cells.map((c) => c.doc_type) ?? ['MSA', 'Order Form', 'SLA', 'DPA', 'SOW', 'Renewal Quote'];
  const show = (v, fmt) => (kpis.loading && !kpis.data ? '…' : v === null || v === undefined ? '—' : fmt(v));
  const pct = k.contracts_active ? k.contracts_fully_documented / k.contracts_active : null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard title="Documents" value={show(k.documents, formatNumber)} icon={<FileCheck2 size={20} />}
          sub="contracts, invoices, vendor assessments" onClick={() => open.docs({})} tooltip="All licensing documents in scope. Click to open the library." />
        <KpiCard title="Fully Documented" value={show(pct, (v) => formatPct(v, 0))} icon={<ShieldCheck size={20} />}
          sub={`${formatNumber(k.contracts_fully_documented)} of ${formatNumber(k.contracts_active)} active contracts`}
          tooltip="Active contracts with every required document present and signed (MSA and order form always; SLA/DPA for SaaS; SOW for on-prem)." />
        <KpiCard title="Unsigned MSAs" value={show(k.missing_signed_msa, formatNumber)} icon={<FileWarning size={20} />}
          delta={k.missing_signed_msa ? 'No executed master agreement' : null} deltaTone="bad" tooltip="Active contracts with no signed, current master subscription agreement." />
        <KpiCard title="SaaS Without DPA" value={show(k.saas_without_dpa, formatNumber)} icon={<FileQuestion size={20} />}
          delta={k.saas_without_dpa ? 'DPDP Act exposure' : null} deltaTone="bad" tooltip="SaaS contracts with no data processing agreement on file." />
        <KpiCard title="Quotes Awaiting Signature" value={show(k.quotes_awaiting, formatNumber)} icon={<PenLine size={20} />}
          onClick={() => open.docs({ doc_type: 'Renewal Quote' })} tooltip="Renewal quotes received, not yet countersigned." />
        <KpiCard title="Assessments Needing Action" value={show(k.assessments_attention, formatNumber)} icon={<TriangleAlert size={20} />}
          sub="vendor security assessments expired, expiring ≤ 90 d or missing" tooltip="Vendors with a security assessment that is expired, due within 90 days or missing." />
        <KpiCard title="Disputed / Overdue Invoices" value={show((k.disputed_invoices ?? 0) + (k.overdue_invoices ?? 0), formatNumber)} icon={<CircleAlert size={20} />}
          sub={`${k.disputed_invoices ?? 0} disputed · ${k.overdue_invoices ?? 0} overdue`} tooltip="Invoices held up, often because a contract document is missing or unsigned." />
        <KpiCard title="Open Gaps" value={show(k.doc_gaps, formatNumber)} icon={<FileWarning size={20} />}
          sub={`${formatNumber(k.doc_gaps_critical)} critical`} onClick={() => open.docs({ gaps: true })} tooltip="Everything to chase: missing/unsigned documents, quotes, assessments, invoice problems." />
      </div>

      <Panel title="Coverage matrix" tooltip="Every active contract against the documents it needs. Select a cell to open the document; a missing cell opens the gaps library. n/a = not required for this contract (e.g. SOW only for on-prem).">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm" aria-label="Document coverage by contract">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th scope="col" className="px-2 py-2 text-left font-semibold">Contract</th>
                {types.map((t) => <th key={t} scope="col" className="px-1 py-2 font-semibold whitespace-nowrap">{t}</th>)}
                <th scope="col" className="px-1 py-2 font-semibold">Invoices</th>
                <th scope="col" className="px-1 py-2 font-semibold whitespace-nowrap">Vendor assessment</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const a = r.assessment;
                const as = ASSESSMENT[a.status];
                return (
                  <tr key={r.contract_id} className="border-t border-slate-100">
                    <th scope="row" className="px-2 py-1.5 text-left font-normal">
                      <button type="button" onClick={() => open.contract(r.contract_id)} className="text-left font-medium text-slate-900 hover:text-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 rounded">{r.software_name}</button>
                      <span className="block text-xs text-slate-500">{r.contract_id} · {r.deployment}</span>
                    </th>
                    {r.cells.map((c) => <td key={c.doc_type} className="px-1 py-1"><MatrixCell cell={c} row={r} open={open} /></td>)}
                    <td className="px-1 py-1">
                      <button type="button" onClick={() => open.docs({ contract: r.contract_id, doc_type: 'Invoice' })}
                        className={`flex h-9 w-full items-center justify-center rounded-md text-xs font-medium focus:outline-none focus:ring-2 focus:ring-sky-500 hover:opacity-80 ${r.invoices.status === 'issue' ? 'text-red-700 bg-red-50' : r.invoices.status === 'ok' ? 'text-green-800 bg-green-50' : 'text-slate-400 bg-slate-50'}`}>
                        {r.invoices.status === 'issue' ? `${r.invoices.problem} issue` : r.invoices.count ? `${r.invoices.count} OK` : INVOICE_CELL.missing}
                      </button>
                    </td>
                    <td className="px-1 py-1">
                      {a.file_url
                        ? <a href={a.file_url} target="_blank" rel="noopener noreferrer" title={`${r.vendor_name} assessment: ${as.label}, valid to ${formatDate(a.expiry_date)}`} className={`flex h-9 w-full items-center justify-center rounded-md px-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-sky-500 hover:opacity-80 ${as.cls}`}>{as.label}{a.expiry_date ? ` · ${formatDate(a.expiry_date).slice(3)}` : ''}</a>
                        : <button type="button" onClick={() => open.vendor(r.vendor_id)} title={`${r.vendor_name}: no security assessment on file`} className={`flex h-9 w-full items-center justify-center rounded-md text-xs font-medium focus:outline-none focus:ring-2 focus:ring-sky-500 hover:opacity-80 ${as.cls}`}>{as.label}</button>}
                    </td>
                  </tr>
                );
              })}
              {coverage.loading && !rows.length && <tr><td colSpan={types.length + 3} className="px-2 py-6 text-center text-slate-500">Loading…</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">Cells show an icon and a word, never colour alone: Signed · Unsigned draft · Awaiting countersignature · Missing · n/a (not required).</p>
      </Panel>

      <GapsExplorer products={rows} />

      <Panel title="Document library" tooltip="Every document with search and filters. Preview inline, open in a new tab, download, or jump to the product, contract or vendor it belongs to." flush>
        <div className="p-4 sm:p-5"><DocumentList withPageFilters pageSize={6} /></div>
      </Panel>
    </div>
  );
}
