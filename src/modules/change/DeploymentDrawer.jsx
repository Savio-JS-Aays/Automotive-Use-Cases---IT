import { CheckCircle2, GitPullRequestArrow, RotateCcw, Siren, TriangleAlert, Wrench } from 'lucide-react';
import Drawer from '../../components/Drawer';
import { PriorityBadge } from '../../components/StatusBadge';
import { useRpc } from '../../hooks/useRpc';
import { formatPct } from '../../lib/format';
import { day, fmtHours, fmtTime, median, outcomeOf, recoveryHours } from './changeData';

const OUTCOME = {
  success: { label: 'Successful', Icon: CheckCircle2, cls: 'bg-green-50 text-green-800 border-green-200' },
  rolledback: { label: 'Failed · rolled back', Icon: RotateCcw, cls: 'bg-orange-50 text-orange-800 border-orange-200' },
  fixforward: { label: 'Failed · fixed forward', Icon: Wrench, cls: 'bg-red-50 text-red-700 border-red-200' },
  rollback: { label: 'Rollback deployment', Icon: RotateCcw, cls: 'bg-slate-100 text-slate-700 border-slate-200' },
};

function Fact({ label, value, note }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="font-semibold text-slate-900">{value}</p>
      {note && <p className="text-xs text-slate-500">{note}</p>}
    </div>
  );
}

/**
 * Deployment drill-down: outcome, lead time vs its type, what happened after (timeline of rollback / incidents),
 * the incidents it caused, the service's availability that day, and nearby deployments to the same service.
 * Built from rows already loaded on the page (it_chg_deployments + it_ops_incidents) plus it_rel_daily for the service.
 */
export default function DeploymentDrawer({ depId, maps, deps, filters, onClose, onOpenDeployment, onOpenIncident }) {
  const d = maps.byId.get(depId);
  const daily = useRpc('it_rel_daily', { p_filters: { days: filters.days, service: d?.service_id } }, Boolean(d));
  if (!d) return null;

  const o = OUTCOME[outcomeOf(d)];
  const rb = d.rolled_back_by ? maps.byId.get(d.rolled_back_by) : null;
  const target = d.rollback_of ? maps.byId.get(d.rollback_of) : null;
  const incs = d.incidents.map((i) => ({ ...i, ...(maps.incById.get(i.incident_id) ?? {}) }));
  const rec = recoveryHours(d, maps.byId, maps.incById);
  const sameType = deps.filter((x) => x.change_type === d.change_type && x.lead_time_hours != null).map((x) => Number(x.lead_time_hours));
  const typMed = median(sameType);
  const avail = (daily.data ?? []).find((r) => r.date === day(d))?.availability;
  const near = deps.filter((x) => x.service_id === d.service_id && x.deployment_id !== d.deployment_id && Math.abs(new Date(x.deploy_time) - new Date(d.deploy_time)) <= 3 * 864e5)
    .sort((a, b) => a.deploy_time.localeCompare(b.deploy_time));

  const events = [
    { t: d.deploy_time, label: `Deployed (${d.change_type}, ${d.pr_count} PR${d.pr_count === 1 ? '' : 's'})`, Icon: GitPullRequestArrow },
    ...incs.filter((i) => i.open_time).map((i) => ({ t: i.open_time, label: `Incident ${i.incident_id} opened (P${i.priority})`, Icon: Siren, tone: 'text-red-700' })),
    ...(rb ? [{ t: rb.deploy_time, label: `Rolled back by ${rb.deployment_id}`, Icon: RotateCcw, tone: 'text-orange-700' }] : []),
    ...incs.filter((i) => i.resolution_time).map((i) => ({ t: i.resolution_time, label: `Incident ${i.incident_id} resolved`, Icon: CheckCircle2, tone: 'text-green-800' })),
  ].sort((a, b) => a.t.localeCompare(b.t));
  const after = (t) => { const h = (new Date(t) - new Date(d.deploy_time)) / 36e5; return h <= 0 ? '' : `+${fmtHours(h)}`; };

  return (
    <Drawer open onClose={onClose} width="max-w-2xl" title={`${d.deployment_id} · ${d.short_name}`}
      subtitle={`${d.change_type} change · deployed ${fmtTime(d.deploy_time)}`}>
      <div className="space-y-4">
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm font-semibold ${o.cls}`}><o.Icon size={14} aria-hidden="true" />{o.label}</span>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Fact label="Pull requests" value={d.pr_count ?? '—'} />
          <Fact label="Lead time" value={d.lead_time_hours == null ? '—' : fmtHours(Number(d.lead_time_hours))}
            note={typMed != null && d.lead_time_hours != null ? `${d.change_type} median ${fmtHours(typMed)}` : null} />
          <Fact label="Time to recover" value={d.status === 'Failed' ? fmtHours(rec) : 'n/a'} note={d.status === 'Failed' ? (rb ? 'to rollback' : 'to last incident resolved') : 'did not fail'} />
          <Fact label={`${d.short_name} availability that day`} value={avail == null ? '…' : formatPct(avail, 2)} />
        </div>

        {target && (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">This rollback undid{' '}
            <button type="button" onClick={() => onOpenDeployment(target.deployment_id)} className="font-semibold text-blue-700 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded">{target.deployment_id}</button>.</p>
        )}

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-bold text-slate-900">What happened</h3>
          <ol className="relative ml-2 border-l border-slate-200">
            {events.map((e, i) => (
              <li key={i} className="mb-3 ml-4 last:mb-0">
                <span className="absolute -left-[7px] mt-0.5 rounded-full bg-white"><e.Icon size={14} className={e.tone ?? 'text-blue-700'} aria-hidden="true" /></span>
                <p className={`text-sm font-medium ${e.tone ?? 'text-slate-800'}`}>{e.label}</p>
                <p className="text-xs text-slate-500">{fmtTime(e.t)} {after(e.t) && `· ${after(e.t)} after deploy`}</p>
              </li>
            ))}
            {d.status !== 'Failed' && d.change_type !== 'Rollback' && <li className="ml-4 text-xs text-slate-500">No failure recorded for this deployment.</li>}
          </ol>
        </section>

        {incs.length > 0 && (
          <section className="rounded-xl border border-red-200 bg-red-50/40 p-4">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-900"><TriangleAlert size={15} className="text-red-700" aria-hidden="true" />Incidents caused ({incs.length})</h3>
            <ul className="divide-y divide-red-100">
              {incs.map((i) => (
                <li key={i.incident_id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <button type="button" onClick={() => onOpenIncident(i.incident_id)} className="text-left font-medium text-blue-700 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded">
                    {i.incident_id} · {i.title}
                  </button>
                  <span className="flex items-center gap-2 text-xs text-slate-600">
                    <PriorityBadge priority={i.priority} />
                    {i.status === 'Active' ? <span className="font-semibold text-amber-700">open</span> : `fixed in ${fmtHours((i.mttr_minutes ?? 0) / 60)}`}
                    {i.confidence != null && <span>· link confidence {i.confidence}%</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-bold text-slate-900">Other {d.short_name} deployments within 3 days</h3>
          {!near.length ? <p className="text-sm text-slate-500">None.</p> : (
            <ul className="divide-y divide-slate-100 text-sm">
              {near.map((x) => (
                <li key={x.deployment_id} className="flex items-center justify-between gap-2 py-1.5">
                  <button type="button" onClick={() => onOpenDeployment(x.deployment_id)} className="font-medium text-blue-700 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded">{x.deployment_id}</button>
                  <span className="text-slate-600">{x.change_type} · {fmtTime(x.deploy_time)}</span>
                  <span className={`text-xs font-semibold ${x.status === 'Failed' ? 'text-red-700' : 'text-slate-500'}`}>{x.change_type === 'Rollback' ? 'Rollback' : x.status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Drawer>
  );
}
