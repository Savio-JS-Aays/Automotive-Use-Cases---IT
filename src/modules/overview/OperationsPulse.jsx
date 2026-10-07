import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Heatmap from '../../components/Heatmap';
import Panel from '../../components/Panel';
import Segmented from '../../components/Segmented';
import { useRpc } from '../../hooks/useRpc';
import { fetchAllRows } from '../../lib/fetchAllRows';
import { AVAILABILITY_BUCKETS, BLUE_ORDINAL, PRIORITY_COLOR, STATUS, availabilityColor } from '../../lib/chartTheme';
import { formatMonth, formatPct } from '../../lib/format';
import { UTIL_BUCKETS, utilColor } from '../licensing/constants';

const shortDate = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });
const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const NONE = '#f0efec';

const VIEWS = [
  { value: 'availability', label: 'Availability' },
  { value: 'incidents', label: 'Incidents' },
  { value: 'change', label: 'Change' },
  { value: 'security', label: 'Security' },
  { value: 'licences', label: 'Licences' },
];
const TIPS = {
  availability: 'Each cell is one service on one day; colour = availability. Select a cell to list that day’s incidents for the service.',
  incidents: 'Each cell is one service on one day; colour = the most severe incident opened that day (P1 red → P4 grey). Select a cell to list them.',
  change: 'Each cell is one service on one day: no deployment, deployed cleanly, or at least one failed deployment. Select a cell to open those deployments on the Deployments page.',
  security: 'Critical and high vulnerabilities past their patch SLA on each day, by asset class. Select a cell to open Security.',
  licences: 'Licence utilisation (active 30 d ÷ purchased) by product and month, last 12 months. Licences are measured monthly. Select a cell to open the product.',
};

// Security: open critical/high vulnerabilities past patch SLA per day
const SEC_BUCKETS = [
  { min: 0, max: 0, color: NONE, label: 'none' },
  { min: 1, max: 2, color: AVAILABILITY_BUCKETS[1].color, label: '1–2' },
  { min: 3, max: 5, color: AVAILABILITY_BUCKETS[2].color, label: '3–5' },
  { min: 6, max: 10, color: AVAILABILITY_BUCKETS[3].color, label: '6–10' },
  { min: 11, max: Infinity, color: AVAILABILITY_BUCKETS[4].color, label: '11+' },
];
const secColor = (v) => SEC_BUCKETS.find((b) => v >= b.min && v <= b.max).color;
const CHANGE = { 0: { color: NONE, label: 'no deployment' }, 1: { color: BLUE_ORDINAL[1], label: 'deployed, all succeeded' }, 2: { color: STATUS.critical, label: '≥ 1 failed deployment' } };
const ASSET_CLASSES = ['OT device', 'Server', 'Endpoint', 'Network device', 'SaaS configuration'];

/**
 * Overview "Operations pulse": one heatmap grammar (rows × days) across the modules, switched by a toggle.
 * Follows the Overview scope (date window, region, vertical, service) wherever the underlying data allows.
 */
export default function OperationsPulse({ data, filters, scope, services, software, vertical, service, incidents, onServiceDay, className }) {
  const navigate = useNavigate();
  const [view, setView] = useState('availability');
  const w = data?.window;
  const svc = services.find((x) => x.service_id === service);

  const deps = useRpc('it_chg_deployments', { p_filters: { days: filters.days }, p_limit: 3000 }, view === 'change');
  const licFilters = service ? { region: filters.region, software: svc?.software_id ?? '__none__' } : { region: filters.region, vertical };
  const usage = useRpc('it_lic_usage_matrix', { p_filters: licFilters }, view === 'licences');
  const [vulns, setVulns] = useState(null);
  useEffect(() => {
    if (view !== 'security' || vulns) return undefined;
    let cancelled = false;
    fetchAllRows('it_fact_vulnerability', 'vuln_id, severity, asset_class, software_id, service_id, region_id, discovered_date, due_date, patched_date, status', { orderBy: 'vuln_id' })
      .then((rows) => { if (!cancelled) setVulns(rows); })
      .catch(() => { if (!cancelled) setVulns([]); });
    return () => { cancelled = true; };
  }, [view, vulns]);

  const days = useMemo(() => {
    if (!w) return [];
    const out = [];
    for (let d = w.d_from; d <= w.d_to; d = addDays(d, 1)) out.push(d);
    return out;
  }, [w]);
  const dayCols = days.map((d) => ({ key: d, label: shortDate(d) }));
  const svcRows = (data?.services ?? []).filter((s) => !scope || scope.has(s.service_id)).map((s) => ({ key: s.service_id, label: s.short_name }));

  const model = useMemo(() => {
    if (!data) return null;
    if (view === 'availability') {
      const byKey = new Map(data.heatmap.map((c) => [`${c.service_id}|${c.date}`, c.availability]));
      const cells = data.heatmap.filter((c) => !scope || scope.has(c.service_id));
      const low = cells.filter((c) => c.availability < 0.995);
      const worst = [...cells].sort((a, b) => a.availability - b.availability)[0];
      const name = (id) => data.services.find((s) => s.service_id === id)?.short_name;
      return {
        rows: svcRows, cols: dayCols, value: (r, c) => byKey.get(`${r}|${c}`) ?? null, colorFor: availabilityColor,
        titleFor: (r, c, v) => `${r.label} · ${c.label}: ${v == null ? 'no data' : `${(v * 100).toFixed(2)}% available`}`,
        onCell: (r, c) => onServiceDay(r.key, c.key),
        legend: AVAILABILITY_BUCKETS.map((b) => ({ label: b.label, color: b.color })),
        summary: `${low.length} service-day${low.length === 1 ? '' : 's'} below 99.5%${worst && worst.availability < 1 ? ` · worst: ${name(worst.service_id)} on ${shortDate(worst.date)} (${formatPct(worst.availability, 2)})` : ''}`,
      };
    }
    if (view === 'incidents') {
      const m = new Map();
      for (const i of incidents) {
        const k = `${i.service_id}|${i.open_time.slice(0, 10)}`;
        const x = m.get(k) || { worst: 9, n: 0, ps: [] };
        x.worst = Math.min(x.worst, i.priority); x.n += 1; x.ps.push(`P${i.priority}`);
        m.set(k, x);
      }
      const p1Days = [...m.values()].filter((x) => x.worst === 1).length;
      return {
        rows: svcRows, cols: dayCols, value: (r, c) => m.get(`${r}|${c}`)?.worst ?? 0,
        colorFor: (v) => (v === 0 ? NONE : PRIORITY_COLOR[v]),
        titleFor: (r, c) => { const x = m.get(`${r.key}|${c.key}`); return `${r.label} · ${c.label}: ${x ? `${x.n} incident${x.n === 1 ? '' : 's'} (${x.ps.sort().join(', ')})` : 'no incidents'}`; },
        onCell: (r, c) => onServiceDay(r.key, c.key),
        legend: [{ label: 'none', color: NONE }, ...[1, 2, 3, 4].map((p) => ({ label: `worst P${p}`, color: PRIORITY_COLOR[p] }))],
        summary: `${incidents.length} incidents · ${p1Days} service-day${p1Days === 1 ? '' : 's'} with a P1`,
      };
    }
    if (view === 'change') {
      if (!deps.data) return { loading: true };
      const m = new Map();
      const rows = deps.data.filter((d) => d.change_type !== 'Rollback' && (!scope || scope.has(d.service_id)));
      for (const d of rows) {
        const k = `${d.service_id}|${d.deploy_time.slice(0, 10)}`;
        const x = m.get(k) || { n: 0, f: 0 };
        x.n += 1; if (d.status === 'Failed') x.f += 1;
        m.set(k, x);
      }
      const failed = rows.filter((d) => d.status === 'Failed').length;
      return {
        rows: svcRows, cols: dayCols,
        value: (r, c) => { const x = m.get(`${r}|${c}`); return !x ? 0 : x.f ? 2 : 1; },
        colorFor: (v) => CHANGE[v].color,
        titleFor: (r, c) => { const x = m.get(`${r.key}|${c.key}`); return `${r.label} · ${c.label}: ${x ? `${x.n} deployment${x.n === 1 ? '' : 's'}, ${x.f} failed` : 'no deployments'}`; },
        onCell: (r, c) => navigate(`/deployments?service=${r.key}&from=${c.key}&to=${c.key}`),
        legend: [0, 1, 2].map((k) => ({ label: CHANGE[k].label, color: CHANGE[k].color })),
        summary: `${rows.length} deployments · ${failed} failed (${rows.length ? formatPct(failed / rows.length, 0) : '—'} change failure rate) · deployments are global (no region)`,
      };
    }
    if (view === 'security') {
      if (!vulns) return { loading: true };
      const inScope = vulns.filter((v) => (v.severity === 'Critical' || v.severity === 'High') && v.status !== 'Risk accepted'
        && (!filters.region || !v.region_id || v.region_id === filters.region)
        && (!scope || (v.service_id && scope.has(v.service_id)) || (svc && v.software_id === svc.software_id)
          || (vertical && !service && software.some((s) => s.software_id === v.software_id && s.business_vertical === vertical))));
      const pastSla = (v, d) => v.due_date < d && v.discovered_date <= d && (!v.patched_date || v.patched_date > d);
      const counts = new Map();
      for (const d of days) for (const a of ASSET_CLASSES) counts.set(`${a}|${d}`, inScope.filter((v) => v.asset_class === a && pastSla(v, d)).length);
      const total = (d) => ASSET_CLASSES.reduce((t, a) => t + counts.get(`${a}|${d}`), 0);
      return {
        rows: ASSET_CLASSES.map((a) => ({ key: a, label: a })), cols: dayCols,
        value: (r, c) => counts.get(`${r}|${c}`) ?? 0, colorFor: secColor,
        titleFor: (r, c, v) => `${r.label} · ${c.label}: ${v} critical/high past patch SLA`,
        onCell: () => navigate('/security'),
        legend: SEC_BUCKETS.map((b) => ({ label: b.label, color: b.color })),
        summary: days.length ? `critical/high past patch SLA: ${total(days[0])} on ${shortDate(days[0])} → ${total(days[days.length - 1])} on ${shortDate(days[days.length - 1])}` : '',
      };
    }
    // licences
    if (!usage.data) return { loading: true };
    const cells = usage.data.by_month ?? [];
    const months = [...new Set(cells.map((c) => c.month))].sort().slice(-12);
    const byKey = new Map(cells.map((c) => [`${c.software_id}|${c.month}`, c]));
    const last = months[months.length - 1];
    const products = [...new Map(cells.map((c) => [c.software_id, c.short_name])).entries()]
      .map(([id, name]) => ({ key: id, label: name, util: byKey.get(`${id}|${last}`)?.util ?? 1 }))
      .sort((a, b) => a.util - b.util);
    const below = products.filter((p) => p.util < 0.85).length;
    return {
      rows: products, cols: months.map((m) => ({ key: m, label: formatMonth(m) })),
      value: (r, c) => byKey.get(`${r}|${c}`)?.util ?? null, colorFor: utilColor,
      titleFor: (r, c, v) => `${r.label} · ${c.label}: ${v == null ? 'no data' : `${formatPct(v)} utilised`}`,
      onCell: (r) => navigate(`/licensing-subs/usage?sw=${r.key}&tab=Usage`),
      legend: UTIL_BUCKETS.map((b) => ({ label: b.label, color: b.color })),
      summary: `${below} of ${products.length} products below the 85% target in ${last ? formatMonth(last) : '—'} · least utilised first`,
    };
  }, [view, data, scope, incidents, deps.data, vulns, usage.data, days, filters.region, svc, vertical, service, software]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Panel title="Operations pulse" className={className} tooltip={TIPS[view]}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented label="Module" value={view} onChange={setView} options={VIEWS} />
        {model?.summary && <span className="text-xs text-slate-600">{model.summary}</span>}
      </div>
      {!model || model.loading ? <p className="text-sm text-slate-500">Loading…</p> : !model.rows.length ? (
        <p className="py-6 text-center text-sm text-slate-500">Nothing in scope for this view.</p>
      ) : (
        <Heatmap rows={model.rows} cols={model.cols} value={model.value} colorFor={model.colorFor} titleFor={model.titleFor}
          onCell={model.onCell} legend={model.legend} rowLabelWidth={view === 'security' ? 120 : 100} />
      )}
    </Panel>
  );
}
