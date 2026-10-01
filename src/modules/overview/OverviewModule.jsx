import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Activity, AlarmClock, ArrowRight, BadgeIndianRupee, Gauge, Siren, Timer, TrendingDown } from 'lucide-react';
import KpiCard from '../../components/KpiCard';
import Panel, { PageHeader } from '../../components/Panel';
import Heatmap from '../../components/Heatmap';
import StatusBadge from '../../components/StatusBadge';
import LoadError from '../../components/LoadError';
import Drawer from '../../components/Drawer';
import IncidentDrawer from '../../components/IncidentDrawer';
import IncidentsTable from '../../components/IncidentsTable';
import { useRpc } from '../../hooks/useRpc';
import { useItFilters } from '../../hooks/useItFilters';
import { usePatchUrlParams, useUrlParam } from '../../hooks/useUrlParam';
import { AVAILABILITY_BUCKETS, availabilityColor } from '../../lib/chartTheme';
import { formatINR, formatNumber, formatPct, formatSignedPct } from '../../lib/format';

const shortDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

function deltaPts(cur, prev) {
  if (cur === null || cur === undefined || prev === null || prev === undefined) return null;
  return cur - prev;
}

export default function OverviewModule() {
  const filters = useItFilters();
  const { data, loading, error } = useRpc('it_ops_overview', { p_filters: filters });
  const [cell, setCell] = useUrlParam('cell');           // "SRV002|2026-09-12"
  const [incident, setIncident] = useUrlParam('incident');
  const patchUrl = usePatchUrlParams();
  const [cellService, cellDate] = cell ? cell.split('|') : [null, null];
  const cellIncidents = useRpc('it_ops_incidents', { p_filters: { ...filters, service: cellService }, p_date: cellDate }, Boolean(cell));

  const heat = useMemo(() => {
    if (!data) return null;
    const byKey = new Map(data.heatmap.map((c) => [`${c.service_id}|${c.date}`, c.availability]));
    const dates = [...new Set(data.heatmap.map((c) => c.date))].sort();
    return {
      rows: data.services.map((s) => ({ key: s.service_id, label: s.short_name })),
      cols: dates.map((d) => ({ key: d, label: shortDate(d) })),
      value: (r, c) => byKey.get(`${r}|${c}`) ?? null,
    };
  }, [data]);

  if (error) return <LoadError error={error} what="the Overview" />;
  const k = data?.kpis ?? {};
  const daily = data?.daily ?? [];
  const show = (v, fmt) => (loading && !data ? '…' : fmt(v));
  const sloDelta = deltaPts(k.slo_attainment, k.slo_attainment_prev);
  const mttrDelta = k.mttr_h_prev ? k.mttr_h / k.mttr_h_prev - 1 : null;
  const p1Delta = k.p1_prev !== undefined ? k.p1 - k.p1_prev : null;

  return (
    <div className="space-y-6 pb-10">
      <PageHeader title="IT Executive Overview" window={data?.window} />

      {/* Scorecard */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {(data?.scorecard ?? []).map((s) => (
          <Link key={s.area} to={s.link} className="group bg-white rounded-xl shadow-sm border border-slate-200 p-4 hover:border-sky-300 hover:shadow focus:outline-none focus:ring-2 focus:ring-sky-500">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-slate-700">{s.area}</span>
              <StatusBadge status={s.status} />
            </div>
            <p className="mt-2 text-3xl font-semibold text-slate-900">{s.score}<span className="text-base font-normal text-slate-400">/100</span></p>
            <p className="mt-1 text-xs text-slate-500">{s.headline}</p>
            <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-sky-700 group-hover:underline">Open <ArrowRight size={12} aria-hidden="true" /></span>
          </Link>
        ))}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard title="SLO Attainment" value={show(k.slo_attainment, (v) => formatPct(v, 0))}
          sub={`${formatNumber(k.services_meeting)} of ${formatNumber(k.services)} services meet their availability SLO`}
          delta={sloDelta !== null ? `${formatSignedPct(sloDelta, 0, ' pts')} vs prior` : null} deltaTone={sloDelta > 0 ? 'good' : sloDelta < 0 ? 'bad' : 'neutral'}
          spark={daily.map((d) => d.availability)} icon={<Gauge size={20} />}
          tooltip="Share of services whose availability in the window is at or above their SLO. The sparkline is portfolio availability per day." />
        <KpiCard title="Error Budget Remaining" value={show(k.error_budget_remaining, (v) => formatPct(v, 0))}
          sub="portfolio: 1 − downtime ÷ allowed downtime" deltaTone="bad"
          delta={k.error_budget_remaining < 0 ? 'Budget overspent' : null} icon={<Activity size={20} />}
          tooltip="Allowed downtime = (1 − SLO) × minutes in the window, summed over services. Negative = more downtime than the SLOs allow." />
        <KpiCard title="P1 Incidents" value={show(k.p1, formatNumber)} icon={<Siren size={20} />}
          delta={p1Delta !== null ? `${p1Delta > 0 ? '+' : ''}${p1Delta} vs prior` : null} deltaTone={p1Delta > 0 ? 'bad' : p1Delta < 0 ? 'good' : 'neutral'}
          sub={`${formatNumber(k.open_incidents)} open now (${formatNumber(k.open_p1p2)} P1/P2)`}
          spark={daily.map((d) => d.p1p2)}
          tooltip="Priority-1 incidents opened in the window. Sparkline: P1+P2 incidents per day." />
        <KpiCard title="Median Time to Resolve" value={show(k.mttr_h, (v) => (v === null ? '—' : `${v.toFixed(1)} h`))} icon={<Timer size={20} />}
          delta={mttrDelta !== null ? `${formatSignedPct(mttrDelta)} vs prior` : null} deltaTone={mttrDelta < 0 ? 'good' : mttrDelta > 0 ? 'bad' : 'neutral'}
          tooltip="Median of (resolution − open) for incidents opened and resolved in the window, all priorities." />
        <KpiCard title="Cost of Downtime" value={show(k.downtime_cost, formatINR)} icon={<AlarmClock size={20} />}
          sub="downtime minutes × service cost per minute"
          tooltip="Σ per service of downtime minutes in the window × that service's cost of downtime per minute (it_dim_service)." />
        <KpiCard title="Licence Contract Value" value={show(k.acv, formatINR)} icon={<BadgeIndianRupee size={20} />}
          sub={`utilisation ${formatPct(k.utilisation)}`}
          tooltip="Annual value of active software contracts (from Licensing & Subscriptions)." />
        <KpiCard title="Licence Shelfware" value={show(k.shelfware, formatINR)} icon={<TrendingDown size={20} />}
          sub="annualised cost of unused seats"
          tooltip="Unassigned + dormant seats × unit price × 12 (from Licensing & Subscriptions)." />
        <KpiCard title="Open Incidents" value={show(k.open_incidents, formatNumber)} icon={<Siren size={20} />}
          sub={`${formatNumber(k.open_p1p2)} of them P1/P2`}
          tooltip="Incidents not yet resolved at the as-of date." />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Panel title="Service availability by day" className="xl:col-span-2"
          tooltip="Each cell is one service on one day. Colour = availability. Select a cell to list that day's incidents for the service.">
          {heat ? (
            <Heatmap rows={heat.rows} cols={heat.cols} value={heat.value} colorFor={availabilityColor}
              titleFor={(r, c, v) => `${r.label} · ${c.label}: ${v === null ? 'no data' : `${(v * 100).toFixed(2)}% available`}`}
              onCell={(r, c) => setCell(`${r.key}|${c.key}`)}
              legend={AVAILABILITY_BUCKETS.map((b) => ({ label: b.label, color: b.color }))} />
          ) : <p className="text-sm text-slate-500">Loading…</p>}
        </Panel>

        <Panel title="Top risks" tooltip="The most urgent items across reliability, cost, security and data, ranked. Each links to the module that owns it.">
          <ul className="space-y-2">
            {(data?.risks ?? []).slice(0, 6).map((r, i) => (
              <li key={i}>
                <Link to={r.link} className="block rounded-lg border border-slate-200 px-3 py-2 hover:border-sky-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium text-slate-900">{r.title}</span>
                    <StatusBadge status={r.severity} label={r.area} />
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{r.detail}</p>
                </Link>
              </li>
            ))}
            {data && !data.risks.length && <li className="text-sm text-slate-500">No open risks.</li>}
          </ul>
          {data?.risks.length > 6 && <p className="mt-2 text-xs text-slate-500">+{data.risks.length - 6} more in the modules.</p>}
        </Panel>
      </div>

      <Drawer open={Boolean(cell)} onClose={() => setCell(null)} width="max-w-3xl"
        title={cell ? `${heat?.rows.find((r) => r.key === cellService)?.label ?? cellService} · ${cellDate ? shortDate(cellDate) : ''}` : ''}
        subtitle={cell ? `Availability ${heat ? formatPct(heat.value(cellService, cellDate), 2) : '…'}` : ''}>
        <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <IncidentsTable rows={cellIncidents.data ?? []} loading={cellIncidents.loading}
            onOpen={(id) => patchUrl({ cell: null, incident: id })} empty="No incidents for this service on this day." />
        </section>
      </Drawer>
      {incident && <IncidentDrawer incidentId={incident} onClose={() => setIncident(null)} />}
    </div>
  );
}
