import { useMemo, useState } from 'react';
import { CheckCircle2, Download, ExternalLink, Eye, FileText, Search, TriangleAlert } from 'lucide-react';
import { useRpc } from '../../hooks/useRpc';
import { formatDate, formatINR } from '../../lib/format';
import { useLicensing } from './LicensingContext';
import { DOC_TYPES } from './constants';

const STATUSES = [
  { value: '', label: 'Any status' },
  { value: 'current', label: 'Current' },
  { value: 'superseded', label: 'Superseded' },
  { value: 'unsigned', label: 'Unsigned / awaiting' },
  { value: 'expiring', label: 'Expiring ≤ 90 d' },
];

function Badge({ tone, children }) {
  const cls = {
    good: 'bg-green-50 text-green-800 border-green-200',
    warn: 'bg-amber-50 text-amber-800 border-amber-200',
    bad: 'bg-red-50 text-red-700 border-red-200',
    muted: 'bg-slate-100 text-slate-600 border-slate-200',
  }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${cls}`}>{children}</span>;
}

function stateBadge(d, asOf) {
  if (d.doc_type === 'Invoice') {
    const tone = { Paid: 'good', Due: 'muted', Overdue: 'warn', Disputed: 'bad' }[d.invoice_status] ?? 'muted';
    return <Badge tone={tone}>{d.invoice_status}{d.invoice_amount ? ` · ${formatINR(d.invoice_amount)}` : ''}</Badge>;
  }
  if (d.doc_type === 'Security Assessment') {
    const days = d.expiry_date && asOf ? Math.round((new Date(d.expiry_date) - new Date(asOf)) / 86400000) : null;
    if (days !== null && days < 0) return <Badge tone="bad"><TriangleAlert size={12} aria-hidden="true" />Expired {formatDate(d.expiry_date)}</Badge>;
    if (days !== null && days <= 90) return <Badge tone="warn">Expires in {days} d</Badge>;
    return <Badge tone="good"><CheckCircle2 size={12} aria-hidden="true" />Valid to {formatDate(d.expiry_date)}</Badge>;
  }
  if (d.is_signed) return <Badge tone="good"><CheckCircle2 size={12} aria-hidden="true" />Signed</Badge>;
  if (d.doc_type === 'Renewal Quote') return <Badge tone="warn">Awaiting signature</Badge>;
  return <Badge tone="bad"><TriangleAlert size={12} aria-hidden="true" />Unsigned draft</Badge>;
}

const chipCls = 'rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] text-sky-700 hover:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-500';

/**
 * Licensing documents at every level (contract, vendor, invoice), from it_lic_documents.
 * scope: RPC keys { software, contract, vendor, invoice, doc_type } merged with the page filters.
 * Each document links back to the product, contract, vendor and invoice it belongs to.
 */
export default function DocumentList({ scope = {}, showFilters = true, initialType = '', initialStatus = '', withPageFilters = false, pageSize = 0 }) {
  const { filters: pageFilters, meta, open } = useLicensing();
  const [query, setQuery] = useState('');
  const [type, setType] = useState(initialType);
  const [status, setStatus] = useState(initialStatus);
  const [preview, setPreview] = useState(null);
  const [limit, setLimit] = useState(pageSize);

  const args = useMemo(() => ({
    p_filters: {
      ...(withPageFilters ? { vertical: pageFilters.vertical, vendor: pageFilters.vendor, category: pageFilters.category } : {}),
      ...scope,
      doc_type: type || scope.doc_type || null,
      doc_status: status || null,
    },
  }), [scope, type, status, withPageFilters, pageFilters]);
  const { data, loading, error } = useRpc('it_lic_documents', args);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const byKey = new Map();
    for (const d of data ?? []) {
      if (q && !`${d.title} ${d.software_name ?? ''} ${d.vendor_name} ${d.contract_id ?? ''} ${d.invoice_id ?? ''}`.toLowerCase().includes(q)) continue;
      if (!byKey.has(d.group_key)) byKey.set(d.group_key, { key: d.group_key, first: d, docs: [] });
      byKey.get(d.group_key).docs.push(d);
    }
    return [...byKey.values()];
  }, [data, query]);
  const count = groups.reduce((n, g) => n + g.docs.length, 0);
  const visible = limit ? groups.slice(0, limit) : groups;

  if (error) return <p className="text-sm text-red-700">{error.message}</p>;

  return (
    <div className="space-y-4">
      {showFilters && (
        <div className="flex flex-col sm:flex-row gap-2">
          <label className="relative flex-1">
            <span className="sr-only">Search documents</span>
            <Search size={16} className="absolute left-3 top-2.5 text-slate-400" aria-hidden="true" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search product, vendor, contract, invoice…"
              className="w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
          </label>
          <label>
            <span className="sr-only">Document type</span>
            <select value={type} onChange={(e) => setType(e.target.value)} className="w-full sm:w-auto rounded-md border border-slate-300 bg-white py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500">
              <option value="">All types</option>
              {DOC_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label>
            <span className="sr-only">Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full sm:w-auto rounded-md border border-slate-300 bg-white py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500">
              {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
        </div>
      )}
      <p className="text-xs text-slate-500">{loading ? 'Loading documents…' : `${count} document${count === 1 ? '' : 's'}`}</p>

      {preview && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
            <p className="text-sm font-medium text-slate-800 truncate">{preview.title}</p>
            <button type="button" onClick={() => setPreview(null)} className="text-xs font-medium text-slate-600 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 rounded px-2 py-1">Close preview</button>
          </div>
          <iframe title={`Preview: ${preview.title}`} src={preview.file_url} className="w-full h-[60vh] bg-slate-100" />
        </div>
      )}

      {!loading && !count && <p className="text-sm text-slate-500">No documents match.</p>}

      {visible.map((g) => {
        const f = g.first;
        const vendorLevel = !f.contract_id;
        return (
          <section key={g.key} className="rounded-xl border border-slate-200 bg-white">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">
                  {vendorLevel ? `${f.vendor_name} — vendor documents` : f.software_name}
                  {!vendorLevel && <span className="font-normal text-slate-500"> · {f.vendor_name}</span>}
                </p>
                {!vendorLevel && <p className="text-xs text-slate-500">{f.contract_id} · {f.contract_status === 'Expired' ? 'expired' : 'ends'} {formatDate(f.end_date)}</p>}
              </div>
              <div className="flex flex-wrap gap-1">
                {f.software_id && <button type="button" className={chipCls} onClick={() => open.product(f.software_id)}>Product</button>}
                {f.contract_id && <button type="button" className={chipCls} onClick={() => open.contract(f.contract_id)}>Contract</button>}
                <button type="button" className={chipCls} onClick={() => open.vendor(f.vendor_id)}>Vendor</button>
              </div>
            </header>
            <ul className="divide-y divide-slate-100">
              {g.docs.map((d) => (
                <li key={d.document_id} className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3">
                  <FileText size={18} className="hidden sm:block text-slate-400 shrink-0" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-800">{d.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                      <Badge tone="muted">{d.doc_type}</Badge>
                      <span>v{d.version}</span>
                      <span>· {formatDate(d.effective_date)}</span>
                      {!d.is_current && <Badge tone="warn">Superseded</Badge>}
                      {stateBadge(d, meta.as_of)}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button type="button" onClick={() => setPreview(d)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-sky-700 hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-500">
                      <Eye size={14} aria-hidden="true" />Preview
                    </button>
                    <a href={d.file_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-sky-700 hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-500">
                      <ExternalLink size={14} aria-hidden="true" />Open
                    </a>
                    <a href={d.file_url} download className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-sky-700 hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-500">
                      <Download size={14} aria-hidden="true" />Download
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {limit > 0 && groups.length > limit && (
        <button type="button" onClick={() => setLimit(0)} className="w-full rounded-lg border border-slate-300 bg-white py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500">
          Show all {groups.length} groups ({count} documents)
        </button>
      )}
      <p className="text-xs text-slate-400">All documents are synthetic samples generated for this demo.</p>
    </div>
  );
}
