import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Segmented from '../../../components/Segmented';
import { formatINR, formatINRAxis, formatMonth, formatSignedPct } from '../../../lib/format';
import { INK, SERIES, STATUS, axisTick, gridProps } from '../../../lib/chartTheme';

const VIEWS = [
  { value: 'change', label: 'Change vs last FY' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'cumulative', label: 'Cumulative' },
];

/**
 * This fiscal year against the last one. Default view: the monthly change in ₹ (bars from zero, % on each bar),
 * because both years are similar in size and two near-flat lines hide the difference.
 */
export default function YearOnYear({ yoy = [] }) {
  const [view, setView] = useState('change');
  const rows = useMemo(() => {
    const upTo = (i, key) => yoy.slice(0, i + 1).reduce((s, x) => s + Number(x[key] || 0), 0);
    return yoy.map((r, i) => {
      const has = r.this_fy != null;
      return {
        ...r, label: formatMonth(r.month), diff: has ? r.this_fy - r.last_fy : null, pct: has && r.last_fy ? r.this_fy / r.last_fy - 1 : null,
        cum_this: has ? upTo(i, 'this_fy') : null, cum_last: upTo(i, 'last_fy'),
      };
    });
  }, [yoy]);
  const done = rows.filter((r) => r.this_fy != null);
  const ytdThis = done.reduce((s, r) => s + Number(r.this_fy), 0);
  const ytdLast = done.reduce((s, r) => s + Number(r.last_fy || 0), 0);
  const growth = ytdLast ? ytdThis / ytdLast - 1 : null;
  const peak = done.reduce((m, r) => (m == null || r.diff > m.diff ? r : m), null);

  const tip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const r = payload[0].payload;
    return (
      <div className="rounded-lg border border-black/10 bg-white px-3 py-2 text-xs shadow-sm">
        <p className="font-semibold text-slate-700">{r.label}</p>
        {view === 'cumulative' ? (
          <>
            <p>This FY to date: {r.cum_this == null ? 'not yet' : formatINR(r.cum_this)}</p>
            <p>Last FY to date: {formatINR(r.cum_last)}</p>
          </>
        ) : (
          <>
            <p>This FY: {r.this_fy == null ? 'not yet invoiced' : formatINR(r.this_fy)}</p>
            <p>Last FY: {formatINR(r.last_fy)}</p>
            {r.diff != null && <p className="font-semibold">Change: {r.diff >= 0 ? '+' : '−'}{formatINR(Math.abs(r.diff))} ({formatSignedPct(r.pct)})</p>}
          </>
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Segmented label="View" options={VIEWS} value={view} onChange={setView} />
        <p className="text-xs text-slate-600">
          FY to date <b className="text-slate-900">{formatINR(ytdThis)}</b> vs {formatINR(ytdLast)} ·{' '}
          <b className="text-slate-900">{growth == null ? '—' : formatSignedPct(growth)}</b>
          {peak && view === 'change' ? <> · biggest jump {peak.label}</> : null}
        </p>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          {view === 'change' ? (
            <BarChart data={rows} margin={{ top: 18, right: 8, left: 4, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: INK.axis }} />
              <YAxis tickFormatter={formatINRAxis} tick={axisTick} tickLine={false} axisLine={false} width={64} />
              <ReferenceLine y={0} stroke={INK.axis} />
              <Tooltip content={tip} cursor={{ fill: '#f1f5f9' }} />
              <Bar dataKey="diff" name="Change vs same month last FY" radius={[4, 4, 0, 0]} maxBarSize={32} isAnimationActive={false}>
                {rows.map((r) => <Cell key={r.month} fill={r.diff < 0 ? STATUS.good : SERIES[0]} />)}
                <LabelList dataKey="pct" position="top" fontSize={11} fill={INK.secondary} formatter={(v) => (v == null ? '' : formatSignedPct(v, 1))} />
              </Bar>
            </BarChart>
          ) : view === 'monthly' ? (
            <BarChart data={rows} margin={{ top: 8, right: 8, left: 4, bottom: 0 }} barGap={2}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: INK.axis }} />
              <YAxis tickFormatter={formatINRAxis} tick={axisTick} tickLine={false} axisLine={false} width={64} />
              <Tooltip content={tip} cursor={{ fill: '#f1f5f9' }} />
              <Legend wrapperStyle={{ fontSize: 12, color: INK.secondary }} />
              <Bar dataKey="last_fy" name="Last FY" fill={INK.axis} radius={[3, 3, 0, 0]} maxBarSize={16} isAnimationActive={false} />
              <Bar dataKey="this_fy" name="This FY" fill={SERIES[0]} radius={[3, 3, 0, 0]} maxBarSize={16} isAnimationActive={false} />
            </BarChart>
          ) : (
            <LineChart data={rows} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: INK.axis }} />
              <YAxis tickFormatter={formatINRAxis} tick={axisTick} tickLine={false} axisLine={false} width={64} />
              <Tooltip content={tip} />
              <Legend wrapperStyle={{ fontSize: 12, color: INK.secondary }} />
              <Line dataKey="cum_last" name="Last FY (cumulative)" stroke={INK.muted} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
              <Line dataKey="cum_this" name="This FY (cumulative)" stroke={SERIES[0]} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
      {view === 'change' && (
        <p className="mt-2 text-xs text-slate-500">Bars show this FY minus the same month last FY; blue = spent more, green = spent less. Months not yet invoiced are blank.</p>
      )}
    </div>
  );
}
