import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Panel from '../../components/Panel';
import Segmented from '../../components/Segmented';
import { INK, STATUS, axisTick, gridProps, tooltipStyle } from '../../lib/chartTheme';
import { formatPct } from '../../lib/format';
import { day, fmtHours, fmtTime, median, recoveryHours } from './changeData';

const ROLLED = 'Rolled back';
const FIXED = 'Fixed forward';
const COLOR = { [ROLLED]: STATUS.serious, [FIXED]: STATUS.critical }; // same colours as the outcome stack in Deployments per week
const monthLabel = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' });

function Tile({ label, value, note, color }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <p className="flex items-center gap-1.5 text-xs text-slate-500">{color && <span className="h-2 w-2 rounded-full" style={{ background: color }} />}{label}</p>
      <p className="text-lg font-semibold text-slate-900 tabular-nums">{value}</p>
      {note && <p className="text-xs text-slate-500">{note}</p>}
    </div>
  );
}

/**
 * How failed deployments were recovered: rolled back (undo the release) or fixed forward (ship a fix), and how long each took.
 * This window: one bar per failed deployment (click → deployment drawer). Last 12 months: failures per month by approach.
 */
export default function RecoveryChart({ windowDeps, yearDeps, yearLoading, maps, yearMaps, range, setRange, onOpenDeployment }) {
  const source = range === 'year' ? yearDeps : windowDeps;
  const m = range === 'year' ? yearMaps : maps;

  const failed = useMemo(() => (m ? source.filter((d) => d.status === 'Failed').map((d) => ({
    id: d.deployment_id, service: d.short_name, type: d.change_type, date: day(d), time: d.deploy_time,
    approach: d.rolled_back_by ? ROLLED : FIXED, hours: recoveryHours(d, m.byId, m.incById), incidents: d.incidents.length,
  })) : []), [source, m]);

  const rolled = failed.filter((f) => f.approach === ROLLED);
  const fixed = failed.filter((f) => f.approach === FIXED);
  const medOf = (xs) => median(xs.map((x) => x.hours).filter((h) => h != null));
  const mr = medOf(rolled); const mf = medOf(fixed);
  const bars = [...failed].filter((f) => f.hours != null).sort((a, b) => b.hours - a.hours).map((f) => ({ ...f, label: `${f.id} · ${f.service}`, value: fmtHours(f.hours) }));

  const monthly = useMemo(() => {
    const mm = new Map();
    for (const f of failed) {
      const k = `${f.date.slice(0, 7)}-01`;
      const x = mm.get(k) || { key: k, label: monthLabel(k), [ROLLED]: 0, [FIXED]: 0, _h: { [ROLLED]: [], [FIXED]: [] } };
      x[f.approach] += 1; if (f.hours != null) x._h[f.approach].push(f.hours);
      mm.set(k, x);
    }
    return [...mm.values()].sort((a, b) => a.key.localeCompare(b.key));
  }, [failed]);

  return (
    <Panel title="Rollback or fix forward"
      tooltip="When a release fails, the team either rolls it back (undoes it) or fixes forward (ships a correction). This compares how often each happened and how long service took to recover, measured from the deploy time to the rollback, or to the last incident it caused being resolved. This window shows each failed deployment (select one for detail); last 12 months shows failures per month.">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented label="Range" value={range} onChange={setRange} options={[{ value: 'window', label: 'This window' }, { value: 'year', label: 'Last 12 months' }]} />
      </div>
      {range === 'year' && yearLoading ? <p className="h-60 text-sm text-slate-500">Loading 12 months…</p> : (
        <>
          <div className="mb-3 grid grid-cols-3 gap-2">
            <Tile label="Failed releases" value={failed.length} note={failed.length ? `${failed.filter((f) => f.incidents).length} caused an incident` : null} />
            <Tile label={ROLLED} color={COLOR[ROLLED]} value={`${rolled.length}${failed.length ? ` · ${formatPct(rolled.length / failed.length, 0)}` : ''}`} note={`median recovery ${fmtHours(mr)}`} />
            <Tile label={FIXED} color={COLOR[FIXED]} value={`${fixed.length}${failed.length ? ` · ${formatPct(fixed.length / failed.length, 0)}` : ''}`} note={`median recovery ${fmtHours(mf)}`} />
          </div>
          {mr != null && mf != null && mf > mr && (
            <p className="mb-2 text-xs text-slate-600">Rolling back restored service about <b className="text-slate-900">{Math.round(mf / mr)}×</b> faster than fixing forward.</p>
          )}
          {!failed.length ? <p className="py-8 text-center text-sm text-slate-500">No failed releases for these filters.</p> : range === 'window' ? (
            <div style={{ height: Math.max(150, bars.length * 32 + 50) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bars} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke={INK.grid} horizontal={false} />
                  <XAxis type="number" tickFormatter={(v) => `${v} h`} tick={axisTick} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="label" width={150} interval={0} tick={{ fontSize: 11, fill: INK.secondary }} tickLine={false} axisLine={{ stroke: INK.axis }} />
                  <YAxis yAxisId="v" orientation="right" type="category" dataKey="value" width={60} interval={0} tick={{ fontSize: 11, fill: INK.secondary }} tickLine={false} axisLine={false} />
                  <Tooltip {...tooltipStyle} cursor={{ fill: '#f1f5f9' }}
                    formatter={(v, n, p) => [`${fmtHours(v)} to recover · ${p.payload.approach.toLowerCase()} · ${p.payload.type} · deployed ${fmtTime(p.payload.time)}`, p.payload.id]} />
                  <Bar dataKey="hours" maxBarSize={16} radius={[0, 4, 4, 0]} isAnimationActive={false} cursor="pointer" onClick={(e) => onOpenDeployment((e.payload ?? e).id)}>
                    {bars.map((b) => <Cell key={b.id} fill={COLOR[b.approach]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: INK.axis }} interval="preserveStartEnd" />
                  <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} width={28} />
                  <Tooltip {...tooltipStyle} cursor={{ fill: '#f1f5f9' }}
                    formatter={(v, n, p) => [`${v} (median ${fmtHours(median(p.payload._h[n]))})`, n]} />
                  <Legend wrapperStyle={{ fontSize: 12, color: INK.secondary }} itemSorter={(i) => [ROLLED, FIXED].indexOf(i.value)} />
                  <Bar dataKey={ROLLED} stackId="r" fill={COLOR[ROLLED]} stroke="#fff" strokeWidth={1} isAnimationActive={false} />
                  <Bar dataKey={FIXED} stackId="r" fill={COLOR[FIXED]} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {range === 'window' && failed.length > 0 && <p className="mt-2 text-xs text-slate-500">Bars: time from deploy to recovery. Select one to open the deployment.</p>}
        </>
      )}
    </Panel>
  );
}
