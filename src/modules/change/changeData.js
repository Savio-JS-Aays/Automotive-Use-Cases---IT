// Deployments page calculations, done in the browser so every card and chart can follow the page filters
// (service, change type). With no filters they reproduce it_chg_overview exactly (checked 2026-10-07).
import { SERIES } from '../../lib/chartTheme';

export const TYPES = ['Code', 'Config', 'Infra'];
export const TYPE_COLOR = { Code: SERIES[0], Config: SERIES[1], Infra: SERIES[2] }; // fixed per type
export const OUTCOMES = [
  { value: '', label: 'All outcomes' },
  { value: 'success', label: 'Successful' },
  { value: 'failed', label: 'Failed' },
  { value: 'rolledback', label: 'Failed · rolled back' },
  { value: 'fixforward', label: 'Failed · fixed forward' },
  { value: 'incident', label: 'Caused an incident' },
];

export const day = (d) => d.deploy_time.slice(0, 10);
export const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const mondayOf = (iso) => addDays(iso, -((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7));
export const shortDate = (d) => new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });
export const longDate = (d) => new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' });
export const fmtTime = (t) => new Date(t).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
export const fmtHours = (h) => (h == null ? '—' : h < 1.5 ? `${Math.round(h * 60)} min` : `${h.toFixed(1)} h`);
export const median = (xs) => {
  if (!xs.length) return null;
  const a = [...xs].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

/** Hours from deploy to recovery: the rollback, else the last caused incident resolved (null if neither yet). */
export function recoveryHours(dep, byId, incById) {
  if (dep.status !== 'Failed') return null;
  const rb = dep.rolled_back_by ? byId.get(dep.rolled_back_by) : null;
  const fix = dep.incidents.map((i) => incById.get(i.incident_id)?.resolution_time).filter(Boolean).sort().pop();
  const end = rb?.deploy_time ?? fix;
  return end ? (new Date(end) - new Date(dep.deploy_time)) / 36e5 : null;
}

export function outcomeOf(dep) {
  if (dep.change_type === 'Rollback') return 'rollback';
  if (dep.status !== 'Failed') return 'success';
  return dep.rolled_back_by ? 'rolledback' : 'fixforward';
}

export function matchesOutcome(dep, outcome) {
  if (!outcome) return true;
  const o = outcomeOf(dep);
  if (outcome === 'failed') return dep.status === 'Failed';
  if (outcome === 'incident') return dep.incidents.length > 0;
  return o === outcome;
}

/**
 * KPI block for one window. deps = it_chg_deployments rows (both windows), incs = it_ops_incidents rows (both windows,
 * no region filter), scope = { service, ctype, region }.
 */
export function kpisFor(deps, incs, [from, to], days, scope, maps) {
  const inScope = (d) => (!scope.service || d.service_id === scope.service) && (!scope.ctype || d.change_type === scope.ctype);
  const inWin = (iso) => iso >= from && iso <= to;
  const base = deps.filter((d) => d.change_type !== 'Rollback' && inScope(d) && inWin(day(d)));
  const failed = base.filter((d) => d.status === 'Failed');
  const rollbacks = deps.filter((d) => d.change_type === 'Rollback' && inWin(day(d)) && (() => {
    const target = maps.byId.get(d.rollback_of);
    return target ? inScope(target) : !scope.ctype && (!scope.service || d.service_id === scope.service);
  })());
  const recov = failed.map((d) => recoveryHours(d, maps.byId, maps.incById)).filter((h) => h != null);
  const leadType = scope.ctype || 'Code';
  const lead = median(base.filter((d) => d.change_type === leadType && d.lead_time_hours != null).map((d) => Number(d.lead_time_hours)));
  const incWin = incs.filter((i) => inWin(i.open_time.slice(0, 10)) && (!scope.region || i.region_id === scope.region)
    && (!scope.service || i.service_id === scope.service));
  const changeInc = incWin.filter((i) => i.root_cause_type === 'Change' && (!scope.ctype || maps.byId.get(i.deployment_id)?.change_type === scope.ctype));
  return {
    deploys: base.length,
    perDay: base.length / days,
    failed: failed.length,
    cfr: base.length ? failed.length / base.length : null,
    recovery: median(recov),
    lead, leadType,
    rollbacks: rollbacks.length,
    rollbackRate: base.length ? rollbacks.length / base.length : null,
    incidents: incWin.length,
    changeIncidents: changeInc.length,
    changeShare: incWin.length ? changeInc.length / incWin.length : null,
  };
}
