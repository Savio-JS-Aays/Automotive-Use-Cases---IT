import { CircleAlert, ExternalLink, TriangleAlert } from 'lucide-react';
import { useRpc } from '../../../hooks/useRpc';
import { useLicensing } from '../LicensingContext';

/** Documentation and invoice gaps (it_lic_doc_gaps), most severe first, each with a link to act on it. */
export default function DocGapsList({ limit }) {
  const { filters, open } = useLicensing();
  const { data, loading } = useRpc('it_lic_doc_gaps', { p_filters: filters });
  const rows = limit ? (data ?? []).slice(0, limit) : data ?? [];
  if (loading && !data) return <p className="text-sm text-slate-500">Loading…</p>;
  if (!rows.length) return <p className="text-sm text-slate-500">No documentation gaps.</p>;
  return (
    <ul className="divide-y divide-slate-100">
      {rows.map((g, i) => {
        const critical = g.severity === 'critical';
        const Icon = critical ? CircleAlert : TriangleAlert;
        return (
          <li key={i} className="flex items-start gap-2 py-2.5">
            <Icon size={16} className={`mt-0.5 shrink-0 ${critical ? 'text-red-600' : 'text-amber-600'}`} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-900">{g.kind}</p>
              <p className="text-xs text-slate-500">{g.title}{g.note ? ` · ${g.note}` : ''}</p>
              <div className="-ml-2 mt-0.5 flex flex-wrap text-xs">
              {g.file_url && (
                <a href={g.file_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium text-sky-700 hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-500">
                  <ExternalLink size={13} aria-hidden="true" />Document
                </a>
              )}
              {g.contract_id && <button type="button" onClick={() => open.contract(g.contract_id)} className="rounded-md px-2 py-1 font-medium text-sky-700 hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-500">Contract</button>}
              {g.vendor_id && <button type="button" onClick={() => open.vendor(g.vendor_id)} className="rounded-md px-2 py-1 font-medium text-sky-700 hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-500">Vendor</button>}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
