import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CircleX, Clock, Database, PackageCheck, Workflow } from 'lucide-react';
import KpiCard from '../../components/KpiCard';
import Panel, { PageHeader } from '../../components/Panel';
import StatusBadge from '../../components/StatusBadge';
import LoadError from '../../components/LoadError';
import Drawer from '../../components/Drawer';
import { useRpc } from '../../hooks/useRpc';
import { useItFilters } from '../../hooks/useItFilters';
import { useUrlParam } from '../../hooks/useUrlParam';
import { INK, SERIES, STATUS, axisTick, gridProps, tooltipStyle } from '../../lib/chartTheme';
import { downloadCsv } from '../../lib/csv';
import { formatNumber, formatPct, formatSignedPct } from '../../lib/format';

const shortDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
const fmtTime = (t) => new Date(t).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

function RunsTable({ rows, showJob = true }) {
  return (
    <div className="overflow-x-auto max-h-96">
      <table className="w-full text-sm text-left text-slate-600">
        <thead className="text-xs uppercase bg-slate-50 text-slate-500 border-b border-slate-200 sticky top-0">
          <tr>
            {showJob && <th scope="col" className="px-4 py-2.5 font-semibold">Job</th>}
            <th scope="col" className="px-4 py-2.5 font-semibold">Started</th>
            <th scope="col" className="px-4 py-2.5 font-semibold">Status</th>
            <th scope="col" className="px-4 py-2.5 font-semibold text-right">Duration</th>
            <th scope="col" className="px-4 py-2.5 font-semibold text-right">Records</th>
            <th scope="col" className="px-4 py-2.5 font-semibold">Error</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {rows.map((r) => (
            <tr key={r.job_id} className="border-b border-slate-100">
              {showJob && <td className="px-4 py-2.5 whitespace-nowrap text-slate-900">{r.job_name}</td>}
              <td className="px-4 py-2.5 whitespace-nowrap">{fmtTime(r.start_time)}</td>
              <td className={`px-4 py-2.5 font-semibold ${r.status === 'Failed' ? 'text-red-700' : 'text-slate-700'}`}>{r.status}</td>
              <td className={`px-4 py-2.5 text-right ${r.sla_breached ? 'text-amber-700 font-semibold' : ''}`}>{r.duration_min} / {r.sla_minutes} min</td>
              <td className="px-4 py-2.5 text-right">{formatNumber(r.records_processed)}</td>
              <td className="px-4 py-2.5 text-xs">{r.error_message ?? '—'}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={showJob ? 6 : 5} className="px-4 py-6 text-center text-slate-500">No runs.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function JobDrawer({ job, filters, onClose }) {
  const runs = useRpc('it_data_runs', { p_filters: filters, p_job_name: job, p_failed_only: false }, Boolean(job));
  const chart = useMemo(() => [...(runs.data ?? [])].reverse().map((r) => ({ ...r, label: shortDate(r.start_time) })), [runs.data]);
  const sla = chart[0]?.sla_minutes;
  return (
    <Drawer open onClose={onClose} title={job} subtitle="Every run in the window: duration against the SLA, failures in red">
      <div className="space-y-4">
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: INK.axis }} interval="preserveStartEnd" minTickGap={20} />
                <YAxis tickFormatter={(v) => `${v}m`} tick={axisTick} tickLine={false} axisLine={false} width={40} />
                <Tooltip {...tooltipStyle} cursor={{ fill: '#f1f5f9' }} formatter={(v, n, p) => [`${v} min · ${p.payload.status}`, 'Duration']} />
                {sla && <ReferenceLine y={sla} stroke={STATUS.critical} strokeDasharray="5 4" label={{ value: `SLA ${sla} min`, position: 'insideTopRight', fill: INK.secondary, fontSize: 11 }} />}
                <Bar dataKey="duration_min" radius={[3, 3, 0, 0]} maxBarSize={14} isAnimationActive={false}>
                  {chart.map((r) => <Cell key={r.job_id} fill={r.status === 'Failed' ? STATUS.critical : r.sla_breached ? STATUS.warning : SERIES[0]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-slate-500">Blue = success within SLA · amber = success but over SLA · red = failed.</p>
        </section>
        <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <RunsTable rows={runs.data ?? []} showJob={false} />
        </section>
      </div>
    </Drawer>
  );
}

export default function DataModule() {
  const filters = useItFilters();
  const { data, loading, error } = useRpc('it_data_overview', { p_filters: filters });
  const failedRuns = useRpc('it_data_runs', { p_filters: filters, p_failed_only: true });
  const [job, setJob] = useUrlParam('job');
  const daily = useMemo(() => (data?.daily ?? []).map((d) => ({ ...d, label: shortDate(d.date) })), [data]);

  if (error) return <LoadError error={error} what="Data & Integration" />;
  const k = data?.kpis ?? {};
  const show = (v, fmt) => (loading && !data ? '…' : v === null || v === undefined ? '—' : fmt(v));
  const pts = (c, p) => (c != null && p != null ? c - p : null);
  const succD = pts(k.success, k.success_prev);
  const compD = pts(k.completeness, k.completeness_prev);
  const slaD = k.sla_breaches_prev ? k.sla_breaches / k.sla_breaches_prev - 1 : null;

  return (
    <div className="space-y-6 pb-10">
      <PageHeader title="Data & Integration" window={data?.window} note="pipelines and telemetry are global (no region)" />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <KpiCard title="Pipeline Success Rate" icon={<Workflow size={20} />} value={show(k.success, (v) => formatPct(v, 1))}
          sub={`target ${formatPct(k.success_target, 0)}`} spark={daily.map((d) => d.success)}
          delta={succD !== null ? `${formatSignedPct(succD, 1, ' pts')} vs prior` : null} deltaTone={succD < 0 ? 'bad' : 'good'}
          tooltip="Successful runs ÷ all runs of the 16 integration jobs in the window." />
        <KpiCard title="SLA Breaches" icon={<Clock size={20} />} value={show(k.sla_breaches, formatNumber)}
          delta={slaD !== null ? `${formatSignedPct(slaD)} vs prior` : null} deltaTone={slaD > 0 ? 'bad' : 'good'}
          spark={daily.map((d) => d.sla_breaches)}
          tooltip="Runs that took longer than their SLA (e.g. ERP sync at month-end)." />
        <KpiCard title="Telemetry Completeness" icon={<PackageCheck size={20} />} value={show(k.completeness, (v) => formatPct(v, 2))}
          sub={`target ${formatPct(k.completeness_target, 0)}`} spark={daily.map((d) => d.completeness)}
          delta={compD !== null ? `${formatSignedPct(compD, 2, ' pts')} vs prior` : null} deltaTone={compD < 0 ? 'bad' : 'good'}
          tooltip="Valid ÷ expected vehicle telemetry packets (fact_data_quality)." />
        <KpiCard title="Failed Runs" icon={<CircleX size={20} />} value={show(k.failed, formatNumber)} sub={`of ${formatNumber(k.runs)} runs`}
          tooltip="Runs that ended in failure in the window." />
        <KpiCard title="Records Processed" icon={<Database size={20} />} value={show(k.records, (v) => `${(v / 1e6).toFixed(0)} M`)}
          tooltip="Records moved by all pipelines in the window." />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Panel title="Daily success and completeness" tooltip="Both are percentages on one axis. Dashed lines are the targets.">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={daily} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: INK.axis }} interval="preserveStartEnd" minTickGap={24} />
                <YAxis domain={[(min) => Math.max(0, Math.floor(min * 20) / 20), 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} tick={axisTick} tickLine={false} axisLine={false} width={44} />
                <Tooltip formatter={(v, n) => [formatPct(v, 1), n]} {...tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12, color: INK.secondary }} />
                <ReferenceLine y={k.success_target} stroke={SERIES[0]} strokeDasharray="5 4" strokeOpacity={0.6} />
                <ReferenceLine y={k.completeness_target} stroke={SERIES[1]} strokeDasharray="5 4" strokeOpacity={0.6} />
                <Line dataKey="success" name="Pipeline success" stroke={SERIES[0]} strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line dataKey="completeness" name="Telemetry completeness" stroke={SERIES[1]} strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="SLA breaches per day" tooltip="Runs over their SLA each day. Month-end peaks come from ERP sync.">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={daily} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: INK.axis }} interval="preserveStartEnd" minTickGap={24} />
                <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} width={32} />
                <Tooltip formatter={(v) => [v, 'SLA breaches']} {...tooltipStyle} cursor={{ fill: '#f1f5f9' }} />
                <Bar dataKey="sla_breaches" fill={SERIES[0]} radius={[3, 3, 0, 0]} maxBarSize={14} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel title="Pipelines" flush tooltip="Each integration job, worst first. Select a job for its run history.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-slate-600">
            <thead className="text-xs uppercase bg-slate-50 text-slate-500 border-b border-slate-200">
              <tr>{['Job', 'Runs', 'Success', 'Failed', 'SLA breaches', 'Avg / max duration', 'SLA', 'Last run'].map((h, i) => <th key={h} scope="col" className={`px-4 py-2.5 font-semibold whitespace-nowrap ${i > 0 && i < 7 ? 'text-right' : ''}`}>{h}</th>)}</tr>
            </thead>
            <tbody className="tabular-nums">
              {(data?.jobs ?? []).map((j) => (
                <tr key={j.job_name} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2.5">
                    <button type="button" onClick={() => setJob(j.job_name)} className="text-left focus:outline-none focus:ring-2 focus:ring-sky-500 rounded">
                      <span className="block font-medium text-slate-900 hover:text-sky-700">{j.job_name}</span>
                      <span className="block text-xs text-slate-500">{j.pipeline.replace('_', ' ')} · {j.service_id}</span>
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-right">{j.runs}</td>
                  <td className="px-4 py-2.5 text-right">
                    <StatusBadge status={j.success >= (k.success_target ?? 0.98) ? 'good' : j.success >= 0.9 ? 'warning' : 'critical'} label={formatPct(j.success, 1)} />
                  </td>
                  <td className={`px-4 py-2.5 text-right ${j.failed ? 'text-red-700 font-semibold' : ''}`}>{j.failed}</td>
                  <td className={`px-4 py-2.5 text-right ${j.sla_breaches ? 'text-amber-700 font-semibold' : ''}`}>{j.sla_breaches}</td>
                  <td className="px-4 py-2.5 text-right">{j.avg_min} / {j.max_min} min</td>
                  <td className="px-4 py-2.5 text-right">{j.sla_minutes} min</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{fmtTime(j.last_run)} · <span className={j.last_status === 'Failed' ? 'text-red-700 font-semibold' : ''}>{j.last_status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title={`Failed runs (${failedRuns.data?.length ?? 0})`} flush
        actions={<button type="button" disabled={!failedRuns.data?.length} onClick={() => downloadCsv('failed-runs.csv', failedRuns.data, [
          { key: 'job_name', label: 'Job' }, { key: 'start_time', label: 'Started' }, { key: 'duration_min', label: 'Duration (min)' },
          { key: 'records_processed', label: 'Records' }, { key: 'error_message', label: 'Error' }])}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-sky-500">Export CSV</button>}>
        <RunsTable rows={failedRuns.data ?? []} />
      </Panel>

      {job && <JobDrawer job={job} filters={filters} onClose={() => setJob(null)} />}
    </div>
  );
}
