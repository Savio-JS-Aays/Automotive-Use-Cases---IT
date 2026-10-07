import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Panel from '../../components/Panel';
import Segmented from '../../components/Segmented';
import { useRpc } from '../../hooks/useRpc';
import { INK, SERIES, axisTick, gridProps, tooltipStyle } from '../../lib/chartTheme';
import { formatINR, formatINRAxis, formatNumber, formatPct } from '../../lib/format';

const shortDate = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });

/**
 * Cost of downtime = downtime minutes × the service's cost per minute.
 * By service: it_rel_overview.services (exact). By day: it_ops_overview.heatmap (service × day availability → minutes).
 */
export default function DowntimeCost({ services = [], filters, className }) {
  const [view, setView] = useState('service');
  const overview = useRpc('it_ops_overview', { p_filters: { days: filters.days } }, view === 'day');

  const bySvc = useMemo(() => services
    .map((s) => ({ key: s.service_id, label: s.short_name, cost: Number(s.downtime_cost || 0), minutes: Math.round(Number(s.downtime_min || 0)), rate: Number(s.cost_per_min) }))
    .filter((s) => s.cost > 0)
    .sort((a, b) => b.cost - a.cost), [services]);
  const total = bySvc.reduce((t, s) => t + s.cost, 0);

  const byDay = useMemo(() => {
    const cells = overview.data?.heatmap ?? [];
    const rate = new Map(services.map((s) => [s.service_id, Number(s.cost_per_min)]));
    const name = new Map(services.map((s) => [s.service_id, s.short_name]));
    const m = new Map();
    for (const c of cells) {
      const minutes = Math.max(0, (1 - c.availability) * 1440);
      const x = m.get(c.date) || { date: c.date, label: shortDate(c.date), cost: 0, parts: [] };
      const cost = minutes * (rate.get(c.service_id) ?? 0);
      x.cost += cost;
      if (cost >= 1) x.parts.push({ name: name.get(c.service_id), minutes: Math.round(minutes), cost });
      m.set(c.date, x);
    }
    return [...m.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [overview.data, services]);
  const worstDay = byDay.reduce((w, d) => (!w || d.cost > w.cost ? d : w), null);

  return (
    <Panel className={className} title="Cost of downtime"
      tooltip="Downtime minutes × each service's agreed cost per minute (it_dim_service). By service shows where the money goes; by day shows when. It is an estimate of business exposure, not booked loss. Service metrics are global (no region).">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Segmented label="View" value={view} onChange={setView} options={[{ value: 'service', label: 'By service' }, { value: 'day', label: 'By day' }]} />
        <p className="text-xs text-slate-600">
          <b className="text-slate-900">{formatINR(total)}</b> in the window
          {bySvc[0] && <> · {bySvc[0].label} {formatPct(bySvc[0].cost / total, 0)} of it</>}
          {view === 'day' && worstDay && worstDay.cost > 0 && <> · worst day {worstDay.label} ({formatINR(worstDay.cost)})</>}
        </p>
      </div>
      {view === 'service' ? (
        !bySvc.length ? <p className="py-6 text-center text-sm text-slate-500">No downtime in this window.</p> : (
          <div style={{ height: Math.max(160, bySvc.length * 34 + 40) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bySvc.map((s) => ({ ...s, value: `${formatINR(s.cost)} · ${formatNumber(s.minutes)} min × ₹${formatNumber(s.rate)}` }))} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid stroke={INK.grid} horizontal={false} />
                <XAxis type="number" tickFormatter={formatINRAxis} tick={axisTick} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="label" width={100} interval={0} tick={{ fontSize: 12, fill: INK.secondary }} tickLine={false} axisLine={{ stroke: INK.axis }} />
                <YAxis yAxisId="v" orientation="right" type="category" dataKey="value" width={190} interval={0} tick={{ fontSize: 11, fill: INK.secondary }} tickLine={false} axisLine={false} />
                <Tooltip {...tooltipStyle} cursor={{ fill: '#f1f5f9' }}
                  formatter={(v, n, p) => [`${formatINR(v)} (${formatPct(v / total, 0)} of total)`, `${formatNumber(p.payload.minutes)} min × ₹${formatNumber(p.payload.rate)}/min`]} />
                <Bar dataKey="cost" name="Cost of downtime" fill={SERIES[0]} radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )
      ) : overview.loading && !overview.data ? <p className="h-60 text-sm text-slate-500">Loading…</p> : (
        <div className="h-60">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byDay} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: INK.axis }} interval="preserveStartEnd" minTickGap={16} />
              <YAxis tickFormatter={formatINRAxis} tick={axisTick} tickLine={false} axisLine={false} width={60} />
              <Tooltip {...tooltipStyle} cursor={{ fill: '#f1f5f9' }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="rounded-lg border border-black/10 bg-white px-3 py-2 text-xs shadow-sm">
                      <p className="font-semibold text-slate-700">{d.label} · {formatINR(d.cost)}</p>
                      {d.parts.sort((a, b) => b.cost - a.cost).map((x) => <p key={x.name}>{x.name}: {x.minutes} min · {formatINR(x.cost)}</p>)}
                      {!d.parts.length && <p className="text-slate-500">No downtime</p>}
                    </div>
                  );
                }} />
              <Bar dataKey="cost" name="Cost of downtime" fill={SERIES[0]} radius={[3, 3, 0, 0]} maxBarSize={22} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  );
}
