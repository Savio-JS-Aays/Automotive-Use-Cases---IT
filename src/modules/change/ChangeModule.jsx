import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Clock3, GitBranch, GitPullRequestArrow, RotateCcw, ShieldAlert, Undo2 } from 'lucide-react';
import KpiCard from '../../components/KpiCard';
import Panel, { PageHeader } from '../../components/Panel';
import Heatmap from '../../components/Heatmap';
import LoadError from '../../components/LoadError';
import IncidentDrawer from '../../components/IncidentDrawer';
import { PriorityBadge } from '../../components/StatusBadge';
import { useRpc } from '../../hooks/useRpc';
import { useItFilters } from '../../hooks/useItFilters';
import { useUrlParam } from '../../hooks/useUrlParam';
import { BLUE_ORDINAL, INK, SERIES, STATUS, axisTick, tooltipStyle } from '../../lib/chartTheme';
import { formatNumber, formatPct, formatSignedPct } from '../../lib/format';

const shortDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
const fmtTime = (t) => new Date(t).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const deployColor = (v) => (v === 0 ? '#f0efec' : BLUE_ORDINAL[Math.min(BLUE_ORDINAL.length - 1, Math.floor((v - 1) / 2))]);

function CfrBars({ rows, labelKey, target, onSelect }) {
  const data = rows.map((r) => ({ ...r, pct: Number(r.cfr) * 100 }));
  return (
    <div style={{ height: Math.max(180, data.length * 34 + 40) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 22, right: 40, left: 8, bottom: 0 }}>
          <CartesianGrid stroke={INK.grid} horizontal={false} />
          <XAxis type="number" domain={[0, (max) => Math.max(30, Math.ceil(max / 5) * 5)]} tickFormatter={(v) => `${v}%`} tick={axisTick} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey={labelKey} width={110} tick={{ fontSize: 12, fill: INK.secondary }} tickLine={false} axisLine={{ stroke: INK.axis }} />
          <Tooltip formatter={(v, n, p) => [`${v.toFixed(1)}% (${p.payload.failed} of ${p.payload.deploys})`, 'Change failure rate']} {...tooltipStyle} cursor={{ fill: '#f1f5f9' }} />
          <ReferenceLine x={target * 100} stroke={STATUS.critical} strokeDasharray="5 4" label={{ value: `target ${target * 100}%`, position: 'top', fill: INK.secondary, fontSize: 11 }} />
          <Bar dataKey="pct" radius={[0, 4, 4, 0]} maxBarSize={16} cursor={onSelect ? 'pointer' : undefined}
            onClick={onSelect ? (e) => onSelect((e.payload ?? e)) : undefined}
            label={{ position: 'right', fill: INK.secondary, fontSize: 11, formatter: (v) => `${Number(v).toFixed(0)}%` }}>
            {data.map((r) => <Cell key={r[labelKey]} fill={r.pct > target * 100 ? STATUS.serious : SERIES[0]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function ChangeModule() {
  const [service, setService] = useUrlParam('service');
  const [day, setDay] = useUrlParam('day');
  const [failedOnly, setFailedOnly] = useUrlParam('failed');
  const [incident, setIncident] = useUrlParam('incident');
  const filters = useItFilters({ service });
  const { data, loading, error } = useRpc('it_chg_overview', { p_filters: filters });
  const deps = useRpc('it_chg_deployments', { p_filters: filters, p_failed_only: failedOnly === '1', p_date: day });
  const svcOpts = useRpc('it_rel_overview', { p_filters: { days: filters.days } });

  const cal = useMemo(() => {
    if (!data) return null;
    const byDate = new Map(data.calendar.map((c) => [c.date, c]));
    const weeks = [];
    for (const c of data.calendar) {
      const d = new Date(c.date);
      const monday = new Date(d);
      monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      const key = monday.toISOString().slice(0, 10);
      if (!weeks.includes(key)) weeks.push(key);
    }
    const dateFor = (weekKey, wd) => {
      const m = new Date(weekKey);
      m.setUTCDate(m.getUTCDate() + wd);
      return m.toISOString().slice(0, 10);
    };
    return {
      rows: WEEKDAYS.map((w, i) => ({ key: i, label: w })),
      cols: weeks.map((w) => ({ key: w, label: shortDate(w) })),
      cell: (wd, wk) => byDate.get(dateFor(wk, wd)),
      dateFor,
    };
  }, [data]);

  if (error) return <LoadError error={error} what="Change Impact" />;
  const k = data?.kpis ?? {};
  const show = (v, fmt) => (loading && !data ? '…' : v === null || v === undefined ? '—' : fmt(v));
  const rel = (c, p) => (c != null && p ? c / p - 1 : null);
  const pts = (c, p) => (c != null && p != null ? c - p : null);
  const cfrD = pts(k.cfr, k.cfr_prev);
  const recD = rel(k.recovery_h, k.recovery_h_prev);
  const leadD = rel(k.lead_h, k.lead_h_prev);
  const rbD = pts(k.rollback_rate, k.rollback_rate_prev);
  const shareD = pts(k.change_incident_share, k.change_incident_share_prev);
  const freqD = rel(k.deploys_per_day, k.deploys_per_day_prev);
  const services = svcOpts.data?.services ?? [];

  return (
    <div className="space-y-6 pb-10">
      <PageHeader title="Change Impact" window={data?.window} note="deployments are global; incident share follows the region filter">
        <label className="flex flex-col text-xs font-semibold text-slate-600">
          Service
          <select value={service ?? ''} onChange={(e) => setService(e.target.value)}
            className="mt-1 min-w-56 rounded-md border border-slate-300 bg-white py-1.5 px-2 text-sm font-normal text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500">
            <option value="">All services</option>
            {services.map((s) => <option key={s.service_id} value={s.service_id}>{s.service_name}</option>)}
          </select>
        </label>
      </PageHeader>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <KpiCard title="Deployment Frequency" icon={<GitBranch size={20} />} value={show(k.deploys_per_day, (v) => `${v} / day`)}
          sub={`${formatNumber(k.deploys)} deployments (excl. rollbacks)`}
          delta={freqD !== null ? `${formatSignedPct(freqD)} vs prior` : null} deltaTone="neutral"
          tooltip="DORA: deployments per day in the window, excluding rollbacks." />
        <KpiCard title="Change Failure Rate" icon={<ShieldAlert size={20} />} value={show(k.cfr, (v) => formatPct(v))}
          sub={`target ≤ ${formatPct(k.cfr_target, 0)}`}
          delta={cfrD !== null ? `${formatSignedPct(cfrD, 1, ' pts')} vs prior` : null} deltaTone={cfrD > 0 ? 'bad' : 'good'}
          tooltip="DORA: failed deployments ÷ deployments (excl. rollbacks). A deployment fails when it degraded service and needed a rollback or fix." />
        <KpiCard title="Failed Deploy Recovery" icon={<Clock3 size={20} />} value={show(k.recovery_h, (v) => `${v.toFixed(1)} h`)}
          delta={recD !== null ? `${formatSignedPct(recD)} vs prior` : null} deltaTone={recD > 0 ? 'bad' : 'good'}
          tooltip="DORA: median time from a failed deployment to its rollback or, if fixed forward, to the resolution of the incident it caused." />
        <KpiCard title="Lead Time for Changes" icon={<GitPullRequestArrow size={20} />} value={show(k.lead_h, (v) => `${v.toFixed(0)} h`)}
          delta={leadD !== null ? `${formatSignedPct(leadD)} vs prior` : null} deltaTone={leadD > 0 ? 'bad' : 'good'}
          tooltip="DORA: median hours from first commit to production for code changes." />
        <KpiCard title="Rollback Rate" icon={<Undo2 size={20} />} value={show(k.rollback_rate, (v) => formatPct(v))}
          delta={rbD !== null ? `${formatSignedPct(rbD, 1, ' pts')} vs prior` : null} deltaTone={rbD > 0 ? 'bad' : 'good'}
          tooltip="Rollback deployments ÷ deployments." />
        <KpiCard title="Change-Induced Incidents" icon={<RotateCcw size={20} />} value={show(k.change_incident_share, (v) => formatPct(v))}
          sub="share of incidents caused by a deployment"
          delta={shareD !== null ? `${formatSignedPct(shareD, 1, ' pts')} vs prior` : null} deltaTone={shareD > 0 ? 'bad' : 'good'}
          tooltip="Incidents with root cause 'Change' ÷ all incidents. Every one is linked to the deployment that caused it." />
      </div>

      <Panel title="Deployment calendar" tooltip="Deployments per day (weekday × week). Darker = more deployments; the tooltip shows failures. Select a day to list its deployments.">
        {cal ? (
          <Heatmap rows={cal.rows} cols={cal.cols} rowLabelWidth={40}
            value={(wd, wk) => cal.cell(wd, wk)?.deploys ?? null}
            colorFor={deployColor}
            titleFor={(r, c) => {
              const x = cal.cell(r.key, c.key);
              return x ? `${shortDate(x.date)} (${r.label}): ${x.deploys} deployments, ${x.failed} failed, ${x.incidents} incidents caused` : 'outside window';
            }}
            onCell={(r, c) => { const x = cal.cell(r.key, c.key); if (x) setDay(x.date === day ? null : x.date); }}
            legend={[{ label: 'none', color: deployColor(0) }, { label: '1–2', color: deployColor(1) }, { label: '3–4', color: deployColor(3) }, { label: '5–6', color: deployColor(5) }, { label: '7+', color: deployColor(7) }]} />
        ) : <p className="text-sm text-slate-500">Loading…</p>}
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Panel title="Change failure rate by type" tooltip="Failed ÷ deployments per change type in the window.">
          {data && <CfrBars rows={data.by_type} labelKey="change_type" target={k.cfr_target ?? 0.15} />}
        </Panel>
        <Panel title="Change failure rate by service" tooltip="Services above the target are highlighted. Select a bar to focus on that service.">
          {data && <CfrBars rows={data.by_service} labelKey="short_name" target={k.cfr_target ?? 0.15} onSelect={(r) => setService(r.service_id)} />}
        </Panel>
      </div>

      <Panel title={`Deployments${day ? ` · ${shortDate(day)}` : ''}`} flush
        actions={(
          <div className="flex items-center gap-3 text-xs">
            <label className="inline-flex items-center gap-1.5 text-slate-600">
              <input type="checkbox" checked={failedOnly === '1'} onChange={(e) => setFailedOnly(e.target.checked ? '1' : null)} className="rounded border-slate-300 focus:ring-sky-500" />
              Failed only
            </label>
            {day && <button type="button" onClick={() => setDay(null)} className="font-medium text-sky-700 hover:underline focus:outline-none focus:ring-2 focus:ring-sky-500 rounded">All days</button>}
          </div>
        )}>
        <div className="overflow-x-auto max-h-[28rem]">
          <table className="w-full text-sm text-left text-slate-600">
            <thead className="text-xs uppercase bg-slate-50 text-slate-500 border-b border-slate-200 sticky top-0">
              <tr>
                {['Deployment', 'Service', 'Type', 'Status', 'PRs', 'Lead time', 'Caused incidents'].map((h) => <th key={h} scope="col" className="px-4 py-2.5 font-semibold whitespace-nowrap">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {(deps.data ?? []).map((d) => (
                <tr key={d.deployment_id} className="border-b border-slate-100">
                  <td className="px-4 py-2.5"><span className="font-medium text-slate-900">{d.deployment_id}</span><span className="block text-xs text-slate-500">{fmtTime(d.deploy_time)}</span></td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{d.short_name}</td>
                  <td className="px-4 py-2.5">{d.change_type}{d.rollback_of ? <span className="block text-xs text-slate-500">of {d.rollback_of}</span> : null}</td>
                  <td className="px-4 py-2.5">
                    {d.status === 'Failed'
                      ? <span className="text-red-700 font-semibold">Failed{d.rolled_back_by ? ' · rolled back' : ' · fixed forward'}</span>
                      : <span className="text-slate-700">Success</span>}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">{d.pr_count}</td>
                  <td className="px-4 py-2.5 tabular-nums whitespace-nowrap">{d.lead_time_hours == null ? '—' : `${Number(d.lead_time_hours).toFixed(0)} h`}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {d.incidents.map((i) => (
                        <button key={i.incident_id} type="button" onClick={() => setIncident(i.incident_id)} title={i.title}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-1.5 py-0.5 text-xs hover:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-500">
                          {i.incident_id} <PriorityBadge priority={i.priority} />
                        </button>
                      ))}
                      {!d.incidents.length && <span className="text-xs text-slate-400">—</span>}
                    </div>
                  </td>
                </tr>
              ))}
              {!deps.loading && !(deps.data ?? []).length && <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-500">No deployments match.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>

      {incident && <IncidentDrawer incidentId={incident} onClose={() => setIncident(null)} />}
    </div>
  );
}
