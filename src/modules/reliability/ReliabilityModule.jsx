import { useMemo } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlarmClock, BellOff, Gauge, Hourglass, Timer, Wrench } from 'lucide-react';
import KpiCard from '../../components/KpiCard';
import Panel, { PageHeader } from '../../components/Panel';
import Funnel from '../../components/Funnel';
import LoadError from '../../components/LoadError';
import IncidentDrawer from '../../components/IncidentDrawer';
import IncidentsTable from '../../components/IncidentsTable';
import { useRpc } from '../../hooks/useRpc';
import { useItFilters } from '../../hooks/useItFilters';
import { useUrlParam } from '../../hooks/useUrlParam';
import { INK, SERIES, STATUS, axisTick, gridProps, tooltipStyle } from '../../lib/chartTheme';
import { formatINR, formatNumber, formatPct, formatSignedPct } from '../../lib/format';

const shortDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

function BudgetBar({ remaining }) {
  const v = Number(remaining);
  const over = v < 0;
  const width = over ? 100 : Math.max(2, v * 100);
  return (
    <div className="flex items-center gap-2 justify-end">
      <div className="h-2 w-24 rounded-full bg-slate-100 overflow-hidden" aria-hidden="true">
        <div className="h-full rounded-full" style={{ width: `${width}%`, background: over ? STATUS.critical : v < 0.25 ? STATUS.warning : SERIES[0] }} />
      </div>
      <span className={`tabular-nums text-xs w-16 text-right ${over ? 'text-red-700 font-semibold' : 'text-slate-600'}`}>{over ? `${(1 - v).toFixed(1)}× used` : formatPct(v, 0)}</span>
    </div>
  );
}

function MttrByPriority({ rows = [] }) {
  return (
    <div className="space-y-4">
      {rows.map((r) => {
        // each priority on its own scale (P1 hours vs P4 days); the numbers are printed below the bar
        const max = Math.max(1, r.mttr_p90 ?? 0, r.target_h ?? 0) * 1.05;
        const x = (v) => `${(v / max) * 100}%`;
        return (
        <div key={r.priority}>
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium text-slate-800">P{r.priority} <span className="font-normal text-slate-500">· {r.n} resolved · MTTA {r.mtta_min} min</span></span>
            <span className={`text-xs font-medium ${r.within_target >= 0.9 ? 'text-green-800' : 'text-amber-700'}`}>{formatPct(r.within_target, 0)} within {r.target_h} h target</span>
          </div>
          <div className="relative mt-1 h-5" title={`P25 ${r.mttr_p25} h · median ${r.mttr_p50} h · P75 ${r.mttr_p75} h · P90 ${r.mttr_p90} h`}>
            <div className="absolute top-1/2 h-px w-full bg-slate-200" aria-hidden="true" />
            <div className="absolute top-1/2 h-0.5 -translate-y-1/2 bg-slate-400" style={{ left: x(r.mttr_p25), width: `calc(${x(r.mttr_p90)} - ${x(r.mttr_p25)})` }} aria-hidden="true" />
            <div className="absolute top-0.5 h-4 rounded" style={{ left: x(r.mttr_p25), width: `calc(${x(r.mttr_p75)} - ${x(r.mttr_p25)})`, background: SERIES[0], opacity: 0.35 }} aria-hidden="true" />
            <div className="absolute top-0 h-5 w-0.5" style={{ left: x(r.mttr_p50), background: SERIES[0] }} aria-hidden="true" />
            <div className="absolute -top-0.5 h-6 w-0.5 border-l-2 border-dashed" style={{ left: x(r.target_h), borderColor: STATUS.critical }} aria-hidden="true" />
          </div>
          <p className="text-xs text-slate-500">median {r.mttr_p50} h · middle half {r.mttr_p25}–{r.mttr_p75} h · P90 {r.mttr_p90} h</p>
        </div>
        );
      })}
      <p className="text-xs text-slate-500">Each priority has its own scale (0 → the larger of P90 and target). Box = middle half, solid tick = median, line = up to P90, red dashed = target.</p>
    </div>
  );
}

export default function ReliabilityModule() {
  const [service, setService] = useUrlParam('service');
  const [incident, setIncident] = useUrlParam('incident');
  const filters = useItFilters({ service });
  const { data, loading, error } = useRpc('it_rel_overview', { p_filters: filters });
  const daily = useRpc('it_rel_daily', { p_filters: filters });
  const incidents = useRpc('it_ops_incidents', { p_filters: filters });

  const services = data?.services ?? [];
  const selected = services.find((s) => s.service_id === service);
  const chart = useMemo(() => (daily.data ?? []).map((d) => ({ ...d, label: shortDate(d.date) })), [daily.data]);

  if (error) return <LoadError error={error} what="App Reliability" />;
  const k = data?.kpis ?? {};
  const show = (v, fmt) => (loading && !data ? '…' : v === null || v === undefined ? '—' : fmt(v));
  const rel = (cur, prev) => (cur != null && prev ? cur / prev - 1 : null);
  const mttaDelta = rel(k.mtta_min, k.mtta_min_prev);
  const mttrDelta = rel(k.mttr_h, k.mttr_h_prev);
  const noiseDelta = k.noise_ratio != null && k.noise_ratio_prev != null ? k.noise_ratio - k.noise_ratio_prev : null;
  const scope = selected ? selected.service_name : 'all services';

  return (
    <div className="space-y-6 pb-10">
      <PageHeader title="App Reliability" window={data?.window} note={`scope: ${scope}`}>
        <label className="flex flex-col text-xs font-semibold text-slate-600">
          Service
          <select value={service ?? ''} onChange={(e) => setService(e.target.value)}
            className="mt-1 min-w-56 rounded-md border border-slate-300 bg-white py-1.5 px-2 text-sm font-normal text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500">
            <option value="">All services</option>
            {services.map((s) => <option key={s.service_id} value={s.service_id}>{s.service_name}</option>)}
          </select>
        </label>
      </PageHeader>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard title={selected ? 'Availability' : 'SLO Attainment'} icon={<Gauge size={20} />}
          value={selected ? formatPct(selected.availability, 3) : show(k.slo_attainment, (v) => formatPct(v, 0))}
          sub={selected ? `SLO ${formatPct(selected.slo, 2)}` : 'services at or above their availability SLO'}
          spark={chart.map((d) => d.availability)}
          tooltip="Availability = uptime minutes ÷ minutes in the window. SLO attainment = share of services meeting their SLO." />
        <KpiCard title="Error Budget Remaining" icon={<Hourglass size={20} />}
          value={selected ? (selected.budget_remaining < 0 ? `${(1 - selected.budget_remaining).toFixed(1)}× used` : formatPct(selected.budget_remaining, 0)) : show(k.error_budget_remaining, (v) => formatPct(v, 0))}
          sub={selected ? `7-day burn rate ${selected.burn_rate_7d}× (1 = on budget)` : 'portfolio downtime vs downtime the SLOs allow'}
          delta={(selected ? selected.budget_remaining : k.error_budget_remaining) < 0 ? 'Overspent' : null} deltaTone="bad"
          tooltip="Allowed downtime = (1 − SLO) × minutes in window. Remaining = 1 − downtime ÷ allowed. Burn rate = last-7-day downtime rate ÷ allowed rate." />
        <KpiCard title="Median Time to Acknowledge" icon={<AlarmClock size={20} />} value={show(k.mtta_min, (v) => `${v} min`)}
          delta={mttaDelta !== null ? `${formatSignedPct(mttaDelta)} vs prior` : null} deltaTone={mttaDelta > 0 ? 'bad' : 'good'}
          tooltip="Median of (acknowledged − opened) for incidents opened in the window." />
        <KpiCard title="Median Time to Resolve" icon={<Timer size={20} />} value={show(k.mttr_h, (v) => `${v.toFixed(1)} h`)}
          delta={mttrDelta !== null ? `${formatSignedPct(mttrDelta)} vs prior` : null} deltaTone={mttrDelta > 0 ? 'bad' : 'good'}
          tooltip="Median of (resolved − opened) for incidents opened and resolved in the window." />
        <KpiCard title="Alert Noise" icon={<BellOff size={20} />} value={show(k.noise_ratio, (v) => formatPct(v, 0))}
          delta={noiseDelta !== null ? `${formatSignedPct(noiseDelta, 1, ' pts')} vs prior` : null} deltaTone={noiseDelta > 0 ? 'bad' : 'good'}
          sub="alerts that never became an incident"
          tooltip="Share of alerts in the window with no incident attached. High noise trains people to ignore alerts." />
        <KpiCard title="Cost of Downtime" icon={<Wrench size={20} />} value={show(k.downtime_cost, formatINR)}
          sub="downtime minutes × cost per minute"
          tooltip="Σ downtime minutes × each service's cost of downtime per minute (it_dim_service). Replaces the old hash-based 'financial risk'." />
        <KpiCard title="Days over p95 Latency SLO" icon={<Gauge size={20} />} value={show(k.p95_breach_days, formatNumber)}
          sub="service-days whose p95 exceeded the latency SLO"
          tooltip="Count of (service, day) pairs where the daily p95 latency was above the service's p95 latency SLO." />
        <KpiCard title="Incidents" icon={<AlarmClock size={20} />} value={show(k.incidents, formatNumber)}
          sub={filters.region ? 'in the selected region' : 'all regions'}
          tooltip="Incidents opened in the window (region and service filters apply)." />
      </div>

      <Panel title="Service SLOs" flush tooltip="Per service for the window. Select a row to focus the page on that service.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-slate-600">
            <thead className="text-xs uppercase bg-slate-50 text-slate-500 border-b border-slate-200">
              <tr>
                {['Service', 'Availability', 'SLO', 'Error budget', '7-d burn', 'p95 vs SLO', 'Error rate', 'Incidents', 'MTTR', 'Alert noise', 'Downtime cost'].map((h, i) => (
                  <th key={h} scope="col" className={`px-4 py-2.5 font-semibold whitespace-nowrap ${i > 0 ? 'text-right' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums whitespace-nowrap">
              {services.map((s) => {
                const miss = s.availability < s.slo;
                return (
                  <tr key={s.service_id} className={`border-b border-slate-100 hover:bg-slate-50 ${s.service_id === service ? 'bg-sky-50' : ''}`}>
                    <td className="px-4 py-2.5">
                      <button type="button" onClick={() => setService(s.service_id === service ? null : s.service_id)} className="text-left focus:outline-none focus:ring-2 focus:ring-sky-500 rounded">
                        <span className="block font-medium text-slate-900 hover:text-sky-700 whitespace-nowrap">{s.short_name}</span>
                        <span className="block text-xs text-slate-500 whitespace-nowrap">Tier {s.tier} · {s.service_name}</span>
                      </button>
                    </td>
                    <td className={`px-4 py-2.5 text-right ${miss ? 'text-red-700 font-semibold' : ''}`}>{formatPct(s.availability, 3)}{miss ? ' ▼' : ''}</td>
                    <td className="px-4 py-2.5 text-right">{formatPct(s.slo, 2)}</td>
                    <td className="px-4 py-2.5"><BudgetBar remaining={s.budget_remaining} /></td>
                    <td className={`px-4 py-2.5 text-right ${s.burn_rate_7d > 1 ? 'text-red-700 font-semibold' : ''}`}>{s.burn_rate_7d}×</td>
                    <td className={`px-4 py-2.5 text-right ${s.p95_ms > s.slo_p95 ? 'text-amber-700 font-semibold' : ''}`}>{formatNumber(s.p95_ms)} / {formatNumber(s.slo_p95)} ms</td>
                    <td className="px-4 py-2.5 text-right">{formatPct(s.error_rate, 2)}</td>
                    <td className="px-4 py-2.5 text-right">{s.incidents} <span className="text-xs text-slate-500">({s.p1p2} P1/P2)</span></td>
                    <td className="px-4 py-2.5 text-right">{s.mttr_h == null ? '—' : `${Number(s.mttr_h).toFixed(1)} h`}</td>
                    <td className="px-4 py-2.5 text-right">{s.alerts ? formatPct(s.noise_alerts / s.alerts, 0) : '—'}</td>
                    <td className="px-4 py-2.5 text-right">{formatINR(s.downtime_cost)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Panel title={`Daily availability · ${scope}`} tooltip="Uptime ÷ minutes per day. The dashed line is the SLO when one service is selected.">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: INK.axis }} interval="preserveStartEnd" minTickGap={24} />
                <YAxis domain={[(min) => Math.max(0, Math.floor(min * 200) / 200), 1]} allowDataOverflow tickFormatter={(v) => `${(v * 100).toFixed(1)}%`} tick={axisTick} tickLine={false} axisLine={false} width={56} />
                <Tooltip formatter={(v) => [formatPct(v, 3), 'Availability']} {...tooltipStyle} />
                {selected && <ReferenceLine y={selected.slo} stroke={STATUS.critical} strokeDasharray="5 4" label={{ value: `SLO ${formatPct(selected.slo, 2)}`, position: 'insideBottomRight', fill: INK.secondary, fontSize: 11 }} />}
                <Line dataKey="availability" name="Availability" stroke={SERIES[0]} strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title={`Daily p95 latency · ${scope}`} tooltip="Average of the services' daily p95 response time. Dashed line = the selected service's p95 SLO.">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: INK.axis }} interval="preserveStartEnd" minTickGap={24} />
                <YAxis tickFormatter={(v) => `${v} ms`} tick={axisTick} tickLine={false} axisLine={false} width={60} />
                <Tooltip formatter={(v) => [`${formatNumber(v)} ms`, 'p95 latency']} {...tooltipStyle} />
                {selected && <ReferenceLine y={selected.slo_p95} stroke={STATUS.critical} strokeDasharray="5 4" label={{ value: `SLO ${selected.slo_p95} ms`, position: 'insideTopRight', fill: INK.secondary, fontSize: 11 }} />}
                <Line dataKey="p95_ms" name="p95 latency" stroke={SERIES[0]} strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Time to resolve by priority" tooltip="Distribution of resolution times for incidents resolved in the window, against each priority's target.">
          {data ? <MttrByPriority rows={data.priorities} /> : <p className="text-sm text-slate-500">Loading…</p>}
        </Panel>
        <Panel title="Alert → incident funnel" tooltip="How many alerts were raised, how many belonged to a real incident, and how many incidents were severe.">
          {data && (
            <Funnel stages={[
              { label: 'Alerts raised', value: data.funnel.alerts },
              { label: 'Alerts linked to an incident', value: data.funnel.linked_alerts, note: `${formatNumber(data.funnel.alerts - data.funnel.linked_alerts)} were noise` },
              { label: 'Incidents', value: data.funnel.incidents },
              { label: 'P1 / P2 incidents', value: data.funnel.p1p2 },
            ]} />
          )}
        </Panel>
      </div>

      <Panel title={`Incidents · ${scope}`} flush tooltip="Incidents opened in the window. Select one for its lifecycle, alerts and causing deployment.">
        <IncidentsTable rows={incidents.data ?? []} loading={incidents.loading} onOpen={setIncident} />
      </Panel>

      {incident && <IncidentDrawer incidentId={incident} onClose={() => setIncident(null)} />}
    </div>
  );
}
