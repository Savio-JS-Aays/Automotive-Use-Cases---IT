import { useState } from 'react';
import { Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatINR, formatINRAxis, formatMonth } from '../../../lib/format';
import { INK, SERIES, axisTick, gridProps, tooltipStyle } from '../../../lib/chartTheme';
import { toggleCls, toggleGroupCls } from '../../../lib/ui';

const VIEWS = [
  { id: 'monthly', label: 'Monthly' },
  { id: 'cumulative', label: 'Cumulative' },
];

/**
 * Fiscal-year spend vs budget. One INR axis in both views (no dual axis).
 * Monthly: actual bars + budget line; clicking a bar drills into that month.
 * Cumulative: actual vs budget to date, plus a run-rate forecast to March.
 */
export default function SpendVsBudget({ data = [], selectedMonth, onMonthClick }) {
  const [view, setView] = useState('monthly');
  const rows = data.map((d) => ({ ...d, label: formatMonth(d.month) }));

  return (
    <div>
      <div role="radiogroup" aria-label="Spend view" className={`mb-3 ${toggleGroupCls}`}>
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            role="radio"
            aria-checked={view === v.id}
            onClick={() => setView(v.id)}
            className={toggleCls(view === v.id)}
          >
            {v.label}
          </button>
        ))}
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: INK.axis }} />
            <YAxis tickFormatter={formatINRAxis} tick={axisTick} tickLine={false} axisLine={false} width={64} />
            <Tooltip formatter={(v, name) => [formatINR(v), name]} {...tooltipStyle} cursor={{ fill: '#f1f5f9' }} />
            <Legend wrapperStyle={{ fontSize: 12, color: INK.secondary }} />
            {view === 'monthly' ? (
              <>
                <Bar
                  dataKey="actual"
                  name="Actual"
                  fill={SERIES[0]}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={28}
                  cursor="pointer"
                  onClick={(e) => onMonthClick?.((e.payload ?? e).month)}
                >
                  {rows.map((r) => (
                    <Cell key={r.month} fill={SERIES[0]} fillOpacity={!selectedMonth || selectedMonth === r.month ? 1 : 0.35} />
                  ))}
                </Bar>
                <Line dataKey="budget" name="Budget" stroke={INK.secondary} strokeWidth={2} strokeDasharray="5 4" dot={false} />
              </>
            ) : (
              <>
                <Line dataKey="cum_actual" name="Actual to date" stroke={SERIES[0]} strokeWidth={2} dot={false} connectNulls={false} />
                <Line dataKey="cum_forecast" name="Run-rate forecast" stroke={SERIES[0]} strokeWidth={2} strokeDasharray="2 4" dot={false} />
                <Line dataKey="cum_budget" name="Budget" stroke={INK.secondary} strokeWidth={2} strokeDasharray="5 4" dot={false} />
              </>
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {view === 'monthly' && <p className="mt-2 text-xs text-slate-500">Select a month's bar to see its spend by product.</p>}
    </div>
  );
}
