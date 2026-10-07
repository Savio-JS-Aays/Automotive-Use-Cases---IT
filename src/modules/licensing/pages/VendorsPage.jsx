import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Building2, FileWarning, ShieldAlert, Store, Trophy } from 'lucide-react';
import KpiCard from '../../../components/KpiCard';
import Panel from '../../../components/Panel';
import { useRpc } from '../../../hooks/useRpc';
import { formatDate, formatINR, formatINRAxis, formatNumber, formatPct } from '../../../lib/format';
import { downloadCsv } from '../../../lib/csv';
import { INK, SERIES, STATUS, axisTick, tooltipStyle } from '../../../lib/chartTheme';
import { useLicensing } from '../LicensingContext';

const RISKS = ['High', 'Medium', 'Low'];
const ASSESSMENT_TEXT = { valid: 'text-green-800', expiring: 'text-amber-700 font-medium', expired: 'text-red-700 font-semibold', missing: 'text-red-700 font-semibold' };

/** Vendors: concentration, certifications, assessment currency, and a register with a vendor drill-down. */
export default function VendorsPage() {
  const { filters, open } = useLicensing();
  const vendors = useRpc('it_lic_vendors', { p_filters: filters });
  const [riskFilter, setRiskFilter] = useState(null);
  const rows = useMemo(() => vendors.data ?? [], [vendors.data]);

  const kpi = useMemo(() => {
    const total = rows.reduce((s, v) => s + Number(v.acv ?? 0), 0);
    const sorted = [...rows].sort((a, b) => b.acv - a.acv);
    const top3 = sorted.slice(0, 3).reduce((s, v) => s + Number(v.acv), 0);
    return {
      count: rows.length, total,
      top3: total ? top3 / total : null,
      highRiskSpend: rows.filter((v) => v.risk_tier === 'High').reduce((s, v) => s + Number(v.acv), 0),
      attention: rows.filter((v) => v.assessment_status !== 'valid' || v.problem_invoices > 0).length,
      noCert: rows.filter((v) => !v.certifications?.length).length,
    };
  }, [rows]);

  const ranked = useMemo(() => {
    const sorted = [...rows].sort((a, b) => b.acv - a.acv);
    return sorted.map((v) => ({ ...v, acv_n: Number(v.acv), shareLabel: `${formatINR(v.acv)} · ${formatPct(kpi.total ? Number(v.acv) / kpi.total : 0, 0)}` }));
  }, [rows, kpi.total]);


  const shown = rows.filter((v) => !riskFilter || v.risk_tier === riskFilter);
  const show = (v, fmt) => (vendors.loading && !vendors.data ? '…' : v === null || v === undefined ? '—' : fmt(v));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <KpiCard title="Vendors" value={show(kpi.count, formatNumber)} icon={<Store size={20} />} sub={`${formatINR(kpi.total)} annual contract value`}
          tooltip="Vendors with at least one product in scope." />
        <KpiCard title="Top-3 Concentration" value={show(kpi.top3, (v) => formatPct(v, 0))} icon={<Trophy size={20} />}
          sub="of annual contract value" tooltip="Share of contract value held by the three largest vendors." />
        <KpiCard title="High-Risk Vendor Spend" value={show(kpi.highRiskSpend, formatINR)} icon={<ShieldAlert size={20} />}
          sub={kpi.total ? `${formatPct(kpi.highRiskSpend / kpi.total, 0)} of contract value` : null}
          tooltip="Annual contract value with vendors rated high risk." />
        <KpiCard title="Vendors Needing Attention" value={show(kpi.attention, formatNumber)} icon={<FileWarning size={20} />}
          delta={kpi.attention ? 'Assessment or invoice issue' : null} deltaTone="bad"
          tooltip="Vendors whose security assessment is expired, expiring within 90 days or missing, or who have disputed/overdue invoices." />
        <KpiCard title="No Certifications" value={show(kpi.noCert, formatNumber)} icon={<Building2 size={20} />}
          sub="no ISO 27001 / SOC 2 evidence on file" tooltip="Vendors with no security certification recorded." />
      </div>

      <div>
        <Panel title="Vendor spend concentration" tooltip="Vendors ranked by annual contract value. Each label shows that vendor's value and its share of the total. Select a vendor for its drill-down.">
          <div style={{ height: Math.max(240, ranked.length * 28 + 40) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ranked} layout="vertical" margin={{ top: 4, right: 110, left: 8, bottom: 0 }}>
                <CartesianGrid stroke={INK.grid} horizontal={false} />
                <XAxis type="number" tickFormatter={formatINRAxis} tick={axisTick} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="vendor_name" width={140} tick={{ fontSize: 12, fill: INK.secondary }} tickLine={false} axisLine={{ stroke: INK.axis }} />
                <Tooltip formatter={(v, n, p) => [`${formatINR(v)} (${formatPct(p.payload.share)} of total)`, 'Annual value']} {...tooltipStyle} cursor={{ fill: '#f1f5f9' }} />
                <Bar dataKey="acv_n" fill={SERIES[0]} radius={[0, 4, 4, 0]} maxBarSize={14} cursor="pointer" onClick={(e) => open.vendor((e.payload ?? e).vendor_id)}>
                  <LabelList dataKey="shareLabel" position="right" fill={INK.secondary} fontSize={11} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

      </div>

      <Panel title="Vendor register" flush
        actions={(
          <div className="flex items-center gap-2 text-xs">
            <label>
              <span className="sr-only">Risk tier</span>
              <select value={riskFilter ?? ''} onChange={(e) => setRiskFilter(e.target.value || null)} className="rounded-md border border-slate-300 bg-white py-1 px-2 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500">
                <option value="">All risk tiers</option>{RISKS.map((r) => <option key={r}>{r}</option>)}
              </select>
            </label>
            <button type="button" disabled={!shown.length} onClick={() => downloadCsv('vendors.csv', shown, [
              { key: 'vendor_name', label: 'Vendor' }, { key: 'risk_tier', label: 'Risk' }, { key: 'products', label: 'Products' }, { key: 'acv', label: 'Annual contract value' },
              { key: 'ytd_spend', label: 'FY spend to date' }, { key: 'next_renewal', label: 'Next renewal' }, { key: 'payment_terms_days', label: 'Payment terms (days)' },
              { key: 'assessment_status', label: 'Security assessment' }, { key: 'documents', label: 'Documents' }])}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-sky-500">Export CSV</button>
          </div>
        )}
        tooltip="Every vendor with spend, products, next renewal, security-assessment status and documents.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-slate-600">
            <thead className="text-xs uppercase bg-slate-50 text-slate-500 border-b border-slate-200"><tr>
              {['Vendor', 'Risk', 'Products', 'Annual value', 'FY spend', 'Next renewal', 'Terms', 'Security assessment', 'Documents'].map((h, i) => (
                <th key={h} scope="col" className={`px-4 py-2.5 font-semibold whitespace-nowrap ${i >= 2 && i <= 4 ? 'text-right' : ''}`}>{h}</th>))}
            </tr></thead>
            <tbody className="tabular-nums">
              {shown.map((v) => (
                <tr key={v.vendor_id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2.5 min-w-[11rem]"><button type="button" onClick={() => open.vendor(v.vendor_id)} className="text-left font-medium text-slate-900 hover:text-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 rounded">{v.vendor_name}</button>
                    <span className="block text-xs text-slate-500">{v.vendor_category}{v.preferred ? ' · preferred' : ''}</span></td>
                  <td className="px-4 py-2.5"><span className="inline-flex items-center gap-1 text-xs font-medium"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: v.risk_tier === 'High' ? STATUS.critical : v.risk_tier === 'Medium' ? STATUS.warning : STATUS.good }} aria-hidden="true" />{v.risk_tier}</span></td>
                  <td className="px-4 py-2.5 text-right">{v.products}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">{formatINR(v.acv)}<span className="block text-xs text-slate-500">{formatPct(v.share, 0)}</span></td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">{formatINR(v.ytd_spend)}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{formatDate(v.next_renewal)}{v.days_to_renewal != null && <span className="block text-xs text-slate-500">{v.days_to_renewal} d</span>}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{v.payment_terms_days ? `Net ${v.payment_terms_days}` : '—'}</td>
                  <td className={`px-4 py-2.5 whitespace-nowrap text-xs ${ASSESSMENT_TEXT[v.assessment_status]}`}>
                    {v.assessment_status === 'missing' ? 'Missing' : `${v.assessment_status === 'valid' ? 'Valid' : v.assessment_status === 'expiring' ? 'Expiring' : 'Expired'} · ${formatDate(v.assessment_expiry)}`}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap"><button type="button" onClick={() => open.docs({ vendor: v.vendor_id })} className="text-xs font-medium text-sky-700 hover:underline focus:outline-none focus:ring-2 focus:ring-sky-500 rounded">{v.documents} docs</button>
                    {v.problem_invoices > 0 && <span className="ml-1 text-xs font-medium text-red-700">· {v.problem_invoices} invoice issue</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
