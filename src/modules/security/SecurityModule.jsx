import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Bug, Fish, Hourglass, Radar, ShieldAlert, ShieldCheck, ShieldX, Timer } from 'lucide-react';
import KpiCard from '../../components/KpiCard';
import Panel, { PageHeader } from '../../components/Panel';
import Sparkline from '../../components/Sparkline';
import LoadError from '../../components/LoadError';
import { useRpc } from '../../hooks/useRpc';
import { useItFilters } from '../../hooks/useItFilters';
import { INK, SERIES, axisTick, gridProps, tooltipStyle } from '../../lib/chartTheme';
import { formatDate, formatNumber, formatPct, formatSignedPct } from '../../lib/format';

// Ordinal blue steps for age buckets (youngest light -> oldest dark)
const AGE_STEPS = ['#86b6ef', '#3987e5', '#256abf', '#184f95', '#0d366b'];
const AGE_KEYS = [['d0_15', '0–15 d'], ['d16_30', '16–30 d'], ['d31_60', '31–60 d'], ['d61_90', '61–90 d'], ['d90_plus', '90+ d']];
const SEV_TEXT = { Critical: 'text-red-700', High: 'text-amber-700', Medium: 'text-slate-700', Low: 'text-slate-500' };

export default function SecurityModule() {
  const filters = useItFilters();
  const { data, loading, error } = useRpc('it_sec_overview', { p_filters: filters });
  const [sev, setSev] = useState('All');
  const vulns = useRpc('it_sec_vulns', { p_filters: filters, p_status: 'Open' });

  const vectors = useMemo(() => {
    const m = new Map();
    for (const r of data?.vectors ?? []) {
      const v = m.get(r.vector) || { vector: r.vector, weeks: [], detected: 0, blocked: 0 };
      v.weeks.push(r.detected);
      v.detected += r.detected;
      v.blocked += r.blocked;
      m.set(r.vector, v);
    }
    return [...m.values()].sort((a, b) => b.detected - a.detected);
  }, [data]);

  if (error) return <LoadError error={error} what="Security" />;
  const k = data?.kpis ?? {};
  const show = (v, fmt) => (loading && !data ? '…' : v === null || v === undefined ? '—' : fmt(v));
  const rel = (c, p) => (c != null && p ? c / p - 1 : null);
  const pts = (c, p) => (c != null && p != null ? c - p : null);
  const aging = (data?.aging ?? []).map((a) => ({ ...a }));
  const vulnRows = (vulns.data ?? []).filter((v) => sev === 'All' || v.severity === sev);
  const phishing = (data?.phishing ?? []).map((p) => ({ ...p, label: new Date(p.month).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }) }));

  return (
    <div className="space-y-6 pb-10">
      <PageHeader title="Security" window={data?.window} note="vulnerabilities without a region count everywhere" />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard title="Open Critical Vulnerabilities" icon={<ShieldX size={20} />} value={show(k.open_critical, formatNumber)}
          sub={`${formatNumber(k.open_high)} high also open`} tooltip="Open vulnerabilities with severity Critical (CVSS ≥ 9)." />
        <KpiCard title="Past Patch SLA" icon={<Hourglass size={20} />} value={show(k.past_sla, formatNumber)}
          delta={k.past_sla > 0 ? 'Overdue' : null} deltaTone="bad" sub="critical/high open beyond their due date"
          tooltip="Critical (15 d) and high (30 d) vulnerabilities still open after their patch due date." />
        <KpiCard title="Patch SLA Compliance" icon={<ShieldCheck size={20} />} value={show(k.patch_sla, (v) => formatPct(v, 0))}
          delta={pts(k.patch_sla, k.patch_sla_prev) !== null ? `${formatSignedPct(pts(k.patch_sla, k.patch_sla_prev), 0, ' pts')} vs prior` : null}
          deltaTone={pts(k.patch_sla, k.patch_sla_prev) < 0 ? 'bad' : 'good'}
          tooltip="Vulnerabilities patched in the window that were patched on or before their due date." />
        <KpiCard title="Security Incidents" icon={<ShieldAlert size={20} />} value={show(k.incidents, formatNumber)}
          delta={rel(k.incidents, k.incidents_prev) !== null ? `${formatSignedPct(rel(k.incidents, k.incidents_prev))} vs prior` : null}
          deltaTone={k.incidents > k.incidents_prev ? 'bad' : 'good'} sub={`${formatNumber(k.open_incidents)} not yet resolved`}
          tooltip="Security incidents detected in the window." />
        <KpiCard title="Median Time to Detect" icon={<Radar size={20} />} value={show(k.mttd_h, (v) => `${v} h`)}
          delta={rel(k.mttd_h, k.mttd_h_prev) !== null ? `${formatSignedPct(rel(k.mttd_h, k.mttd_h_prev))} vs prior` : null}
          deltaTone={k.mttd_h > k.mttd_h_prev ? 'bad' : 'good'} tooltip="MTTD: median of (detected − impact start) for security incidents detected in the window." />
        <KpiCard title="Median Time to Contain" icon={<Timer size={20} />} value={show(k.mttc_h, (v) => `${v} h`)}
          delta={rel(k.mttc_h, k.mttc_h_prev) !== null ? `${formatSignedPct(rel(k.mttc_h, k.mttc_h_prev))} vs prior` : null}
          deltaTone={k.mttc_h > k.mttc_h_prev ? 'bad' : 'good'} tooltip="MTTC: median of (contained − detected)." />
        <KpiCard title="Phishing Click Rate" icon={<Fish size={20} />} value={show(k.phish_click, (v) => formatPct(v))}
          delta={pts(k.phish_click, k.phish_click_prev) !== null ? `${formatSignedPct(pts(k.phish_click, k.phish_click_prev), 1, ' pts')} vs last month` : null}
          deltaTone={k.phish_click > k.phish_click_prev ? 'bad' : 'good'} spark={phishing.map((p) => p.click)}
          tooltip="Share of employees who clicked the latest monthly phishing simulation." />
        <KpiCard title="Threats Blocked" icon={<Bug size={20} />} value={show(k.blocked, formatNumber)}
          sub={`block rate ${formatPct(k.block_rate, 2)}`} tooltip="Threats blocked by email, endpoint and network controls in the window." />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Panel title="Open vulnerabilities by age" tooltip="Open vulnerabilities per severity, split by days since discovery. 'Past SLA' counts those beyond their patch due date.">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={aging} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }} barCategoryGap={8}>
                <CartesianGrid stroke={INK.grid} horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="severity" width={70} tick={{ fontSize: 12, fill: INK.secondary }} tickLine={false} axisLine={{ stroke: INK.axis }} />
                <Tooltip {...tooltipStyle} cursor={{ fill: '#f1f5f9' }} />
                <Legend wrapperStyle={{ fontSize: 12, color: INK.secondary }} />
                {AGE_KEYS.map(([key, label], i) => (
                  <Bar key={key} dataKey={key} name={label} stackId="age" fill={AGE_STEPS[i]} stroke={INK.surface} strokeWidth={1}
                    radius={i === AGE_KEYS.length - 1 ? [0, 4, 4, 0] : 0} maxBarSize={22} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {aging.map((a) => <li key={a.severity} className={SEV_TEXT[a.severity]}>{a.severity}: {a.past_sla} of {a.total} past SLA</li>)}
          </ul>
        </Panel>
        <Panel title="By asset class" flush tooltip="Where open vulnerabilities sit, and how long critical/high ones take to close (still-open ones counted to the as-of date).">
          <table className="w-full text-sm text-left text-slate-600">
            <thead className="text-xs uppercase bg-slate-50 text-slate-500 border-b border-slate-200">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-semibold">Asset class</th>
                <th scope="col" className="px-4 py-2.5 font-semibold text-right">Open</th>
                <th scope="col" className="px-4 py-2.5 font-semibold text-right">Past SLA</th>
                <th scope="col" className="px-4 py-2.5 font-semibold text-right">Avg days (crit/high)</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {(data?.by_asset ?? []).map((a) => (
                <tr key={a.asset_class} className="border-b border-slate-100">
                  <td className="px-4 py-2.5 font-medium text-slate-900">{a.asset_class}</td>
                  <td className="px-4 py-2.5 text-right">{a.open}</td>
                  <td className={`px-4 py-2.5 text-right ${a.past_sla ? 'text-red-700 font-semibold' : ''}`}>{a.past_sla}</td>
                  <td className="px-4 py-2.5 text-right">{a.avg_days_crit_high ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel title="Threats by vector" tooltip="Small multiples: weekly detections per vector (each on its own scale), with window totals and block rate.">
          <ul className="divide-y divide-slate-100">
            {vectors.map((v, i) => (
              <li key={v.vector} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 py-2.5">
                <div>
                  <p className="text-sm font-medium text-slate-800">{v.vector}</p>
                  <p className="text-xs text-slate-500">{formatNumber(v.detected)} detected · {formatPct(v.detected ? v.blocked / v.detected : null, 2)} blocked</p>
                </div>
                <Sparkline values={v.weeks} width={140} height={30} color={SERIES[i % 3]} />
                <span className="text-xs tabular-nums text-slate-500 w-16 text-right">{formatNumber(v.weeks[v.weeks.length - 1])} last wk</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Phishing simulations" tooltip="Monthly simulated phishing: share of recipients who clicked (lower is better) and who reported it (higher is better).">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={phishing} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: INK.axis }} interval="preserveStartEnd" />
                <YAxis tickFormatter={(v) => `${Math.round(v * 100)}%`} tick={axisTick} tickLine={false} axisLine={false} width={44} />
                <Tooltip formatter={(v, n) => [formatPct(v), n]} {...tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12, color: INK.secondary }} />
                <Line dataKey="click" name="Clicked" stroke={SERIES[1]} strokeWidth={2} dot={false} />
                <Line dataKey="report" name="Reported" stroke={SERIES[0]} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel title="Security incidents by vector" tooltip="Security incidents detected in the window, by attack vector (P1/P2 in the tooltip).">
        <div style={{ height: Math.max(160, (data?.incident_vectors.length ?? 0) * 32 + 40) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data?.incident_vectors ?? []} layout="vertical" margin={{ top: 4, right: 32, left: 8, bottom: 0 }}>
              <CartesianGrid stroke={INK.grid} horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="vector" width={140} tick={{ fontSize: 12, fill: INK.secondary }} tickLine={false} axisLine={{ stroke: INK.axis }} />
              <Tooltip formatter={(v, n, p) => [`${v} (${p.payload.p1p2} P1/P2)`, 'Incidents']} {...tooltipStyle} cursor={{ fill: '#f1f5f9' }} />
              <Bar dataKey="n" fill={SERIES[0]} radius={[0, 4, 4, 0]} maxBarSize={16} label={{ position: 'right', fill: INK.secondary, fontSize: 11 }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title="Open vulnerabilities" flush
        actions={(
          <label className="text-xs text-slate-600">
            <span className="sr-only">Severity</span>
            <select value={sev} onChange={(e) => setSev(e.target.value)} className="rounded-md border border-slate-300 bg-white py-1 px-2 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500">
              {['All', 'Critical', 'High', 'Medium', 'Low'].map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
        )}>
        <div className="overflow-x-auto max-h-[28rem]">
          <table className="w-full text-sm text-left text-slate-600">
            <thead className="text-xs uppercase bg-slate-50 text-slate-500 border-b border-slate-200 sticky top-0">
              <tr>{['Vulnerability', 'Severity', 'CVSS', 'Asset', 'Product', 'Discovered', 'Due', 'Days open'].map((h) => <th key={h} scope="col" className="px-4 py-2.5 font-semibold whitespace-nowrap">{h}</th>)}</tr>
            </thead>
            <tbody>
              {vulnRows.map((v) => (
                <tr key={v.vuln_id} className="border-b border-slate-100">
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
              {!vulns.loading && !vulnRows.length && <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-500">No open vulnerabilities match.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
