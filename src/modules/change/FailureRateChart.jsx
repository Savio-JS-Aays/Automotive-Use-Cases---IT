import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Panel from '../../components/Panel';
import Segmented, { ToolbarSelect } from '../../components/Segmented';
import { INK, SERIES, STATUS, axisTick, tooltipStyle } from '../../lib/chartTheme';
import { formatPct } from '../../lib/format';

/**
 * Change failure rate as one simple bar per service (or per change type): failed ÷ deployments, red when above target.
 * Controls: group by, sort, failures-only. A bar sets the page filter (service or change type).
 */
export default function FailureRateChart({ deps, target, onPickService, onPickType, services }) {
  const [by, setBy] = useState('service');
  const [sort, setSort] = useState('rate');
  const [onlyFailed, setOnlyFailed] = useState(false);
  const name = (id) => services.find((s) => s.service_id === id)?.short_name ?? id;

  const rows = useMemo(() => {
    const m = new Map();
    for (const d of deps) {
      const k = by === 'service' ? d.service_id : d.change_type;
      const x = m.get(k) || { key: k, label: by === 'service' ? name(k) : k, n: 0, f: 0 };
      x.n += 1; if (d.status === 'Failed') x.f += 1;
      m.set(k, x);
    }
    let out = [...m.values()].map((x) => ({ ...x, rate: x.n ? x.f / x.n : 0 }));
    if (onlyFailed) out = out.filter((x) => x.f > 0);
    const cmp = { rate: (a, b) => b.rate - a.rate || b.f - a.f, failed: (a, b) => b.f - a.f || b.rate - a.rate, volume: (a, b) => b.n - a.n, name: (a, b) => a.label.localeCompare(b.label) }[sort];
    return out.sort(cmp).map((x) => ({ ...x, pct: x.rate * 100, value: `${formatPct(x.rate, 0)} · ${x.f} of ${x.n}` }));
  }, [deps, by, sort, onlyFailed, services]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = deps.length;
  const failed = deps.filter((d) => d.status === 'Failed').length;
  const above = rows.filter((r) => r.rate > target).length;
  const pick = (e) => { const r = e.payload ?? e; if (by === 'service') onPickService(r.key); else onPickType(r.key); };

  return (
    <Panel title="Change failure rate"
      tooltip="Failed deployments ÷ deployments (rollbacks excluded), per service or per change type. Red bars are above the 15% target (dashed line). Select a bar to filter the whole page to that service or change type.">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented label="Group by" value={by} onChange={setBy} options={[{ value: 'service', label: 'By service' }, { value: 'type', label: 'By change type' }]} />
        <ToolbarSelect label="Sort" value={sort} onChange={setSort}>
          <option value="rate">Highest failure rate</option>
          <option value="failed">Most failures</option>
          <option value="volume">Most deployments</option>
          <option value="name">Name</option>
        </ToolbarSelect>
        <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
          <input type="checkbox" checked={onlyFailed} onChange={(e) => setOnlyFailed(e.target.checked)} className="rounded border-slate-300 focus:ring-blue-500" />
          Only with failures
        </label>
      </div>
      <p className="mb-2 text-xs text-slate-600">
        <b className="text-slate-900">{failed}</b> of {total} deployments failed (<b className="text-slate-900">{total ? formatPct(failed / total) : '—'}</b>)
        {' · '}{above ? <span className="font-semibold text-red-700">{above} {by === 'service' ? 'service' : 'type'}{above === 1 ? '' : 's'} above the {formatPct(target, 0)} target</span> : `all within the ${formatPct(target, 0)} target`}
      </p>
      {!rows.length ? <p className="py-8 text-center text-sm text-slate-500">No deployments match.</p> : (
        <div style={{ height: Math.max(160, rows.length * 32 + 40) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout="vertical" margin={{ top: 18, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid stroke={INK.grid} horizontal={false} />
              <XAxis type="number" domain={[0, (max) => Math.max(20, Math.ceil(max / 5) * 5)]} tickFormatter={(v) => `${v}%`} tick={axisTick} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="label" width={100} interval={0} tick={{ fontSize: 12, fill: INK.secondary }} tickLine={false} axisLine={{ stroke: INK.axis }} />
              <YAxis yAxisId="v" orientation="right" type="category" dataKey="value" width={92} interval={0} tick={{ fontSize: 11, fill: INK.secondary }} tickLine={false} axisLine={false} />
              <Tooltip {...tooltipStyle} cursor={{ fill: '#f1f5f9' }}
                formatter={(v, n, p) => [`${v.toFixed(1)}% (${p.payload.f} failed of ${p.payload.n})${p.payload.rate > target ? ' · above target' : ''}`, 'Change failure rate']} />
              <ReferenceLine x={target * 100} stroke={STATUS.critical} strokeDasharray="5 4" label={{ value: `target ${formatPct(target, 0)}`, position: 'top', fill: INK.secondary, fontSize: 11 }} />
              <Bar dataKey="pct" radius={[0, 4, 4, 0]} maxBarSize={16} isAnimationActive={false} cursor="pointer" onClick={pick}>
                {rows.map((r) => <Cell key={r.key} fill={r.rate > target ? STATUS.critical : SERIES[0]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  );
}
