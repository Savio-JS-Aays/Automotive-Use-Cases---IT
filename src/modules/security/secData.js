// Security page helpers. KPIs are recomputed in the browser so they can follow the sidebar filters (Department,
// Asset Class, Region); with no filters they reproduce it_sec_overview.kpis exactly (checked 2026-10-07).
import { PRIORITY_COLOR, SERIES, STATUS } from '../../lib/chartTheme';

export const SEVERITIES = ['Critical', 'High', 'Medium', 'Low'];
export const SEV_COLOR = { Critical: STATUS.critical, High: STATUS.serious, Medium: STATUS.warning, Low: '#b8b6ac' };
export const SEV_TEXT = { Critical: 'text-red-700', High: 'text-orange-700', Medium: 'text-amber-700', Low: 'text-slate-500' };
export const ASSET_CLASSES = ['OT device', 'Server', 'Endpoint', 'Network device', 'SaaS configuration'];
// Security incident severity 1–3 (1 = most severe), shown with words
export const INC_SEV = { 1: { label: 'Sev 1 · critical', color: PRIORITY_COLOR[1] }, 2: { label: 'Sev 2 · high', color: PRIORITY_COLOR[2] }, 3: { label: 'Sev 3 · moderate', color: PRIORITY_COLOR[3] } };
// Age bands since discovery (ordinal blue, youngest light → oldest dark)
export const AGE_BANDS = [
  { key: '0–15 d', max: 15, color: '#86b6ef' },
  { key: '16–30 d', max: 30, color: '#3987e5' },
  { key: '31–60 d', max: 60, color: '#256abf' },
  { key: '61–90 d', max: 90, color: '#184f95' },
  { key: '90+ d', max: Infinity, color: '#0d366b' },
];
export const ageBand = (days) => AGE_BANDS.find((b) => days <= b.max).key;

// Threat feed vectors (it_fact_threat_daily) and the incident vector each one maps to (it_fact_security_incident)
export const THREAT_VECTORS = ['Intrusion attempt', 'Phishing email', 'Credential stuffing', 'Malware', 'DDoS'];
export const VECTOR_COLOR = Object.fromEntries(THREAT_VECTORS.map((v, i) => [v, SERIES[i]]));
export const INCIDENT_VECTOR_OF = { 'Intrusion attempt': 'Vulnerability exploit', 'Phishing email': 'Phishing', 'Credential stuffing': 'Credential stuffing', Malware: 'Malware', DDoS: 'DDoS' };

export const hoursBetween = (a, b) => (a && b ? (new Date(b) - new Date(a)) / 36e5 : null);
export const fmtH = (h) => (h == null ? '—' : h < 1.5 ? `${Math.round(h * 60)} min` : h < 48 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} d`);
export const fmtDT = (t) => (t ? new Date(t).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
export const median = (xs) => {
  if (!xs.length) return null;
  const a = [...xs].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
export const inRange = (iso, from, to) => iso >= from && iso <= to;

/** KPI block mirroring it_sec_overview; vulns = it_sec_vulns(all statuses), incs/phish/threats = table rows. */
export function secKpis({ vulns, incs, phish, threats, w }) {
  const open = vulns.filter((v) => v.status === 'Open');
  const patched = vulns.filter((v) => v.patched_date && inRange(v.patched_date, w.d_from, w.d_to));
  const det = incs.filter((i) => inRange(i.detected_time.slice(0, 10), w.d_from, w.d_to));
  const months = [...new Set(phish.filter((p) => p.campaign_date <= w.as_of).map((p) => p.campaign_date.slice(0, 7)))].sort();
  const last = months[months.length - 1];
  const lastRows = phish.filter((p) => p.campaign_date.slice(0, 7) === last);
  const th = threats.filter((t) => inRange(t.date_id, w.d_from, w.d_to));
  const sum = (xs, k) => xs.reduce((s, x) => s + Number(x[k]), 0);
  return {
    openCritical: open.filter((v) => v.severity === 'Critical').length,
    openHigh: open.filter((v) => v.severity === 'High').length,
    pastSla: open.filter((v) => ['Critical', 'High'].includes(v.severity) && v.due_date < w.as_of).length,
    patchSla: patched.length ? patched.filter((v) => v.patched_date <= v.due_date).length / patched.length : null,
    incidents: det.length,
    openIncidents: incs.filter((i) => i.status !== 'Resolved').length,
    mttd: median(det.map((i) => hoursBetween(i.impact_start_time, i.detected_time))),
    mttc: median(det.filter((i) => i.contained_time).map((i) => hoursBetween(i.detected_time, i.contained_time))),
    phishClick: lastRows.length ? sum(lastRows, 'clicked') / sum(lastRows, 'emails_sent') : null,
    phishMonth: last,
    blocked: sum(th, 'blocked'),
    blockRate: sum(th, 'detected') ? sum(th, 'blocked') / sum(th, 'detected') : null,
  };
}
