import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CircleAlert, ExternalLink, TriangleAlert, X } from 'lucide-react';
import Panel from '../../../components/Panel';
import Segmented from '../../../components/Segmented';
import { useRpc } from '../../../hooks/useRpc';
import { downloadCsv } from '../../../lib/csv';
import { INK, STATUS, axisTick, tooltipStyle } from '../../../lib/chartTheme';
import { useLicensing } from '../LicensingContext';

const SEV = {
  critical: { label: 'Critical', color: STATUS.critical, Icon: CircleAlert, text: 'text-red-700' },
  warning: { label: 'Warning', color: STATUS.warning, Icon: TriangleAlert, text: 'text-amber-700' },
};
const LEGEND_ORDER = ['Critical', 'Warning'];
const link = 'rounded-md px-1.5 py-0.5 font-medium text-sky-700 hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-500';

/** Critical + warning counts per group, worst first. */
function group(rows, keyOf, labelOf) {
  const m = new Map();
  for (const g of rows) {
    const k = keyOf(g);
    const x = m.get(k) || { key: k, label: labelOf(g), critical: 0, warning: 0 };
    x[g.severity] += 1;
    m.set(k, x);
  }
  return [...m.values()].sort((a, b) => b.critical - a.critical || (b.critical + b.warning) - (a.critical + a.warning) || a.label.localeCompare(b.label));
}

function GapBars({ data, selected, onSelect, labelWidth }) {
  const click = (e) => { const r = e.payload ?? e; onSelect(r.key === selected ? null : r.key); };
  const fade = (r) => (selected && r.key !== selected ? 0.3 : 1);
  return (
    <div style={{ height: Math.max(180, data.length * 30 + 56) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 0 }}>
          <CartesianGrid stroke={INK.grid} horizontal={false} />
          <XAxis type="number" allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="label" width={labelWidth} interval={0} tickLine={false} axisLine={{ stroke: INK.axis }}
            tick={({ x, y, payload }) => {
              const r = data.find((d) => d.label === payload.value);
              const on = r && r.key === selected;
              return <text x={x} y={y} dy={4} textAnchor="end" fontSize={12} fill={on ? INK.primary : INK.secondary} fontWeight={on ? 700 : 400}>{payload.value}</text>;
            }} />
          <Tooltip {...tooltipStyle} cursor={{ fill: '#f1f5f9' }} formatter={(v, n) => [v, n]} />
          <Legend wrapperStyle={{ fontSize: 12, color: INK.secondary }} itemSorter={(i) => LEGEND_ORDER.indexOf(i.value)} />
          <Bar dataKey="critical" name="Critical" stackId="g" maxBarSize={20} fill={SEV.critical.color} stroke="#fff" strokeWidth={1} cursor="pointer" onClick={click} isAnimationActive={false}>
            {data.map((r) => <Cell key={r.key} fillOpacity={fade(r)} />)}
          </Bar>
          <Bar dataKey="warning" name="Warning" stackId="g" maxBarSize={20} fill={SEV.warning.color} radius={[0, 4, 4, 0]} cursor="pointer" onClick={click} isAnimationActive={false}>
            {data.map((r) => <Cell key={r.key} fillOpacity={fade(r)} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Gaps to chase: two charts (by gap type, and by vendor or product) that drill into one filterable table.
 * Data: it_lic_doc_gaps; vendor names from it_lic_vendors, product names from the coverage rows.
 */
export default function GapsExplorer({ products = [] }) {
  const { filters, open } = useLicensing();
  const gaps = useRpc('it_lic_doc_gaps', { p_filters: filters });
  const vendors = useRpc('it_lic_vendors', { p_filters: filters });
  const [by, setBy] = useState('vendor');
  const [kind, setKind] = useState(null);
  const [who, setWho] = useState(null); // { by, key }
  const [sev, setSev] = useState('all');

  const vendorName = useMemo(() => new Map((vendors.data ?? []).map((v) => [v.vendor_id, v.vendor_name])), [vendors.data]);
  const productName = useMemo(() => new Map(products.map((p) => [p.software_id, p.software_name])), [products]);
  const rows = useMemo(() => (gaps.data ?? []).map((g) => ({
    ...g,
    vendor: vendorName.get(g.vendor_id) ?? g.vendor_id ?? '—',
    product: g.software_id ? productName.get(g.software_id) ?? g.title.split(' — ')[0] : 'Vendor-level',
  })), [gaps.data, vendorName, productName]);

  const whoKey = (g) => (by === 'vendor' ? g.vendor_id ?? '—' : g.software_id ?? 'vendor-level');
  const byKind = useMemo(() => group(rows.filter((g) => !who || (who.by === 'vendor' ? g.vendor_id : g.software_id ?? 'vendor-level') === who.key), (g) => g.kind, (g) => g.kind), [rows, who]);
  const byWho = useMemo(() => group(rows.filter((g) => !kind || g.kind === kind), whoKey, (g) => (by === 'vendor' ? g.vendor : g.product)), [rows, kind, by]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = rows.filter((g) => (!kind || g.kind === kind)
    && (!who || (who.by === 'vendor' ? g.vendor_id : g.software_id ?? 'vendor-level') === who.key)
    && (sev === 'all' || g.severity === sev));
  const whoLabel = who ? (who.by === 'vendor' ? vendorName.get(who.key) ?? who.key : who.key === 'vendor-level' ? 'Vendor-level' : productName.get(who.key) ?? who.key) : null;
  const critical = rows.filter((g) => g.severity === 'critical').length;

  if (gaps.loading && !gaps.data) return <Panel title="Gaps to chase"><p className="text-sm text-slate-500">Loading…</p></Panel>;
  if (!rows.length) return <Panel title="Gaps to chase"><p className="text-sm text-slate-500">No documentation gaps for these filters.</p></Panel>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Panel title="Gaps by type" tooltip="What is missing: each gap type, critical (red) and warning (amber). Select a bar to list those gaps in the table below; select it again to clear.">
          <p className="mb-2 text-xs text-slate-600"><b className="text-slate-900">{rows.length}</b> open gaps · <b className="text-slate-900">{critical}</b> critical{who ? ` · showing ${whoLabel} only` : ''}</p>
          <GapBars data={byKind} selected={kind} onSelect={setKind} labelWidth={210} />
        </Panel>
        <Panel title="Who to chase" tooltip="The same gaps grouped by the vendor or product that has to act, worst first. Select a bar to list its gaps in the table below.">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <Segmented label="Group by" value={by} onChange={(v) => { setBy(v); setWho(null); }} options={[{ value: 'vendor', label: 'Vendor' }, { value: 'product', label: 'Product' }]} />
            {kind && <span className="text-xs text-slate-600">showing {kind} only</span>}
          </div>
          <GapBars data={byWho} selected={who?.by === by ? who.key : null} onSelect={(k) => setWho(k ? { by, key: k } : null)} labelWidth={170} />
        </Panel>
      </div>

      <Panel title="Gaps to chase" flush tooltip="Every open gap: missing or unsigned documents, renewal quotes awaiting signature, vendor security assessments and held-up invoices, most severe first. Filter with the charts above or the severity toggle."
        actions={<button type="button" disabled={!shown.length} onClick={() => downloadCsv('doc-gaps.csv', shown, [
          { key: 'severity', label: 'Severity' }, { key: 'kind', label: 'Gap' }, { key: 'title', label: 'Item' }, { key: 'vendor', label: 'Vendor' },
          { key: 'product', label: 'Product' }, { key: 'contract_id', label: 'Contract' }, { key: 'note', label: 'Note' }, { key: 'file_url', label: 'Document' }])}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-sky-500">Export CSV</button>}>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3 text-xs">
          <Segmented label="Severity" value={sev} onChange={setSev} options={[{ value: 'all', label: 'All' }, { value: 'critical', label: 'Critical' }, { value: 'warning', label: 'Warning' }]} />
          {kind && <Chip label={`Gap: ${kind}`} onClear={() => setKind(null)} />}
          {who && <Chip label={`${who.by === 'vendor' ? 'Vendor' : 'Product'}: ${whoLabel}`} onClear={() => setWho(null)} />}
          {(kind || who || sev !== 'all') && <button type="button" onClick={() => { setKind(null); setWho(null); setSev('all'); }} className={link}>Clear all</button>}
          <span className="ml-auto text-slate-500 tabular-nums">{shown.length} of {rows.length} gaps</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-slate-600">
            <thead className="text-xs uppercase bg-slate-50 text-slate-500 border-b border-slate-200"><tr>
              {['Severity', 'Gap', 'Item', 'Vendor', 'Action'].map((h) => <th key={h} scope="col" className="px-4 py-2.5 font-semibold whitespace-nowrap">{h}</th>)}
            </tr></thead>
            <tbody>
              {shown.map((g, i) => {
                const s = SEV[g.severity] ?? SEV.warning;
                return (
                  <tr key={`${g.kind}-${g.document_id ?? g.invoice_id ?? g.contract_id ?? g.vendor_id}-${i}`} className="border-b border-slate-100 align-top">
                    <td className="px-4 py-2.5 whitespace-nowrap"><span className={`inline-flex items-center gap-1 text-xs font-semibold ${s.text}`}><s.Icon size={14} aria-hidden="true" />{s.label}</span></td>
                    <td className="px-4 py-2.5 font-medium text-slate-900">{g.kind}</td>
                    <td className="px-4 py-2.5">{g.title}{g.note && <span className="block text-xs text-slate-500">{g.note}</span>}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{g.vendor}</td>
                    <td className="px-4 py-2.5">
                      <div className="-ml-1.5 flex flex-wrap gap-0.5 text-xs">
                        {g.file_url && <a href={g.file_url} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1 ${link}`}><ExternalLink size={12} aria-hidden="true" />Document</a>}
                        {g.contract_id && <button type="button" onClick={() => open.contract(g.contract_id)} className={link}>Contract</button>}
                        {g.vendor_id && <button type="button" onClick={() => open.vendor(g.vendor_id)} className={link}>Vendor</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!shown.length && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">No gaps match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function Chip({ label, onClear }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white py-0.5 pl-2.5 pr-1 text-slate-700">
      {label}
      <button type="button" onClick={onClear} aria-label={`Remove filter ${label}`} className="rounded-full p-0.5 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"><X size={12} /></button>
    </span>
  );
}
