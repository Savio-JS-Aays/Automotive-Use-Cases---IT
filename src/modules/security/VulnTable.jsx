import { X } from 'lucide-react';
import Panel from '../../components/Panel';
import { downloadCsv } from '../../lib/csv';
import { formatDate } from '../../lib/format';
import { ASSET_CLASSES, SEVERITIES, SEV_TEXT } from './secData';

const inputCls = 'rounded-md border border-slate-200 bg-white py-1.5 px-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500';
const SORTS = {
  risk: { label: 'Severity, then oldest', fn: (a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) || b.days_open - a.days_open },
  age: { label: 'Oldest first', fn: (a, b) => b.days_open - a.days_open },
  cvss: { label: 'Highest CVSS', fn: (a, b) => b.cvss - a.cvss },
  due: { label: 'Due soonest', fn: (a, b) => a.due_date.localeCompare(b.due_date) },
  assets: { label: 'Most assets affected', fn: (a, b) => b.assets_affected - a.assets_affected },
};

/**
 * Open vulnerabilities with filters: severity, asset class, SLA status, exploit, product, search and sort. CSV of what is shown.
 * f / setF hold the filters so the chart and KPI cards above can set them.
 */
export default function VulnTable({ open, loading, f, setF, products }) {
  const s = f.q.trim().toLowerCase();
  const rows = open.filter((v) => (!f.sev || v.severity === f.sev) && (!f.asset || v.asset_class === f.asset)
    && (!f.sla || (f.sla === 'past' ? v.past_sla : !v.past_sla)) && (!f.exploit || v.exploit_available)
    && (!f.product || v.software_id === f.product)
    && (!s || v.title.toLowerCase().includes(s) || v.vuln_id.toLowerCase().includes(s) || (v.software_name ?? '').toLowerCase().includes(s)))
    .sort(SORTS[f.sort].fn);
  const active = f.sev || f.asset || f.sla || f.exploit || f.product || f.q;
  const set = (patch) => setF({ ...f, ...patch });

  return (
    <div id="vuln-table" className="scroll-mt-4">
      <Panel title="Open vulnerability list" flush
        tooltip="Every open vulnerability with its severity, CVSS score, affected assets, product, discovery and due dates. Overdue = past its patch SLA. Filter, sort and export what you see."
        actions={<button type="button" disabled={!rows.length} onClick={() => downloadCsv('open-vulnerabilities.csv', rows, [
          { key: 'vuln_id', label: 'ID' }, { key: 'title', label: 'Title' }, { key: 'severity', label: 'Severity' }, { key: 'cvss', label: 'CVSS' },
          { key: 'exploit_available', label: 'Exploit available' }, { key: 'asset_class', label: 'Asset class' }, { key: 'assets_affected', label: 'Assets' },
          { key: 'software_name', label: 'Product' }, { key: 'discovered_date', label: 'Discovered' }, { key: 'due_date', label: 'Due' },
          { key: 'past_sla', label: 'Past SLA' }, { key: 'days_open', label: 'Days open' }])}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500">Export CSV</button>}>
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-5 py-3 text-xs font-semibold text-slate-600">
          <label className="flex flex-col gap-1">Severity
            <select value={f.sev} onChange={(e) => set({ sev: e.target.value })} className={inputCls}><option value="">All</option>{SEVERITIES.map((x) => <option key={x}>{x}</option>)}</select>
          </label>
          <label className="flex flex-col gap-1">Asset class
            <select value={f.asset} onChange={(e) => set({ asset: e.target.value })} className={inputCls}><option value="">All</option>{ASSET_CLASSES.map((x) => <option key={x}>{x}</option>)}</select>
          </label>
          <label className="flex flex-col gap-1">Patch SLA
            <select value={f.sla} onChange={(e) => set({ sla: e.target.value })} className={inputCls}><option value="">All</option><option value="past">Past SLA (overdue)</option><option value="within">Within SLA</option></select>
          </label>
          <label className="flex flex-col gap-1">Product
            <select value={f.product} onChange={(e) => set({ product: e.target.value })} className={`${inputCls} max-w-48`}><option value="">All</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          </label>
          <label className="flex flex-col gap-1">Sort
            <select value={f.sort} onChange={(e) => set({ sort: e.target.value })} className={inputCls}>{Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
          </label>
          <label className="flex flex-col gap-1">Search
            <input type="search" value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="VULN-…, title, product" className={`${inputCls} w-44 font-normal`} />
          </label>
          <label className="inline-flex items-center gap-1.5 pb-2 font-normal"><input type="checkbox" checked={f.exploit} onChange={(e) => set({ exploit: e.target.checked })} className="rounded border-slate-300 focus:ring-blue-500" />Exploit available</label>
          {active && <button type="button" onClick={() => setF({ sev: '', asset: '', sla: '', exploit: false, product: '', q: '', sort: f.sort })} className="inline-flex items-center gap-1 pb-2 font-medium text-blue-700 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"><X size={12} />Clear</button>}
          <span className="ml-auto pb-2 font-normal tabular-nums">{loading ? 'Loading…' : `${rows.length} of ${open.length} open`}</span>
        </div>
        <div className="overflow-x-auto max-h-[30rem]">
          <table className="w-full text-sm text-left text-slate-600">
            <thead className="text-xs uppercase bg-slate-50 text-slate-500 border-b border-slate-200 sticky top-0">
              <tr>{['Vulnerability', 'Severity', 'CVSS', 'Asset', 'Product', 'Discovered', 'Due', 'Days open'].map((h) => <th key={h} scope="col" className="px-4 py-2.5 font-semibold whitespace-nowrap">{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.vuln_id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2.5 min-w-[18rem]"><span className="font-medium text-slate-900">{v.title}</span><span className="block text-xs text-slate-500">{v.vuln_id}{v.exploit_available ? ' · exploit available' : ''}</span></td>
                  <td className={`px-4 py-2.5 font-semibold ${SEV_TEXT[v.severity]}`}>{v.severity}</td>
                  <td className="px-4 py-2.5 tabular-nums">{v.cvss}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{v.asset_class} <span className="text-xs text-slate-500">×{v.assets_affected}</span></td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{v.software_name ?? '—'}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">{formatDate(v.discovered_date)}</td>
                  <td className={`px-4 py-2.5 whitespace-nowrap tabular-nums ${v.past_sla ? 'text-red-700 font-semibold' : ''}`}>{formatDate(v.due_date)}{v.past_sla ? ' · overdue' : ''}</td>
                  <td className="px-4 py-2.5 tabular-nums">{v.days_open}</td>
                </tr>
              ))}
              {!loading && !rows.length && <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-500">No open vulnerabilities match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
