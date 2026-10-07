import { useEffect, useMemo, useState } from 'react';
import KpiCard from '../../components/KpiCard';
import Panel, { PageHeader } from '../../components/Panel';
import LoadError from '../../components/LoadError';
import IncidentDrawer from '../../components/IncidentDrawer';
import { PriorityBadge } from '../../components/StatusBadge';
import { useRpc } from '../../hooks/useRpc';
import { useItFilters } from '../../hooks/useItFilters';
import { usePatchUrlParams, useUrlParam } from '../../hooks/useUrlParam';
import { downloadCsv } from '../../lib/csv';
import { useGlobalStore } from '../../store/useGlobalStore';
import { formatNumber, formatPct, formatSignedPct } from '../../lib/format';
import { OUTCOMES, TYPE_COLOR, day, fmtHours, fmtTime, kpisFor, matchesOutcome, shortDate } from './changeData';
import FailureRateChart from './FailureRateChart';
import DeploymentTrend from './DeploymentTrend';
import ReleaseCalendar from './ReleaseCalendar';
import DeploymentDrawer from './DeploymentDrawer';
import SubTabs from '../../components/SubTabs';
import LeadTimeChart from './LeadTimeChart';
import RecoveryChart from './RecoveryChart';

const inputCls = 'rounded-md border border-slate-200 bg-white py-1.5 px-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500';
const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

export default function ChangeModule() {
  const service = useGlobalStore((st) => st.deployService) || null;
  const ctype = useGlobalStore((st) => st.changeType) || null;
  const setGlobalFilter = useGlobalStore((st) => st.setGlobalFilter);
  const setService = (v) => setGlobalFilter('deployService', v ?? '');
  const setCtype = (v) => setGlobalFilter('changeType', v ?? '');
  const [svcParam] = useUrlParam('service');      // incoming links (Overview pulse, legacy) → global filter
  const [ctypeParam] = useUrlParam('ctype');
  const [legacyType] = useUrlParam('type');
  const [legacyDay] = useUrlParam('day');
  const [fromParam] = useUrlParam('from');
  const [toParam] = useUrlParam('to');
  const [outcomeParam] = useUrlParam('outcome');
  const [legacyFailed] = useUrlParam('failed');
  const [depId] = useUrlParam('dep');
  const [incident] = useUrlParam('incident');
  const patch = usePatchUrlParams();
  const [q, setQ] = useState('');
  const [tabParam] = useUrlParam('tab');
  const tab = tabParam === 'log' ? 'log' : 'performance';

  const outcome = outcomeParam ?? (legacyFailed === '1' ? 'failed' : '');
  const from = fromParam ?? legacyDay;
  const to = toParam ?? legacyDay;

  const filters = useItFilters();
  const ov = useRpc('it_chg_overview', { p_filters: filters });               // window + CFR target
  const deps = useRpc('it_chg_deployments', { p_filters: { days: filters.days * 2 }, p_limit: 5000 });
  const incs = useRpc('it_ops_incidents', { p_filters: { days: filters.days * 2 }, p_limit: 5000 });
  const svcOpts = useRpc('it_rel_overview', { p_filters: { days: filters.days } });
  const services = svcOpts.data?.services ?? [];
  const w = ov.data?.window;
  const target = ov.data?.kpis?.cfr_target ?? 0.15;

  const allDeps = useMemo(() => deps.data ?? [], [deps.data]);
  const maps = useMemo(() => ({
    byId: new Map(allDeps.map((d) => [d.deployment_id, d])),
    incById: new Map((incs.data ?? []).map((i) => [i.incident_id, i])),
  }), [allDeps, incs.data]);
  const scope = useMemo(() => ({ service, ctype, region: filters.region }), [service, ctype, filters.region]);
  const ready = Boolean(w && deps.data && incs.data);

  const k = useMemo(() => (ready ? kpisFor(allDeps, incs.data, [w.d_from, w.d_to], w.days, scope, maps) : null), [ready, allDeps, incs.data, w, scope, maps]);
  const kp = useMemo(() => (ready ? kpisFor(allDeps, incs.data, [w.p_from, w.p_to], w.days, scope, maps) : null), [ready, allDeps, incs.data, w, scope, maps]);

  // Current-window deployments in page scope (rollbacks excluded) feed the charts; the table also lists rollbacks
  const inWin = (d) => w && day(d) >= w.d_from && day(d) <= w.d_to;
  const scoped = allDeps.filter((d) => inWin(d) && d.change_type !== 'Rollback' && (!service || d.service_id === service) && (!ctype || d.change_type === ctype));
  const tableRows = allDeps.filter((d) => {
    if (!inWin(d)) return false;
    const subject = d.change_type === 'Rollback' ? maps.byId.get(d.rollback_of) ?? d : d;
    if (service && d.service_id !== service) return false;
    if (ctype && subject.change_type !== ctype) return false;
    const dd = day(d);
    if ((from && dd < from) || (to && dd > to)) return false;
    if (!matchesOutcome(d, outcome)) return false;
    const s = q.trim().toLowerCase();
    return !s || d.deployment_id.toLowerCase().includes(s) || d.short_name.toLowerCase().includes(s) || d.incidents.some((i) => i.incident_id.toLowerCase().includes(s));
  });

  useEffect(() => {
    if (!svcParam && !ctypeParam && !legacyType) return;
    if (svcParam) setGlobalFilter('deployService', svcParam);
    if (ctypeParam || legacyType) setGlobalFilter('changeType', ctypeParam || legacyType);
    patch({ service: null, ctype: null, type: null });
  }, [svcParam, ctypeParam, legacyType, setGlobalFilter, patch]);

  // Last 12 months (for the lead-time and recovery charts' "Last 12 months" range); loaded only when picked
  const [histRange, setHistRange] = useState('window');
  const deps365 = useRpc('it_chg_deployments', { p_filters: { days: 365 }, p_limit: 6000 }, histRange === 'year');
  const incs365 = useRpc('it_ops_incidents', { p_filters: { days: 365 }, p_limit: 6000 }, histRange === 'year');
  const yearMaps = useMemo(() => (deps365.data && incs365.data ? {
    byId: new Map(deps365.data.map((d) => [d.deployment_id, d])),
    incById: new Map(incs365.data.map((i) => [i.incident_id, i])),
  } : null), [deps365.data, incs365.data]);
  const yearScoped = (deps365.data ?? []).filter((d) => d.change_type !== 'Rollback' && (!service || d.service_id === service) && (!ctype || d.change_type === ctype));
  const yearLoading = histRange === 'year' && !(deps365.data && incs365.data);

  if (ov.error) return <LoadError error={ov.error} what="Deployments" />;
  const show = (v, fmt) => (!k ? '…' : v === null || v === undefined ? '—' : fmt(v));
  const rel = (c, p) => (c != null && p ? c / p - 1 : null);
  const pts = (c, p) => (c != null && p != null ? c - p : null);
  const d1 = (val, tone, fmt) => (val === null ? null : { delta: `${fmt(val)} vs prior`, deltaTone: tone(val) });
  const lower = (v) => (v > 0 ? 'bad' : 'good');
  const freqD = k && kp ? rel(k.perDay, kp.perDay) : null;
  const svcName = services.find((s) => s.service_id === service)?.short_name;
  const filterNote = [svcName, ctype && `${ctype} changes`].filter(Boolean).join(' · ');
  // Anything that filters the deployment table switches to the Calendar & log tab, then scrolls to the table
  const toLog = (extra) => { patch({ tab: 'log', ...extra }); setTimeout(() => scrollTo('deployments'), 50); };
  const openTable = (o) => toLog({ outcome: o, failed: null });
  const setRange = (f, t) => toLog({ from: f, to: t, day: null });
  const tableFiltered = Boolean(from || to || outcome || q);

  return (
    <div className="space-y-6 pb-10">
      <PageHeader title="Deployments" window={w}
        note={`${filterNote ? `showing ${filterNote} (sidebar filters) · ` : ''}deployment metrics are global; the change-induced incident share follows the Region filter`} />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <KpiCard title="Deployment Frequency" value={show(k?.perDay, (v) => `${v.toFixed(2)} / day`)}
          sub={k ? `${formatNumber(k.deploys)} deployments in ${w.days} days` : null}
          {...(d1(freqD, () => 'neutral', (v) => formatSignedPct(v)) ?? {})}
          tooltip="DORA: production deployments per calendar day in the window (rollbacks excluded). Follows the Service and Change type filters." />
        <KpiCard title="Change Failure Rate" value={show(k?.cfr, (v) => formatPct(v))}
          sub={k ? `${k.failed} failed · target ≤ ${formatPct(target, 0)}` : null}
          {...(d1(k && kp ? pts(k.cfr, kp.cfr) : null, lower, (v) => formatSignedPct(v, 1, ' pts')) ?? {})}
          onClick={() => openTable('failed')}
          tooltip="DORA: failed deployments ÷ deployments (rollbacks excluded). A deployment fails when it degraded service and needed a rollback or a fix. Click to list the failed deployments." />
        <KpiCard title="Failed Deploy Recovery" value={show(k?.recovery, fmtHours)}
          sub="median, deploy → service restored"
          {...(d1(k && kp ? rel(k.recovery, kp.recovery) : null, lower, (v) => formatSignedPct(v)) ?? {})}
          onClick={() => openTable('failed')}
          tooltip="DORA: median time from a failed deployment to its rollback or, if it was fixed forward, to the resolution of the last incident it caused. Measured from the deploy time. Click to list the failed deployments." />
        <KpiCard title={`Lead Time${k?.leadType ? ` · ${k.leadType}` : ''}`} value={show(k?.lead, fmtHours)}
          sub="median, first commit → production"
          {...(d1(k && kp ? rel(k.lead, kp.lead) : null, lower, (v) => formatSignedPct(v)) ?? {})}
          tooltip="DORA: median hours from first commit to production. Code changes by default; pick a Change type to see Config or Infra lead time." />
        <KpiCard title="Rollback Rate" value={show(k?.rollbackRate, (v) => formatPct(v))}
          sub={k ? `${k.rollbacks} rolled back · ${k.failed - k.rollbacks > 0 ? `${k.failed - k.rollbacks} fixed forward` : 'none fixed forward'}` : null}
          {...(d1(k && kp ? pts(k.rollbackRate, kp.rollbackRate) : null, lower, (v) => formatSignedPct(v, 1, ' pts')) ?? {})}
          onClick={() => openTable('rolledback')}
          tooltip="Rollback deployments ÷ deployments. A failed release is either rolled back or fixed forward. Click to list the rolled-back deployments." />
        <KpiCard title="Change-Induced Incidents" value={show(k?.changeShare, (v) => formatPct(v))}
          sub={k ? `${k.changeIncidents} of ${k.incidents} incidents` : null}
          {...(d1(k && kp ? pts(k.changeShare, kp.changeShare) : null, lower, (v) => formatSignedPct(v, 1, ' pts')) ?? {})}
          onClick={() => openTable('incident')}
          tooltip="Incidents caused by a deployment ÷ all incidents (Region filter applies). Click to list the deployments that caused an incident." />
      </div>

      <SubTabs label="Deployments sections" value={tab} onChange={(v) => patch({ tab: v === 'performance' ? null : v })} tabs={[
        { value: 'performance', label: 'Release performance', hint: 'How often releases fail, release volume over time, how long changes take to reach production, and how failed releases were recovered.' },
        { value: 'log', label: 'Calendar & log', hint: 'A calendar of every release day and the full deployment list with filters; select a deployment for its detail.' },
      ]} />

      {tab === 'performance' ? (
        <>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <FailureRateChart deps={scoped} target={target} services={services}
            onPickService={(x) => setService(x === service ? null : x)} onPickType={(t) => setCtype(t === ctype ? null : t)} />
          <DeploymentTrend deps={scoped} window={w} onSelectRange={setRange} />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <LeadTimeChart windowDeps={scoped} yearDeps={yearScoped} yearLoading={yearLoading} range={histRange} setRange={setHistRange} ctype={ctype} />
          <RecoveryChart windowDeps={scoped} yearDeps={yearScoped} yearLoading={yearLoading} maps={maps} yearMaps={yearMaps}
            range={histRange} setRange={setHistRange} onOpenDeployment={(id) => patch({ dep: id })} />
        </div>
        </>
      ) : (
        <>
        <ReleaseCalendar deps={scoped} window={w} selected={from && from === to ? from : null}
          onSelect={(d) => (d ? setRange(d, d) : patch({ from: null, to: null, day: null }))} />

        <div id="deployments" className="scroll-mt-4">
          <Panel title="Deployments" flush
            tooltip="Every deployment in the window for the page filters, newest first. Filter by date, outcome or search; select a deployment ID for its detail (what happened, incidents caused, service availability that day)."
            actions={<button type="button" disabled={!tableRows.length} onClick={() => downloadCsv('deployments.csv', tableRows, [
              { key: 'deployment_id', label: 'Deployment' }, { key: 'deploy_time', label: 'Deployed' }, { key: 'short_name', label: 'Service' },
              { key: 'change_type', label: 'Type' }, { key: 'status', label: 'Status' }, { key: 'rolled_back_by', label: 'Rolled back by' },
              { key: 'pr_count', label: 'PRs' }, { key: 'lead_time_hours', label: 'Lead time (h)' },
            ])} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500">Export CSV</button>}>
            <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-5 py-3 text-xs text-slate-600">
              <label className="flex flex-col gap-1 font-semibold">From
                <input type="date" value={from ?? ''} min={w?.d_from} max={to ?? w?.d_to} onChange={(e) => patch({ from: e.target.value, to: toParam ?? legacyDay, day: null })} className={inputCls} />
              </label>
              <label className="flex flex-col gap-1 font-semibold">To
                <input type="date" value={to ?? ''} min={from ?? w?.d_from} max={w?.d_to} onChange={(e) => patch({ to: e.target.value, from: fromParam ?? legacyDay, day: null })} className={inputCls} />
              </label>
              <label className="flex flex-col gap-1 font-semibold">Outcome
                <select value={outcome} onChange={(e) => patch({ outcome: e.target.value, failed: null })} className={inputCls}>
                  {OUTCOMES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 font-semibold">Search
                <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="DEP…, service, INC…" className={`${inputCls} w-44`} />
              </label>
              {tableFiltered && <button type="button" onClick={() => { patch({ from: null, to: null, day: null, outcome: null, failed: null }); setQ(''); }} className="pb-1.5 font-medium text-blue-700 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded">Clear table filters</button>}
              <span className="ml-auto pb-1.5 tabular-nums">{!ready ? 'Loading…' : `${formatNumber(tableRows.length)} deployment${tableRows.length === 1 ? '' : 's'}${from ? ` · ${shortDate(from)}${to && to !== from ? ` – ${shortDate(to)}` : ''}` : ''}`}</span>
            </div>
            <div className="overflow-x-auto max-h-[30rem]">
              <table className="w-full text-sm text-left text-slate-600">
                <thead className="text-xs uppercase bg-slate-50 text-slate-500 border-b border-slate-200 sticky top-0">
                  <tr>{['Deployment', 'Service', 'Type', 'Outcome', 'PRs', 'Lead time', 'Caused incidents'].map((h) => <th key={h} scope="col" className="px-4 py-2.5 font-semibold whitespace-nowrap">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {tableRows.map((d) => (
                    <tr key={d.deployment_id} className={`border-b border-slate-100 hover:bg-slate-50 ${depId === d.deployment_id ? 'bg-blue-50/60' : ''}`}>
                      <td className="px-4 py-2.5">
                        <button type="button" onClick={() => patch({ dep: d.deployment_id })} className="font-medium text-blue-700 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded">{d.deployment_id}</button>
                        <span className="block text-xs text-slate-500">{fmtTime(d.deploy_time)}</span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">{d.short_name}</td>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-1.5">
                          {TYPE_COLOR[d.change_type] && <span className="h-2 w-2 rounded-full" style={{ background: TYPE_COLOR[d.change_type] }} aria-hidden="true" />}
                          {d.change_type}
                        </span>
                        {d.rollback_of && <span className="block text-xs text-slate-500">undoes {d.rollback_of}</span>}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {d.change_type === 'Rollback' ? <span className="text-slate-600">Rollback</span>
                          : d.status === 'Failed' ? <span className="font-semibold text-red-700">Failed · {d.rolled_back_by ? 'rolled back' : 'fixed forward'}</span>
                            : <span className="text-slate-700">Successful</span>}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums">{d.pr_count ?? '—'}</td>
                      <td className="px-4 py-2.5 tabular-nums whitespace-nowrap">{d.lead_time_hours == null ? '—' : fmtHours(Number(d.lead_time_hours))}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {d.incidents.map((i) => (
                            <button key={i.incident_id} type="button" onClick={() => patch({ incident: i.incident_id })} title={i.title}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-1.5 py-0.5 text-xs hover:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500">
                              {i.incident_id} <PriorityBadge priority={i.priority} />
                            </button>
                          ))}
                          {!d.incidents.length && <span className="text-xs text-slate-400">—</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {ready && !tableRows.length && <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-500">No deployments match these filters.</td></tr>}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
        </>
      )}

      {depId && ready && (
        <DeploymentDrawer depId={depId} maps={maps} deps={allDeps.filter(inWin)} filters={filters}
          onClose={() => patch({ dep: null })}
          onOpenDeployment={(id) => patch({ dep: id })}
          onOpenIncident={(id) => patch({ dep: null, incident: id })} />
      )}
      {incident && <IncidentDrawer incidentId={incident} onClose={() => patch({ incident: null })} />}
    </div>
  );
}
