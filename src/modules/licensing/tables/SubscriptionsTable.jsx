import { useState } from 'react';
import { AlarmClock, ArrowDown, ArrowUp, FileText, TriangleAlert, X } from 'lucide-react';
import Segmented from '../../../components/Segmented';
import { formatDate, formatINR, formatNumber, formatPct, formatSignedPct } from '../../../lib/format';
import { downloadCsv } from '../../../lib/csv';
import { SERIES, STATUS } from '../../../lib/chartTheme';
import { RECOMMENDATION_STYLE } from '../constants';

function UtilBar({ value, target }) {
  const v = Number(value);
  const color = v < 0.6 ? STATUS.critical : v < target ? STATUS.warning : SERIES[0];
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="relative h-2 w-16 rounded-full bg-slate-100" aria-hidden="true">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, v * 100)}%`, background: color }} />
        <div className="absolute -top-0.5 h-3 w-px bg-slate-500" style={{ left: `${target * 100}%` }} />
      </div>
      <span className="tabular-nums">{formatPct(v, 0)}</span>
    </div>
  );
}
const red = (bad) => (bad ? 'text-red-700 font-semibold' : '');

// Column views: one table instead of a per-product table on every tab
const VIEWS = {
  overview: { label: 'Overview', cols: [
    { key: 'annual_cost', label: 'Annual value', num: true, cell: (r) => formatINR(r.annual_cost) },
    { key: 'utilisation', label: 'Utilisation', num: true, cell: (r, t) => <UtilBar value={r.utilisation} target={t} /> },
    { key: 'shelfware', label: 'Shelfware / yr', num: true, cell: (r) => formatINR(r.shelfware) },
    { key: 'days_to_renewal', label: 'Renews', num: true, cell: (r) => <RenewCell r={r} /> },
    { key: 'recommendation', label: 'Action', cell: (r) => <Action r={r} /> },
  ] },
  spend: { label: 'Spend & budget', cols: [
    { key: 'fy_budget', label: 'FY budget', num: true, cell: (r) => formatINR(r.fy_budget) },
    { key: 'ytd_actual', label: 'Spent to date', num: true, cell: (r) => formatINR(r.ytd_actual) },
    { key: 'ytd_variance', label: 'vs budget', num: true, cell: (r) => <span className={red(r.ytd_variance > 0.02)}>{formatSignedPct(r.ytd_variance)}</span> },
    { key: 'forecast', label: 'FY forecast', num: true, cell: (r) => formatINR(r.forecast) },
    { key: 'forecast_variance', label: 'Forecast vs budget', num: true, cell: (r) => <span className={red(r.forecast_variance > 0.02)}>{formatSignedPct(r.forecast_variance)}</span> },
    { key: 'yoy', label: 'vs last FY', num: true, cell: (r) => formatSignedPct(r.yoy) },
  ] },
  usage: { label: 'Usage & savings', cols: [
    { key: 'purchased', label: 'Seats bought', num: true, cell: (r) => formatNumber(r.purchased) },
    { key: 'active30', label: 'Active 30 d', num: true, cell: (r) => formatNumber(r.active30) },
    { key: 'utilisation', label: 'Utilisation', num: true, cell: (r, t) => <UtilBar value={r.utilisation} target={t} /> },
    { key: 'reduction', label: 'Seats to cut', num: true, cell: (r) => (r.reduction ? formatNumber(r.reduction) : '—') },
    { key: 'annual_saving', label: 'Saving at renewal', num: true, cell: (r) => (r.annual_saving > 0 ? <span className="font-semibold text-green-800">{formatINR(r.annual_saving)}</span> : '—') },
    { key: 'trueup', label: 'True-up / yr', num: true, cell: (r) => (r.trueup > 0 ? <span className="font-semibold text-red-700">{formatINR(r.trueup)}</span> : '—') },
    { key: 'cost_per_active_user', label: 'Cost / active user', num: true, cell: (r) => `${formatINR(r.cost_per_active_user)}/mo` },
  ] },
  renewal: { label: 'Renewal', cols: [
    { key: 'days_to_notice', label: 'Notice deadline', num: true, cell: (r) => <span className={r.days_to_notice <= 30 ? 'font-semibold text-red-700' : r.days_to_notice <= 90 ? 'font-medium text-amber-700' : ''}>{formatDate(r.notice_deadline)}<span className="block text-xs font-normal text-slate-500">{r.days_to_notice < 0 ? 'passed' : `in ${r.days_to_notice} d`}</span></span> },
    { key: 'days_to_renewal', label: 'Ends', num: true, cell: (r) => formatDate(r.end_date) },
    { key: 'annual_cost', label: 'Annual value', num: true, cell: (r) => formatINR(r.annual_cost) },
    { key: 'uplift_exposure', label: 'Extra at renewal', num: true, cell: (r) => (r.uplift_exposure ? <span className="text-red-700">+{formatINR(r.uplift_exposure)}<span className="block text-xs text-slate-500">{r.renewal_quote_inr ? 'quoted' : `cap ${r.uplift_cap_pct}%`}</span></span> : '—') },
    { key: 'auto_renew', label: 'Auto-renew', cell: (r) => (r.auto_renew ? 'Yes' : 'No') },
    { key: 'recommendation', label: 'Action', cell: (r) => <Action r={r} /> },
  ] },
};

function RenewCell({ r }) {
  return (
    <>
      <span className="block tabular-nums">{formatDate(r.end_date)}</span>
      {r.days_to_notice >= 0 && r.days_to_notice <= 30
        ? <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700"><AlarmClock size={12} aria-hidden="true" />Notice in {r.days_to_notice} d</span>
        : <span className="text-xs text-slate-500">{formatNumber(r.days_to_renewal)} d</span>}
    </>
  );
}
function Action({ r }) {
  return <span className={`rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${RECOMMENDATION_STYLE[r.recommendation]}`}>{r.recommendation}</span>;
}

/**
 * The one subscription table for Licensing: a row per product with column views (Overview, Spend & budget,
 * Usage & savings, Renewal). Rows are already filtered by the page; this component handles view, sort and export.
 * A product opens the product drawer; Documents opens its documents; Quote opens the renewal quote PDF.
 */
export default function SubscriptionsTable({ rows, total, target, view, setView, onSelect, onDocuments, filterBar }) {
  const [sort, setSort] = useState({ key: 'annual_cost', dir: 'desc' });
  const cols = VIEWS[view].cols;
  const dir = sort.dir === 'asc' ? 1 : -1;
  const sorted = [...rows].sort((a, b) => {
    const x = a[sort.key]; const y = b[sort.key];
    if (typeof x === 'number' || typeof y === 'number') return ((Number(x) || 0) - (Number(y) || 0)) * dir;
    return String(x ?? '').localeCompare(String(y ?? '')) * dir;
  });
  const toggle = (key) => setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));
  const exportCsv = () => downloadCsv('subscriptions.csv', sorted, [
    { key: 'software_name', label: 'Product' }, { key: 'vendor_name', label: 'Vendor' }, { key: 'category', label: 'Category' }, { key: 'business_vertical', label: 'Vertical' },
    { key: 'contract_id', label: 'Contract' }, { key: 'annual_cost', label: 'Annual value' }, { key: 'fy_budget', label: 'FY budget' }, { key: 'ytd_actual', label: 'Spent to date' },
    { key: 'ytd_variance', label: 'vs budget' }, { key: 'forecast', label: 'FY forecast' }, { key: 'purchased', label: 'Seats bought' }, { key: 'active30', label: 'Active 30d' },
    { key: 'utilisation', label: 'Utilisation' }, { key: 'shelfware', label: 'Shelfware / yr' }, { key: 'reduction', label: 'Seats to cut' }, { key: 'annual_saving', label: 'Saving at renewal' },
    { key: 'trueup', label: 'True-up / yr' }, { key: 'notice_deadline', label: 'Notice deadline' }, { key: 'end_date', label: 'Ends' }, { key: 'auto_renew', label: 'Auto-renew' },
    { key: 'uplift_exposure', label: 'Extra at renewal' }, { key: 'recommendation', label: 'Action' }, { key: 'doc_count', label: 'Documents' },
  ]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3">
        <Segmented label="Columns" value={view} onChange={setView} options={Object.entries(VIEWS).map(([value, v]) => ({ value, label: v.label }))} />
        <span className="ml-auto text-xs tabular-nums text-slate-500">{rows.length} of {total} subscriptions</span>
        <button type="button" onClick={exportCsv} disabled={!rows.length} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500">Export CSV</button>
      </div>
      {filterBar}
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left text-slate-600">
          <thead className="text-xs uppercase bg-slate-50 text-slate-500 border-b border-slate-200">
            <tr>
              {[{ key: 'software_name', label: 'Product' }, ...cols, { key: 'doc_count', label: 'Documents', num: true }].map((c) => (
                <th key={c.key + c.label} scope="col" aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={`px-4 py-3 font-semibold whitespace-nowrap ${c.num ? 'text-right' : ''}`}>
                  <button type="button" onClick={() => toggle(c.key)} className="inline-flex items-center gap-1 uppercase focus:outline-none focus:ring-2 focus:ring-blue-500 rounded">
                    {c.label}{sort.key === c.key && (sort.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.software_id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 min-w-[13rem]">
                  <button type="button" onClick={() => onSelect(r.software_id)} className="text-left focus:outline-none focus:ring-2 focus:ring-blue-500 rounded">
                    <span className="block font-medium text-slate-900 hover:text-blue-700">{r.software_name}</span>
                    <span className="block text-xs text-slate-500">{r.vendor_name} · {r.category} · {r.business_vertical}</span>
                  </button>
                </td>
                {cols.map((c) => <td key={c.key + c.label} className={`px-4 py-3 whitespace-nowrap ${c.num ? 'text-right tabular-nums' : ''}`}>{c.cell(r, target)}</td>)}
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {view === 'renewal' && r.quote_file_url && <a href={r.quote_file_url} target="_blank" rel="noopener noreferrer" className="mr-2 text-xs font-medium text-blue-700 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded">Quote PDF</a>}
                  <button type="button" onClick={() => onDocuments(r.software_id)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <FileText size={14} aria-hidden="true" />{r.doc_count}
                    {r.missing_signed_msa && <TriangleAlert size={14} className="text-red-600" aria-label="No signed MSA" />}
                  </button>
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={cols.length + 2} className="px-4 py-6 text-center text-slate-500">No subscriptions match these filters. <X size={12} className="inline" /> Clear some filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

