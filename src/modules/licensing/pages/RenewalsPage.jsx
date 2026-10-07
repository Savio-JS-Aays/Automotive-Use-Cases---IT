import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlarmClock, CalendarClock, FilePen, Repeat, TrendingUp } from 'lucide-react';
import KpiCard from '../../../components/KpiCard';
import Panel from '../../../components/Panel';
import Segmented from '../../../components/Segmented';
import { useRpc } from '../../../hooks/useRpc';
import { formatINR, formatINRAxis, formatNumber, formatPct } from '../../../lib/format';
import { INK, SERIES, axisTick, gridProps, tooltipStyle } from '../../../lib/chartTheme';
import RenewalCalendar from '../charts/RenewalCalendar';
import { ACTION_COLOR } from '../constants';
import { useLicensing } from '../LicensingContext';

const ACTION_SAYS = { Renew: 'keep as is', Review: 'renegotiate', 'Right-size': 'cut seats', 'True-up': 'buy more seats' };
// Calendar quarter → plain months + Indian fiscal quarter (FY starts in April)
function quarterLabel(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  const m = d.getUTCMonth(); const y = d.getUTCFullYear();
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fyStart = m >= 3 ? y : y - 1;
  const fq = m >= 3 ? Math.floor((m - 3) / 3) + 1 : 4;
  return { months: `${names[m]}–${names[m + 2]} ${y}`, fy: `Q${fq} FY${String(fyStart).slice(2)}-${String(fyStart + 1).slice(2)}` };
}

/** Renewals & Contracts: when decisions and renewals fall, how much renews each quarter, and what renewing will cost extra. */
export default function RenewalsPage() {
  const { filters, kpis, open } = useLicensing();
  const [horizon, setHorizon] = useState(12);
  const [basis, setBasis] = useState('all');
  const renewals = useRpc('it_lic_renewals', { p_filters: filters, p_months: horizon });
  const k = kpis.data ?? {};
  const show = (v, fmt) => (kpis.loading && !kpis.data ? '…' : v === null || v === undefined ? '—' : fmt(v));
  const rows = useMemo(() => (renewals.data ?? []).filter((r) => r.days_to_renewal >= 0 && r.days_to_renewal <= horizon * 30.5), [renewals.data, horizon]);

  const byQuarter = useMemo(() => {
    const m = new Map();
    for (const r of rows) {
      const ql = quarterLabel(r.quarter);
      const q = m.get(r.quarter) || { quarter: r.quarter, label: ql.months, fy: ql.fy, total: 0, items: [] };
      q[r.recommendation] = (q[r.recommendation] || 0) + Number(r.annual_value);
      q.total += Number(r.annual_value);
      q.items.push(r);
      m.set(r.quarter, q);
    }
    return [...m.values()].sort((a, b) => a.quarter.localeCompare(b.quarter)).map((q) => ({ ...q, totalLabel: formatINR(q.total) }));
  }, [rows]);
  const biggest = byQuarter.reduce((b, q) => (!b || q.total > b.total ? q : b), null);
  const totalRenewing = rows.reduce((t, r) => t + Number(r.annual_value), 0);

  const uplift = rows.filter((r) => r.uplift_exposure > 0 && (basis === 'all' || (basis === 'quoted') === Boolean(r.renewal_quote_inr)))
    .map((r) => ({
      ...r, name: r.short_name || r.software_name, extra: Number(r.uplift_exposure),
      pct: Number(r.uplift_exposure) / Number(r.annual_value),
      after: Number(r.annual_value) + Number(r.uplift_exposure),
      how: r.renewal_quote_inr ? 'vendor quote' : `estimate at the ${r.uplift_cap_pct}% cap`,
    }))
    .sort((a, b) => b.extra - a.extra)
    .map((r) => ({ ...r, tag: `+${formatINR(r.extra)} (+${(r.pct * 100).toFixed(1)}%)` }));
  const extraTotal = uplift.reduce((t, r) => t + r.extra, 0);

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
          sub="extra per year if renewed as quoted / at the cap" tooltip="Σ (renewal quote, or annual value × (1 + uplift cap)) − current annual value, for contracts renewing within 12 months." />
        <KpiCard title="Quotes Awaiting Signature" value={show(k.quotes_awaiting, formatNumber)} icon={<FilePen size={20} />}
          onClick={() => open.docs({ doc_type: 'Renewal Quote' })} tooltip="Renewal quotes received but not countersigned. Click to see them." />
        <KpiCard title="Auto-Renew Share" value={show(k.auto_renew_share, (v) => formatPct(v, 0))} icon={<Repeat size={20} />}
          sub="of contracts renewing in 12 months" tooltip="Auto-renewing contracts need an explicit decision before the notice deadline." />
      </div>

      <Panel title="Renewal calendar"
        actions={<Segmented label="Horizon" value={horizon} onChange={setHorizon} options={[{ value: 12, label: '12 months' }, { value: 24, label: '24 months' }]} />}
        tooltip="A month-by-month planner. Each contract appears on its notice deadline (the last day to cancel or renegotiate before it renews) and on its end date (with its annual value and recommended action). Select an entry to open the contract, its documents and renewal quote.">
        {k.as_of && renewals.data ? <RenewalCalendar rows={renewals.data} asOf={k.as_of} months={horizon} onOpen={(id) => open.contract(id)} /> : <p className="text-sm text-slate-500">Loading…</p>}
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Panel title="How much renews each quarter"
          tooltip="The annual value of contracts whose term ends in each quarter, split by what we recommend doing at renewal. Use it to see when the big renewal decisions (and their budget impact) land. Hover a bar for the contracts.">
          <p className="mb-2 text-sm text-slate-700">
            <b>{formatINR(totalRenewing)}</b> of annual contracts renew in the next {horizon} months across {rows.length} contracts.
            {biggest && <> The biggest quarter is <b>{biggest.label}</b> ({biggest.fy}): <b>{formatINR(biggest.total)}</b> from {biggest.items.map((r) => r.short_name || r.software_name).join(', ')}.</>}
          </p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={byQuarter} margin={{ top: 22, right: 8, left: 4, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: INK.axis }} />
                <YAxis tickFormatter={formatINRAxis} tick={axisTick} tickLine={false} axisLine={false} width={60} />
                <Tooltip {...tooltipStyle} cursor={{ fill: '#f1f5f9' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const q = payload[0].payload;
                    return (
                      <div className="rounded-lg border border-black/10 bg-white px-3 py-2 text-xs shadow-sm">
                        <p className="font-semibold text-slate-700">{q.label} · {q.fy}</p>
                        <p className="mb-1 text-slate-900">{formatINR(q.total)} renewing · {q.items.length} contract{q.items.length === 1 ? '' : 's'}</p>
                        {q.items.map((r) => <p key={r.contract_id} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: ACTION_COLOR[r.recommendation] }} />{r.short_name || r.software_name}: {formatINR(r.annual_value)} · {r.recommendation}</p>)}
                      </div>
                    );
                  }} />
                <Legend wrapperStyle={{ fontSize: 12, color: INK.secondary }} formatter={(v) => `${v} (${ACTION_SAYS[v]})`} itemSorter={(i) => Object.keys(ACTION_COLOR).indexOf(i.value)} />
                {Object.keys(ACTION_COLOR).map((a, i) => (
                  <Bar key={a} dataKey={a} name={a} stackId="q" fill={ACTION_COLOR[a]} stroke="#fff" strokeWidth={1} maxBarSize={56} isAnimationActive={false} radius={i === 3 ? [3, 3, 0, 0] : 0} />
                ))}
                {/* invisible line at each bar's total, carrying the quarter total as its label */}
                <Line dataKey="total" stroke="transparent" dot={false} activeDot={false} legendType="none" isAnimationActive={false}
                  label={{ position: 'top', fontSize: 11, fontWeight: 600, fill: INK.primary, formatter: (v) => formatINR(v) }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-xs text-slate-500">Each bar is one calendar quarter (the fiscal quarter is in the tooltip). Colours show the recommended action at renewal.</p>
        </Panel>

        <Panel title="What renewals will cost extra"
          tooltip="Most contracts let the vendor raise the price at renewal, up to an agreed cap. For each contract renewing in the horizon this shows how much more we would pay per year: from the vendor's renewal quote where we have one, otherwise an estimate at the contract's cap. Select a bar to open the contract and its quote.">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Segmented label="Basis" value={basis} onChange={setBasis} options={[{ value: 'all', label: 'All' }, { value: 'quoted', label: 'Quoted' }, { value: 'estimate', label: 'Estimated at cap' }]} />
          </div>
          <p className="mb-2 text-sm text-slate-700">
            Renewing these {uplift.length} contracts would add <b>{formatINR(extraTotal)}</b> a year.
            {uplift[0] && <> The largest is <b>{uplift[0].name}</b>: {formatINR(uplift[0].annual_value)} → <b>{formatINR(uplift[0].after)}</b> a year, {uplift[0].tag} based on the {uplift[0].how}.</>}
          </p>
          {!uplift.length ? <p className="py-8 text-center text-sm text-slate-500">No price increases in this horizon.</p> : (
            <div style={{ height: Math.max(180, uplift.length * 30 + 40) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={uplift} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke={INK.grid} horizontal={false} />
                  <XAxis type="number" tickFormatter={formatINRAxis} tick={axisTick} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" width={110} interval={0} tick={{ fontSize: 12, fill: INK.secondary }} tickLine={false} axisLine={{ stroke: INK.axis }} />
                  <YAxis yAxisId="v" orientation="right" type="category" dataKey="tag" width={120} interval={0} tick={{ fontSize: 11, fill: INK.secondary }} tickLine={false} axisLine={false} />
                  <Tooltip {...tooltipStyle} cursor={{ fill: '#f1f5f9' }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const r = payload[0].payload;
                      return (
                        <div className="rounded-lg border border-black/10 bg-white px-3 py-2 text-xs shadow-sm">
                          <p className="font-semibold text-slate-700">{r.software_name}</p>
                          <p>Today {formatINR(r.annual_value)}/yr → at renewal <b>{formatINR(r.after)}</b>/yr</p>
                          <p>Extra <b>{formatINR(r.extra)}</b> (+{(r.pct * 100).toFixed(1)}%) · {r.how} · cap {r.uplift_cap_pct}%</p>
                          <p className="text-slate-500">Renews {new Date(r.end_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                        </div>
                      );
                    }} />
                  <Bar dataKey="extra" maxBarSize={16} radius={[0, 4, 4, 0]} isAnimationActive={false} cursor="pointer" onClick={(e) => open.contract((e.payload ?? e).contract_id)}>
                    {uplift.map((r) => <Cell key={r.contract_id} fill={r.renewal_quote_inr ? SERIES[0] : '#86b6ef'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <p className="mt-2 flex flex-wrap gap-3 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES[0] }} />from the vendor's renewal quote</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: '#86b6ef' }} />estimate: current value × the contract's uplift cap</span>
          </p>
        </Panel>
      </div>
    </div>
  );
}
