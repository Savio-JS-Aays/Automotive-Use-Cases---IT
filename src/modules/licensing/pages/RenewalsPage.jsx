import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlarmClock, CalendarClock, FilePen, Repeat, TrendingUp } from 'lucide-react';
import KpiCard from '../../../components/KpiCard';
import Panel from '../../../components/Panel';
import { useRpc } from '../../../hooks/useRpc';
import { formatDate, formatINR, formatINRAxis, formatNumber, formatPct } from '../../../lib/format';
import { downloadCsv } from '../../../lib/csv';
import { INK, SERIES, STATUS, axisTick, gridProps, tooltipStyle } from '../../../lib/chartTheme';
import RenewalTimeline from '../charts/RenewalTimeline';
import { RECOMMENDATION_STYLE } from '../constants';
import { useLicensing } from '../LicensingContext';

const REC_COLORS = { Renew: STATUS.good, Review: STATUS.warning, 'Right-size': STATUS.serious, 'True-up': STATUS.critical };
const HORIZONS = [{ months: 12, label: '12 months' }, { months: 24, label: '24 months' }];

/** Renewals & Contracts: what renews when, what must be decided now, what it will cost, and every contract. */
export default function RenewalsPage() {
  const { filters, kpis, open } = useLicensing();
  const [horizon, setHorizon] = useState(12);
  const [includeExpired, setIncludeExpired] = useState(true);
  const renewals = useRpc('it_lic_renewals', { p_filters: filters, p_months: horizon });
  const contracts = useRpc('it_lic_contracts', { p_filters: { ...filters, include_expired: includeExpired } });

  const k = kpis.data ?? {};
  const show = (v, fmt) => (kpis.loading && !kpis.data ? '…' : v === null || v === undefined ? '—' : fmt(v));
  const rows = useMemo(() => renewals.data ?? [], [renewals.data]);
  const timeline = rows.map((r) => ({ ...r, annual_cost: r.annual_value }));

  const byQuarter = useMemo(() => {
    const m = new Map();
    for (const r of rows) {
      const q = m.get(r.quarter) || { quarter: r.quarter, label: `Q${Math.floor(new Date(r.quarter).getMonth() / 3) + 1} ${new Date(r.quarter).getFullYear()}` };
      q[r.recommendation] = (q[r.recommendation] || 0) + Number(r.annual_value);
      m.set(r.quarter, q);
    }
    return [...m.values()].sort((a, b) => a.quarter.localeCompare(b.quarter));
  }, [rows]);
  const uplift = [...rows].filter((r) => r.uplift_exposure > 0).sort((a, b) => b.uplift_exposure - a.uplift_exposure)
    .map((r) => ({ ...r, basis: r.renewal_quote_inr ? 'quoted' : `cap ${r.uplift_cap_pct}%` }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <KpiCard title="Renewals in 90 Days" value={show(k.renewal_exposure, formatINR)} icon={<CalendarClock size={20} />}
          sub={`${formatNumber(k.renewal_count)} contracts`} tooltip="Annual value of active contracts ending within 90 days." />
        <KpiCard title="Decisions Due ≤ 30 d" value={show(k.decisions_due, formatNumber)} icon={<AlarmClock size={20} />}
          delta={k.decisions_due ? 'Act before the notice deadline' : null} deltaTone="bad"
          tooltip="Contracts whose notice deadline (end date − notice period) falls within 30 days. Miss it and auto-renewals roll over at the uplift." />
        <KpiCard title="Renewals in 12 Months" value={show(k.renewal_value_12m, formatINR)} icon={<Repeat size={20} />}
          sub={`${formatNumber(k.renewals_12m)} contracts · ${formatPct(k.auto_renew_share, 0)} auto-renew`} tooltip="Annual value of contracts ending within 12 months." />
        <KpiCard title="Uplift Exposure (12 mo)" value={show(k.uplift_exposure_12m, formatINR)} icon={<TrendingUp size={20} />}
          sub="extra cost if renewed as quoted / at the cap" tooltip="Σ (renewal quote, or annual value × (1 + uplift cap)) − current annual value, for contracts renewing within 12 months." />
        <KpiCard title="Quotes Awaiting Signature" value={show(k.quotes_awaiting, formatNumber)} icon={<FilePen size={20} />}
          onClick={() => open.docs({ doc_type: 'Renewal Quote' })} tooltip="Renewal quotes received but not countersigned. Click to see them." />
        <KpiCard title="Auto-Renew Share" value={show(k.auto_renew_share, (v) => formatPct(v, 0))} icon={<Repeat size={20} />}
          sub="of contracts renewing in 12 months" tooltip="Auto-renewing contracts need an explicit decision before the notice deadline." />
      </div>

      <Panel title="Renewal timeline"
        actions={(
          <div role="radiogroup" aria-label="Horizon" className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            {HORIZONS.map((h) => (
              <button key={h.months} type="button" role="radio" aria-checked={horizon === h.months} onClick={() => setHorizon(h.months)}
                className={`rounded-md px-3 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-sky-500 ${horizon === h.months ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>{h.label}</button>
            ))}
          </div>
        )}
        tooltip="Each contract's decision window: notice deadline (tick) to end date (dot). Select a row to open the contract.">
        {k.as_of ? <RenewalTimeline data={timeline} asOf={k.as_of} horizonDays={horizon === 12 ? 365 : 730}
          onSelect={(id) => { const r = rows.find((x) => x.software_id === id); if (r) open.contract(r.contract_id); }} /> : <p className="text-sm text-slate-500">Loading…</p>}
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Panel title="Renewal value by quarter" tooltip="Annual value renewing each quarter, coloured by the recommended action (labelled in the legend).">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byQuarter} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: INK.axis }} />
                <YAxis tickFormatter={formatINRAxis} tick={axisTick} tickLine={false} axisLine={false} width={60} />
                <Tooltip formatter={(v, n) => [formatINR(v), n]} {...tooltipStyle} cursor={{ fill: '#f1f5f9' }} />
                <Legend wrapperStyle={{ fontSize: 12, color: INK.secondary }} />
                {Object.keys(REC_COLORS).map((rec) => (
                  <Bar key={rec} dataKey={rec} name={rec} stackId="q" fill={REC_COLORS[rec]} stroke={INK.surface} strokeWidth={1} maxBarSize={48} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Uplift exposure by contract" tooltip="Extra annual cost at renewal: from the renewal quote where one exists, otherwise the contract's uplift cap. Select a bar to open the contract.">
          <div style={{ height: Math.max(220, uplift.length * 28 + 40) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={uplift} layout="vertical" margin={{ top: 4, right: 72, left: 8, bottom: 0 }}>
                <CartesianGrid stroke={INK.grid} horizontal={false} />
                <XAxis type="number" tickFormatter={formatINRAxis} tick={axisTick} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="short_name" width={100} tick={{ fontSize: 12, fill: INK.secondary }} tickLine={false} axisLine={{ stroke: INK.axis }} />
                <Tooltip formatter={(v, n, p) => [`${formatINR(v)} (${p.payload.basis})`, 'Uplift']} {...tooltipStyle} cursor={{ fill: '#f1f5f9' }} />
                <Bar dataKey="uplift_exposure" radius={[0, 4, 4, 0]} maxBarSize={14} cursor="pointer" onClick={(e) => open.contract((e.payload ?? e).contract_id)}>
                  {uplift.map((r) => <Cell key={r.contract_id} fill={r.renewal_quote_inr ? SERIES[0] : '#86b6ef'} />)}
                  <LabelList dataKey="basis" position="right" fill={INK.muted} fontSize={11} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel title={`Decision queue · next ${horizon} months`} flush
        actions={<button type="button" disabled={!rows.length} onClick={() => downloadCsv('decision-queue.csv', rows, [
          { key: 'software_name', label: 'Product' }, { key: 'contract_id', label: 'Contract' }, { key: 'vendor_name', label: 'Vendor' },
          { key: 'notice_deadline', label: 'Notice deadline' }, { key: 'end_date', label: 'End date' }, { key: 'auto_renew', label: 'Auto-renew' },
          { key: 'annual_value', label: 'Annual value' }, { key: 'renewal_quote_inr', label: 'Quote' }, { key: 'uplift_exposure', label: 'Uplift' },
          { key: 'utilisation', label: 'Utilisation' }, { key: 'recommendation', label: 'Action' }])}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-sky-500">Export CSV</button>}
        tooltip="Contracts renewing in the horizon, nearest notice deadline first, with the recommended action and the quote document.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-slate-600">
            <thead className="text-xs uppercase bg-slate-50 text-slate-500 border-b border-slate-200"><tr>
              {['Contract', 'Notice deadline', 'Ends', 'Annual value', 'Quote / uplift', 'Utilisation', 'Action', 'Documents'].map((h, i) => (
                <th key={h} scope="col" className={`px-4 py-2.5 font-semibold whitespace-nowrap ${i >= 3 && i <= 5 ? 'text-right' : ''}`}>{h}</th>))}
            </tr></thead>
            <tbody className="tabular-nums">
              {rows.map((r) => (
                <tr key={r.contract_id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2.5 min-w-[13rem]"><button type="button" onClick={() => open.contract(r.contract_id)} className="text-left font-medium text-slate-900 hover:text-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 rounded">{r.software_name}</button>
                    <span className="block text-xs text-slate-500">{r.contract_id} · {r.vendor_name}{r.auto_renew ? ' · auto-renew' : ''}</span></td>
                  <td className="px-4 py-2.5 whitespace-nowrap"><span className={r.days_to_notice <= 30 ? 'text-red-700 font-semibold' : r.days_to_notice <= 90 ? 'text-amber-700 font-medium' : ''}>{formatDate(r.notice_deadline)}</span>
                    <span className="block text-xs text-slate-500">{r.days_to_notice < 0 ? 'passed' : `in ${r.days_to_notice} d`}</span></td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{formatDate(r.end_date)}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">{formatINR(r.annual_value)}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">{r.renewal_quote_inr ? formatINR(r.renewal_quote_inr) : '—'}<span className="block text-xs text-red-700">+{formatINR(r.uplift_exposure)}</span></td>
                  <td className="px-4 py-2.5 text-right">{formatPct(r.utilisation, 0)}</td>
                  <td className="px-4 py-2.5"><span className={`rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${RECOMMENDATION_STYLE[r.recommendation]}`}>{r.recommendation}</span></td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {r.quote_file_url && <a href={r.quote_file_url} target="_blank" rel="noopener noreferrer" className="mr-2 text-xs font-medium text-sky-700 hover:underline focus:outline-none focus:ring-2 focus:ring-sky-500 rounded">Quote PDF</a>}
                    <button type="button" onClick={() => open.docs({ contract: r.contract_id })} className="text-xs font-medium text-sky-700 hover:underline focus:outline-none focus:ring-2 focus:ring-sky-500 rounded">All ({r.doc_count})</button>
                  </td>
                </tr>
              ))}
              {renewals.data && !rows.length && <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-500">No renewals in this horizon.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Contract register" flush
        actions={<label className="inline-flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={includeExpired} onChange={(e) => setIncludeExpired(e.target.checked)} className="rounded border-slate-300 focus:ring-sky-500" />Include expired</label>}
        tooltip="Every contract, including expired predecessors. Select one for terms, renewal history, documents and invoices.">
        <div className="overflow-x-auto max-h-[32rem]">
          <table className="w-full text-sm text-left text-slate-600">
            <thead className="text-xs uppercase bg-slate-50 text-slate-500 border-b border-slate-200 sticky top-0"><tr>
              {['Contract', 'Status', 'Term', 'Annual value', 'Billing', 'Renewal chain', 'Documents', 'Invoices'].map((h, i) => (
                <th key={h} scope="col" className={`px-4 py-2.5 font-semibold whitespace-nowrap ${i === 3 ? 'text-right' : ''}`}>{h}</th>))}
            </tr></thead>
            <tbody className="tabular-nums">
              {(contracts.data ?? []).map((c) => (
                <tr key={c.contract_id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2.5 min-w-[13rem]"><button type="button" onClick={() => open.contract(c.contract_id)} className="text-left font-medium text-slate-900 hover:text-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 rounded">{c.software_name}</button>
                    <span className="block text-xs text-slate-500">{c.contract_id} · {c.vendor_name}</span></td>
                  <td className={`px-4 py-2.5 text-xs font-medium ${c.status === 'Active' ? 'text-green-800' : 'text-slate-500'}`}>{c.status}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{formatDate(c.start_date)} – {formatDate(c.end_date)}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">{formatINR(c.annual_value)}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{c.billing_frequency} · {c.original_currency}</td>
                  <td className="px-4 py-2.5 text-xs whitespace-nowrap">
                    {c.predecessor_contract_id && <button type="button" onClick={() => open.contract(c.predecessor_contract_id)} className="text-sky-700 hover:underline focus:outline-none focus:ring-2 focus:ring-sky-500 rounded">← {c.predecessor_contract_id}</button>}
                    {c.successor_contract_id && <button type="button" onClick={() => open.contract(c.successor_contract_id)} className="text-sky-700 hover:underline focus:outline-none focus:ring-2 focus:ring-sky-500 rounded">→ {c.successor_contract_id}</button>}
                    {!c.predecessor_contract_id && !c.successor_contract_id && <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <button type="button" onClick={() => open.docs({ contract: c.contract_id })} className="text-xs font-medium text-sky-700 hover:underline focus:outline-none focus:ring-2 focus:ring-sky-500 rounded">{c.doc_count} docs</button>
                    {!c.signed_msa && <span className="ml-1 text-xs font-medium text-red-700">· no signed MSA</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs whitespace-nowrap">{c.invoices}{c.problem_invoices ? <span className="text-red-700 font-medium"> · {c.problem_invoices} held up</span> : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
