import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Clock3, GitBranch, GitPullRequestArrow, RotateCcw, ShieldAlert, Undo2 } from 'lucide-react';
import KpiCard from '../../components/KpiCard';
import Panel, { PageHeader } from '../../components/Panel';
import LoadError from '../../components/LoadError';
import IncidentDrawer from '../../components/IncidentDrawer';
import { PriorityBadge } from '../../components/StatusBadge';
import { useRpc } from '../../hooks/useRpc';
import { useItFilters } from '../../hooks/useItFilters';
import { usePatchUrlParams, useUrlParam } from '../../hooks/useUrlParam';
import { downloadCsv } from '../../lib/csv';
import { BLUE_ORDINAL, INK, SERIES, STATUS, axisTick, gridProps, tooltipStyle } from '../../lib/chartTheme';
import { formatNumber, formatPct, formatSignedPct } from '../../lib/format';

const shortDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });
const longDate = (d) => new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' });
const fmtTime = (t) => new Date(t).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const TYPES = ['Code', 'Config', 'Infra']; // colour slots SERIES[0..2], fixed per type
const TYPE_COLOR = { Code: SERIES[0], Config: SERIES[1], Infra: SERIES[2] };
const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const mondayOf = (iso) => addDays(iso, -((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7));
const inputCls = 'rounded-md border border-slate-300 bg-white py-1 px-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500';

// Deployments-per-day ramp: neutral for none, then the ordinal blue ramp
const STEPS = [
  { min: 0, max: 0, color: '#f0efec', label: 'none' },
  { min: 1, max: 1, color: BLUE_ORDINAL[0], label: '1' },
  { min: 2, max: 3, color: BLUE_ORDINAL[1], label: '2–3' },
  { min: 4, max: 5, color: BLUE_ORDINAL[2], label: '4–5' },
  { min: 6, max: Infinity, color: BLUE_ORDINAL[3], label: '6+' },
];
const stepFor = (v) => STEPS.findIndex((s) => v >= s.min && v <= s.max);

/** GitHub-style calendar: one column per week, one row per weekday, count in each day, red dot = a failed deployment. */
function DeploymentCalendar({ calendar, selected, onSelect }) {
  const [hover, setHover] = useState(null);
  const model = useMemo(() => {
    const byDate = new Map(calendar.map((c) => [c.date, c]));
    const weeks = [...new Set(calendar.map((c) => mondayOf(c.date)))];
    const weekTotals = weeks.map((w) => WEEKDAYS.reduce((s, _, i) => s + (byDate.get(addDays(w, i))?.deploys ?? 0), 0));
    const dayTotals = WEEKDAYS.map((_, i) => calendar.filter((c) => (new Date(`${c.date}T00:00:00Z`).getUTCDay() + 6) % 7 === i)
      .reduce((s, c) => s + c.deploys, 0));
    return { byDate, weeks, weekTotals, dayTotals, maxDay: Math.max(1, ...dayTotals) };
  }, [calendar]);
  const { byDate, weeks, weekTotals, dayTotals, maxDay } = model;
  const totals = calendar.reduce((s, c) => ({ d: s.d + c.deploys, f: s.f + c.failed, i: s.i + Number(c.incidents) }), { d: 0, f: 0, i: 0 });
  const busiest = WEEKDAYS[dayTotals.indexOf(Math.max(...dayTotals))];
  const focus = hover ? byDate.get(hover) : selected ? byDate.get(selected) : null;
  const cols = `44px repeat(${weeks.length}, minmax(34px, 44px)) 96px`;

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600">
        <span><b className="text-slate-900 tabular-nums">{formatNumber(totals.d)}</b> deployments</span>
        <span><b className="text-slate-900 tabular-nums">{formatNumber(totals.f)}</b> failed</span>
        <span><b className="text-slate-900 tabular-nums">{formatNumber(totals.i)}</b> incidents caused</span>
        <span>busiest weekday <b className="text-slate-900">{busiest}</b></span>
      </div>
      <div className="overflow-x-auto">
        <div role="grid" aria-label="Deployments per day" className="grid gap-1 text-[11px] justify-start" style={{ gridTemplateColumns: cols, minWidth: 44 + weeks.length * 38 + 96 }}>
          <div />
          {weeks.map((w, i) => (
            <div key={w} className="text-center text-slate-500 whitespace-nowrap">
              {i === 0 || w.slice(5, 7) !== weeks[i - 1].slice(5, 7) ? <b className="font-semibold text-slate-700">{shortDate(w)}</b> : shortDate(w).slice(0, 2)}
            </div>
          ))}
          <div className="pl-2 text-slate-500">per weekday</div>

          {WEEKDAYS.map((wd, r) => (
            <div key={wd} role="row" className="contents">
              <div role="rowheader" className="self-center text-right pr-1 text-slate-600">{wd}</div>
              {weeks.map((w) => {
                const date = addDays(w, r);
                const c = byDate.get(date);
                if (!c) return <div key={date} role="gridcell" aria-label={`${longDate(date)}: outside window`} className="h-9 rounded-md border border-dashed border-slate-200" />;
                const step = stepFor(c.deploys);
                const isSel = selected === date;
                const label = `${longDate(date)}: ${c.deploys} deployments, ${c.failed} failed, ${c.incidents} incidents caused`;
                return (
                  <button key={date} type="button" role="gridcell" aria-label={label} aria-pressed={isSel}
                    onMouseEnter={() => setHover(date)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(date)} onBlur={() => setHover(null)}
                    onClick={() => onSelect(isSel ? null : date)}
                    className={`relative h-9 rounded-md text-xs font-semibold tabular-nums transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-sky-500 ${isSel ? 'ring-2 ring-slate-900 ring-offset-1' : ''}`}
                    style={{ background: STEPS[step].color, color: step >= 3 ? '#fff' : INK.secondary }}>
                    {c.deploys || ''}
                    {c.failed > 0 && <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full ring-2 ring-white" style={{ background: STATUS.critical }} aria-hidden="true" />}
                  </button>
                );
              })}
              <div className="flex items-center gap-1.5 pl-2" aria-label={`${wd}: ${dayTotals[r]} deployments`}>
                <span className="h-2 rounded-full" style={{ width: `${(dayTotals[r] / maxDay) * 56}px`, background: BLUE_ORDINAL[2] }} />
                <span className="tabular-nums text-slate-600">{dayTotals[r]}</span>
              </div>
            </div>
          ))}

          <div className="text-right pr-1 text-slate-500">week</div>
          {weekTotals.map((t, i) => <div key={weeks[i]} className="text-center tabular-nums font-semibold text-slate-700">{t}</div>)}
          <div />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
        <div className="flex flex-wrap items-center gap-3">
          {STEPS.map((s) => (
            <span key={s.label} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-[3px] border border-black/5" style={{ background: s.color }} />{s.label}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: STATUS.critical }} />has a failed deployment</span>
        </div>
        <p className="min-h-4 text-slate-700" aria-live="polite">
          {focus
            ? <><b>{longDate(focus.date)}</b> · {focus.deploys} deployment{focus.deploys === 1 ? '' : 's'} · {focus.failed} failed · {focus.incidents} incident{Number(focus.incidents) === 1 ? '' : 's'} caused{hover ? ' · click to list them' : ''}</>
            : 'Hover a day for details; click it to filter the deployments table.'}
        </p>
      </div>
    </div>
  );
}

/** Change failure rate by service, split by change type (segments add up to the service's CFR). */
function CfrByServiceAndType({ deps, target, onSelectService }) {
  const [type, setType] = useState('All');
  const rows = useMemo(() => {
    const m = new Map();
    const base = deps.filter((d) => d.change_type !== 'Rollback');
    const add = (key, label, serviceId, d) => {
      const r = m.get(key) || { key, label, service_id: serviceId, deploys: 0, failed: 0, ...Object.fromEntries(TYPES.flatMap((t) => [[`n_${t}`, 0], [`f_${t}`, 0]])) };
      r.deploys += 1; r[`n_${d.change_type}`] += 1;
      if (d.status === 'Failed') { r.failed += 1; r[`f_${d.change_type}`] += 1; }
      m.set(key, r);
    };
    for (const d of base) { add(d.service_id, d.short_name, d.service_id, d); add('ALL', 'All services', null, d); }
    const out = [...m.values()].map((r) => {
      const o = { ...r };
      if (type === 'All') {
        for (const t of TYPES) o[t] = r.deploys ? (r[`f_${t}`] / r.deploys) * 100 : 0;
        o.cfr = r.deploys ? (r.failed / r.deploys) * 100 : 0;
        o.n = r.deploys; o.f = r.failed;
      } else {
        o.n = r[`n_${type}`]; o.f = r[`f_${type}`];
        o.cfr = o.n ? (o.f / o.n) * 100 : 0;
        o[type] = o.cfr;
      }
      return o;
    }).filter((o) => o.n > 0);
    const all = out.find((o) => o.key === 'ALL');
    const rest = out.filter((o) => o.key !== 'ALL').sort((a, b) => b.cfr - a.cfr);
    return all && rest.length > 1 ? [all, ...rest] : rest;
  }, [deps, type]);
  const shown = type === 'All' ? TYPES : [type];
  const targetPct = target * 100;

  return (
    <>
      <div role="radiogroup" aria-label="Change type" className="mb-3 inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
        {['All', ...TYPES].map((t) => (
          <button key={t} type="button" role="radio" aria-checked={type === t} onClick={() => setType(t)}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 font-medium focus:outline-none focus:ring-2 focus:ring-sky-500 ${type === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
            {t !== 'All' && <span className="h-2 w-2 rounded-full" style={{ background: TYPE_COLOR[t] }} aria-hidden="true" />}
            {t === 'All' ? 'All types' : t}
          </button>
        ))}
      </div>
      {!rows.length ? <p className="text-sm text-slate-500">No deployments in this window.</p> : (
        <div style={{ height: Math.max(200, rows.length * 32 + 70) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows.map((r) => ({ ...r, value: `${r.cfr.toFixed(0)}% · ${r.f}/${r.n}` }))} layout="vertical" margin={{ top: 22, right: 8, left: 8, bottom: 0 }} barCategoryGap={8}>
              <CartesianGrid stroke={INK.grid} horizontal={false} />
              <XAxis type="number" domain={[0, (max) => Math.max(30, Math.ceil(max / 5) * 5)]} tickFormatter={(v) => `${v}%`} tick={axisTick} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="label" width={100} tickLine={false} axisLine={{ stroke: INK.axis }}
                tick={({ x, y, payload }) => (
                  <text x={x} y={y} dy={4} textAnchor="end" fontSize={12} fill={payload.value === 'All services' ? INK.primary : INK.secondary} fontWeight={payload.value === 'All services' ? 600 : 400}>{payload.value}</text>
                )} />
              <YAxis yAxisId="value" orientation="right" type="category" dataKey="value" width={88} tick={{ fontSize: 11, fill: INK.secondary }} tickLine={false} axisLine={false} />
              <Tooltip {...tooltipStyle} cursor={{ fill: '#f1f5f9' }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const r = payload[0].payload;
                  return (
                    <div className="rounded-lg border border-black/10 bg-white px-3 py-2 text-xs shadow-sm">
                      <p className="font-semibold text-slate-700">{r.label}{type !== 'All' ? ` · ${type}` : ''}</p>
                      <p className="text-slate-900">CFR {r.cfr.toFixed(1)}% · {r.f} of {r.n} failed {r.cfr > targetPct ? <span className="font-semibold" style={{ color: STATUS.critical }}>(above target)</span> : ''}</p>
                      {type === 'All' && TYPES.map((t) => r[`n_${t}`] > 0 && (
                        <p key={t} className="flex items-center gap-1.5 text-slate-600">
                          <span className="h-2 w-2 rounded-full" style={{ background: TYPE_COLOR[t] }} />{t}: {r[`f_${t}`]} of {r[`n_${t}`]} failed ({((r[`f_${t}`] / r[`n_${t}`]) * 100).toFixed(0)}%)
                        </p>
                      ))}
                    </div>
                  );
                }} />
              <ReferenceLine x={targetPct} stroke={STATUS.critical} strokeDasharray="5 4" label={{ value: `target ${targetPct}%`, position: 'top', fill: INK.secondary, fontSize: 11 }} />
              {shown.length > 1 && <Legend verticalAlign="bottom" wrapperStyle={{ fontSize: 12, color: INK.secondary }} />}
              {shown.map((t, i) => (
                <Bar key={t} dataKey={t} name={t} stackId="cfr" fill={TYPE_COLOR[t]} maxBarSize={16} isAnimationActive={false}
                  radius={i === shown.length - 1 ? [0, 4, 4, 0] : 0} stroke="#fff" strokeWidth={i < shown.length - 1 ? 1 : 0}
                  cursor="pointer" onClick={(e) => { const r = e.payload ?? e; if (r.service_id) onSelectService(r.service_id); }}
/>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </>
  );
}

/** Deployments per week (per day for short windows), successful vs failed. A bar selects that period in the table. */
function DeploymentTrend({ deps, window: w, onSelectRange }) {
  const daily = (w?.days ?? 30) <= 14;
  const rows = useMemo(() => {
    if (!w) return [];
    const m = new Map();
    for (let d = w.d_from; d <= w.d_to; d = addDays(d, 1)) {
      const key = daily ? d : mondayOf(d);
      if (!m.has(key)) m.set(key, { key, from: d, to: d, Successful: 0, Failed: 0, rollbacks: 0 });
      m.get(key).to = d;
    }
    for (const d of deps) {
      const day = d.deploy_time.slice(0, 10);
      const r = m.get(daily ? day : mondayOf(day));
      if (!r) continue;
      if (d.change_type === 'Rollback') r.rollbacks += 1;
      else if (d.status === 'Failed') r.Failed += 1;
      else r.Successful += 1;
    }
    return [...m.values()].map((r) => ({ ...r, label: daily ? longDate(r.from).slice(0, 3) + ' ' + shortDate(r.from).slice(0, 2) : shortDate(r.from) }));
  }, [deps, w, daily]);

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="20%">
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: INK.axis }} interval="preserveStartEnd" />
          <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} width={32} />
          <Tooltip {...tooltipStyle} cursor={{ fill: '#f1f5f9' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const r = payload[0].payload;
              const n = r.Successful + r.Failed;
              return (
                <div className="rounded-lg border border-black/10 bg-white px-3 py-2 text-xs shadow-sm">
                  <p className="font-semibold text-slate-700">{daily ? longDate(r.from) : `Week of ${shortDate(r.from)}${r.from !== r.to ? ` – ${shortDate(r.to)}` : ''}`}</p>
                  <p className="text-slate-900">{n} deployments · {r.Failed} failed{n ? ` (CFR ${((r.Failed / n) * 100).toFixed(0)}%)` : ''}</p>
                  {r.rollbacks > 0 && <p className="text-slate-600">{r.rollbacks} rollback{r.rollbacks === 1 ? '' : 's'}</p>}
                  <p className="mt-1 text-slate-500">Click to list them</p>
                </div>
              );
            }} />
          <Legend wrapperStyle={{ fontSize: 12, color: INK.secondary }} />
          <Bar dataKey="Successful" stackId="d" fill={SERIES[0]} stroke="#fff" strokeWidth={1} isAnimationActive={false} cursor="pointer"
            onClick={(e) => onSelectRange((e.payload ?? e).from, (e.payload ?? e).to)} />
          <Bar dataKey="Failed" stackId="d" fill={STATUS.critical} radius={[4, 4, 0, 0]} isAnimationActive={false} cursor="pointer"
            onClick={(e) => onSelectRange((e.payload ?? e).from, (e.payload ?? e).to)} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function ChangeModule() {
  const [service, setService] = useUrlParam('service');
  const [legacyDay] = useUrlParam('day');
  const [fromParam] = useUrlParam('from');
  const [toParam] = useUrlParam('to');
  const [type] = useUrlParam('type');
  const [failedOnly] = useUrlParam('failed');
  const [incident, setIncident] = useUrlParam('incident');
  const patch = usePatchUrlParams();
  const filters = useItFilters({ service });
  const { data, loading, error } = useRpc('it_chg_overview', { p_filters: filters });
  const deps = useRpc('it_chg_deployments', { p_filters: filters, p_limit: 2000 });
  const svcOpts = useRpc('it_rel_overview', { p_filters: { days: filters.days } });

  const from = fromParam ?? legacyDay;
  const to = toParam ?? legacyDay;
  const allDeps = useMemo(() => deps.data ?? [], [deps.data]);
  const tableRows = useMemo(() => allDeps.filter((d) => {
    const day = d.deploy_time.slice(0, 10);
    return (!from || day >= from) && (!to || day <= to) && (!type || d.change_type === type) && (failedOnly !== '1' || d.status === 'Failed');
  }), [allDeps, from, to, type, failedOnly]);
  const singleDay = from && from === to ? from : null;
  const setRange = (f, t) => patch({ from: f, to: t, day: null });
  const filtered = Boolean(from || to || type || failedOnly);

  if (error) return <LoadError error={error} what="Change Impact" />;
  const k = data?.kpis ?? {};
  const w = data?.window;
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
      <PageHeader title="Change Impact" window={w} note="deployments are global; incident share follows the region filter">
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

      <Panel title="Deployment calendar" tooltip="Each square is a day: the number is deployments that day (rollbacks excluded), darker = more. A red dot marks a day with a failed deployment. Click a day to list its deployments below.">
        {data ? <DeploymentCalendar calendar={data.calendar} selected={singleDay} onSelect={(d) => setRange(d, d)} /> : <p className="text-sm text-slate-500">Loading…</p>}
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Panel title="Change failure rate by service and type" tooltip="Failed ÷ deployments per service (rollbacks excluded). With All types, each bar is split by change type and the segments add up to the service's CFR. Pick one type to see that type's own CFR. Select a bar to focus the page on that service.">
          {deps.data ? <CfrByServiceAndType deps={allDeps} target={k.cfr_target ?? 0.15} onSelectService={setService} /> : <p className="text-sm text-slate-500">Loading…</p>}
        </Panel>
        <Panel title={`Deployments per ${(w?.days ?? 30) <= 14 ? 'day' : 'week'}`} tooltip="Successful and failed deployments per period (rollbacks excluded; counted in the tooltip). Shows release waves and whether failures rise with volume. Select a bar to list that period's deployments.">
          {deps.data ? <DeploymentTrend deps={allDeps} window={w} onSelectRange={setRange} /> : <p className="text-sm text-slate-500">Loading…</p>}
        </Panel>
      </div>

      <Panel title="Deployments" flush
        actions={(
          <button type="button" disabled={!tableRows.length} onClick={() => downloadCsv('deployments.csv', tableRows, [
            { key: 'deployment_id', label: 'Deployment' }, { key: 'deploy_time', label: 'Deployed' }, { key: 'short_name', label: 'Service' },
            { key: 'change_type', label: 'Type' }, { key: 'status', label: 'Status' }, { key: 'rolled_back_by', label: 'Rolled back by' },
            { key: 'pr_count', label: 'PRs' }, { key: 'lead_time_hours', label: 'Lead time (h)' },
          ])} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-sky-500">Export CSV</button>
        )}>
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-4 py-3 text-xs text-slate-600">
          <label className="flex flex-col gap-1 font-semibold">From
            <input type="date" value={from ?? ''} min={w?.d_from} max={to ?? w?.d_to} onChange={(e) => patch({ from: e.target.value, to: toParam ?? legacyDay, day: null })} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 font-semibold">To
            <input type="date" value={to ?? ''} min={from ?? w?.d_from} max={w?.d_to} onChange={(e) => patch({ to: e.target.value, from: fromParam ?? legacyDay, day: null })} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 font-semibold">Type
            <select value={type ?? ''} onChange={(e) => patch({ type: e.target.value })} className={inputCls}>
              <option value="">All types</option>
              {[...TYPES, 'Rollback'].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="inline-flex items-center gap-1.5 pb-1.5">
            <input type="checkbox" checked={failedOnly === '1'} onChange={(e) => patch({ failed: e.target.checked ? '1' : null })} className="rounded border-slate-300 focus:ring-sky-500" />
            Failed only
          </label>
          {filtered && <button type="button" onClick={() => patch({ from: null, to: null, day: null, type: null, failed: null })} className="pb-1.5 font-medium text-sky-700 hover:underline focus:outline-none focus:ring-2 focus:ring-sky-500 rounded">Clear filters</button>}
          <span className="ml-auto pb-1.5 tabular-nums">{deps.loading && !deps.data ? 'Loading…' : `${formatNumber(tableRows.length)} of ${formatNumber(allDeps.length)} deployments`}</span>
        </div>
        <div className="overflow-x-auto max-h-[28rem]">
          <table className="w-full text-sm text-left text-slate-600">
            <thead className="text-xs uppercase bg-slate-50 text-slate-500 border-b border-slate-200 sticky top-0">
              <tr>
                {['Deployment', 'Service', 'Type', 'Status', 'PRs', 'Lead time', 'Caused incidents'].map((h) => <th key={h} scope="col" className="px-4 py-2.5 font-semibold whitespace-nowrap">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((d) => (
                <tr key={d.deployment_id} className="border-b border-slate-100">
                  <td className="px-4 py-2.5"><span className="font-medium text-slate-900">{d.deployment_id}</span><span className="block text-xs text-slate-500">{fmtTime(d.deploy_time)}</span></td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{d.short_name}</td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-1.5">
                      {TYPE_COLOR[d.change_type] && <span className="h-2 w-2 rounded-full" style={{ background: TYPE_COLOR[d.change_type] }} aria-hidden="true" />}
                      {d.change_type}
                    </span>
                    {d.rollback_of ? <span className="block text-xs text-slate-500">of {d.rollback_of}</span> : null}
                  </td>
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
              {!deps.loading && !tableRows.length && <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-500">No deployments match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>

      {incident && <IncidentDrawer incidentId={incident} onClose={() => setIncident(null)} />}
    </div>
  );
}
