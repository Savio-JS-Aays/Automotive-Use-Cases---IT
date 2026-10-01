import { useMemo, useState } from 'react';
import { AlarmClock, ArrowDown, ArrowUp, FileText, Search, TriangleAlert } from 'lucide-react';
import { formatDate, formatINR, formatNumber, formatPct } from '../../../lib/format';
import { downloadCsv } from '../../../lib/csv';
import { SERIES, STATUS } from '../../../lib/chartTheme';
import { RECOMMENDATION_STYLE } from '../constants';


const COLUMNS = [
  { key: 'software_name', label: 'Product' },
  { key: 'category', label: 'Category' },
  { key: 'business_vertical', label: 'Vertical' },
  { key: 'annual_cost', label: 'Annual cost', num: true },
  { key: 'utilisation', label: 'Utilisation', num: true },
  { key: 'shelfware', label: 'Shelfware / yr', num: true },
  { key: 'days_to_renewal', label: 'Renewal', num: true },
  { key: 'recommendation', label: 'Action' },
  { key: 'doc_count', label: 'Documents', num: true },
];

function UtilBar({ value, target }) {
  const v = Number(value);
  const color = v < 0.6 ? STATUS.critical : v < target ? STATUS.warning : SERIES[0];
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-2 w-20 rounded-full bg-slate-100" aria-hidden="true">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, v * 100)}%`, background: color }} />
        <div className="absolute -top-0.5 h-3 w-px bg-slate-500" style={{ left: `${target * 100}%` }} />
      </div>
      <span className="tabular-nums">{formatPct(v, 0)}</span>
    </div>
  );
}

/**
 * Sortable, searchable register of every subscription. A row opens the product drawer;
 * the Documents link opens the contract documents directly.
 */
export default function SubscriptionRegister({ rows = [], target = 0.85, onSelect, onDocuments }) {
  const [sort, setSort] = useState({ key: 'annual_cost', dir: 'desc' });
  const [query, setQuery] = useState('');

  const sorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = rows.filter((r) => !q || `${r.software_name} ${r.vendor_name} ${r.category} ${r.business_vertical}`.toLowerCase().includes(q));
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const x = a[sort.key];
      const y = b[sort.key];
      if (typeof x === 'number' || typeof y === 'number') return (Number(x) - Number(y)) * dir;
      return String(x).localeCompare(String(y)) * dir;
    });
  }, [rows, sort, query]);

  const toggle = (key) => setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));

  const exportCsv = () => downloadCsv('subscription-register.csv', sorted, [
    { key: 'software_name', label: 'Product' }, { key: 'vendor_name', label: 'Vendor' }, { key: 'category', label: 'Category' },
    { key: 'business_vertical', label: 'Vertical' }, { key: 'contract_id', label: 'Contract' }, { key: 'annual_cost', label: 'Annual cost (INR)' },
    { key: 'purchased', label: 'Seats purchased' }, { key: 'assigned', label: 'Seats assigned' }, { key: 'active30', label: 'Active 30d' },
    { key: 'utilisation', label: 'Utilisation' }, { key: 'shelfware', label: 'Shelfware (INR/yr)' }, { key: 'end_date', label: 'End date' },
    { key: 'notice_deadline', label: 'Notice deadline' }, { key: 'auto_renew', label: 'Auto-renew' }, { key: 'recommendation', label: 'Action' },
  ]);

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between px-4 sm:px-5 py-3 border-b border-slate-200">
        <label className="relative sm:w-72">
          <span className="sr-only">Search subscriptions</span>
          <Search size={16} className="absolute left-3 top-2.5 text-slate-400" aria-hidden="true" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search product, vendor…" className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
        </label>
        <button type="button" onClick={exportCsv} className="self-start sm:self-auto rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500">Export CSV</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left text-slate-600">
          <thead className="text-xs uppercase bg-slate-50 text-slate-500 border-b border-slate-200">
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key} scope="col" aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={`px-4 py-3 font-semibold whitespace-nowrap ${c.num ? 'text-right' : ''}`}>
                  <button type="button" onClick={() => toggle(c.key)} className="inline-flex items-center gap-1 uppercase focus:outline-none focus:ring-2 focus:ring-sky-500 rounded">
                    {c.label}
                    {sort.key === c.key && (sort.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.software_id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3">
                  <button type="button" onClick={() => onSelect(r.software_id)} className="text-left focus:outline-none focus:ring-2 focus:ring-sky-500 rounded">
                    <span className="block font-medium text-slate-900 hover:text-sky-700">{r.software_name}</span>
                    <span className="block text-xs text-slate-500">{r.vendor_name}</span>
                  </button>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{r.category}</td>
                <td className="px-4 py-3 whitespace-nowrap">{r.business_vertical}</td>
                <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">{formatINR(r.annual_cost)}</td>
                <td className="px-4 py-3"><div className="flex justify-end"><UtilBar value={r.utilisation} target={target} /></div></td>
                <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">{formatINR(r.shelfware)}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <span className="block tabular-nums">{formatDate(r.end_date)}</span>
                  {r.days_to_notice <= 30 ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700"><AlarmClock size={12} aria-hidden="true" />Notice in {r.days_to_notice} d</span>
                  ) : (
                    <span className="text-xs text-slate-500">{formatNumber(r.days_to_renewal)} d</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${RECOMMENDATION_STYLE[r.recommendation]}`}>{r.recommendation}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button type="button" onClick={() => onDocuments(r.software_id)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-sky-700 hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-500 whitespace-nowrap">
                    <FileText size={14} aria-hidden="true" />Documents ({r.doc_count})
                    {r.missing_signed_msa && <TriangleAlert size={14} className="text-red-600" aria-label="No signed MSA" />}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
