import { BellRing, GitPullRequestArrow, MapPin } from 'lucide-react';
import Drawer from './Drawer';
import { PriorityBadge } from './StatusBadge';
import { useRpc } from '../hooks/useRpc';

const fmtTime = (t) => (t ? new Date(t).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const mins = (a, b) => (a && b ? Math.round((new Date(b) - new Date(a)) / 60000) : null);
const fmtDur = (m) => (m === null ? '—' : m < 90 ? `${m} min` : `${(m / 60).toFixed(1)} h`);

/**
 * Incident drill-down: lifecycle (impact → detected → opened → acknowledged → resolved), its alerts,
 * and the deployment that caused it (for change-induced incidents).
 */
export default function IncidentDrawer({ incidentId, onClose }) {
  const { data, loading, error } = useRpc('it_ops_incident_detail', { p_incident_id: incidentId }, Boolean(incidentId));
  if (!incidentId) return null;
  const i = data?.incident;
  const steps = i ? [
    { label: 'Impact started', t: i.impact_start_time },
    { label: 'Detected (first alert)', t: i.detected_time, gap: `MTTD ${fmtDur(mins(i.impact_start_time, i.detected_time))}` },
    { label: 'Incident opened', t: i.open_time },
    { label: 'Acknowledged', t: i.acknowledged_time, gap: `MTTA ${fmtDur(mins(i.open_time, i.acknowledged_time))}` },
    { label: i.resolution_time ? 'Resolved' : 'Still open', t: i.resolution_time, gap: i.resolution_time ? `MTTR ${fmtDur(i.mttr_minutes)}` : null },
  ] : [];

  return (
    <Drawer open onClose={onClose} title={i ? `${i.incident_id} · ${i.title}` : incidentId} subtitle={i ? `${i.service_name} · ${i.root_cause_type} · ${i.status}` : 'Loading…'} width="max-w-2xl">
      {error && <p className="text-sm text-red-700">{error.message}</p>}
      {loading && !i && <p className="text-sm text-slate-500">Loading…</p>}
      {i && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <PriorityBadge priority={i.priority} />
            <span className="text-slate-600">{i.affected_business_unit}</span>
            {i.region_name && <span className="inline-flex items-center gap-1 text-slate-600"><MapPin size={14} aria-hidden="true" />{i.region_name}{i.location_name ? ` · ${i.location_name}` : ''}</span>}
            <span className="text-slate-500">Causal confidence {i.causal_confidence_score}%</span>
          </div>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-600">Lifecycle</h3>
            <ol className="relative ml-2 border-l border-slate-200">
              {steps.map((s) => (
                <li key={s.label} className="mb-3 ml-4 last:mb-0">
                  <span className={`absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full ${s.t ? 'bg-sky-600' : 'bg-white border-2 border-amber-500'}`} aria-hidden="true" />
                  <p className="text-sm font-medium text-slate-800">{s.label} <span className="font-normal text-slate-500">· {fmtTime(s.t)}</span></p>
                  {s.gap && <p className="text-xs text-slate-500">{s.gap}</p>}
                </li>
              ))}
            </ol>
          </section>

          {data.deployment && (
            <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide"><GitPullRequestArrow size={14} aria-hidden="true" />Caused by deployment</h3>
              <p><span className="font-semibold">{data.deployment.deployment_id}</span> · {data.deployment.change_type} · {data.deployment.pr_count} PR(s) · deployed {fmtTime(data.deployment.deploy_time)}</p>
              <p className="text-xs mt-1">
                {data.deployment.rollback_time ? `Rolled back ${fmtTime(data.deployment.rollback_time)}` : 'Fixed forward (no rollback)'} · link confidence {data.deployment.confidence}%
              </p>
            </section>
          )}

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-600"><BellRing size={14} aria-hidden="true" />Alerts ({data.alerts.length})</h3>
            <ul className="divide-y divide-slate-100 text-sm">
              {data.alerts.map((a) => (
                <li key={a.alert_id} className="flex items-center justify-between py-1.5">
                  <span className="text-slate-700">{a.alert_id}</span>
                  <span className="text-slate-500">{fmtTime(a.alert_time)}</span>
                  <span className={`text-xs font-semibold ${a.severity === 'Critical' ? 'text-red-700' : a.severity === 'High' ? 'text-amber-700' : 'text-slate-600'}`}>{a.severity}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </Drawer>
  );
}
