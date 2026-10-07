import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Panel from '../../components/Panel';
import Segmented from '../../components/Segmented';
import { INK, axisTick, tooltipStyle } from '../../lib/chartTheme';
import { AGE_BANDS, ASSET_CLASSES, SEVERITIES, SEV_COLOR, ageBand } from './secData';

/**
 * Open vulnerabilities in one chart (replaces "by age" + "by asset class"): rows by severity or asset class, each bar split
 * by age band or by severity. Filters: past SLA only, exploit available only. Right column: open · past SLA · avg age.
 * A row filters the vulnerability table below (severity or asset class).
 */
export default function VulnBreakdown({ open, asOf, onPickRow }) {
  const [rowsBy, setRowsBy] = useState('severity');
  const [stackBy, setStackBy] = useState('age');
  const [pastOnly, setPastOnly] = useState(false);
  const [exploitOnly, setExploitOnly] = useState(false);

  const base = open.filter((v) => (!pastOnly || v.past_sla) && (!exploitOnly || v.exploit_available));
  const keys = stackBy === 'age' ? AGE_BANDS.map((b) => ({ key: b.key, color: b.color })) : SEVERITIES.map((s) => ({ key: s, color: SEV_COLOR[s] }));
  const effStack = rowsBy === 'severity' && stackBy === 'severity' ? 'age' : stackBy;
  const effKeys = effStack === 'age' ? AGE_BANDS.map((b) => ({ key: b.key, color: b.color })) : keys;

  const rows = useMemo(() => {
    const order = rowsBy === 'severity' ? SEVERITIES : ASSET_CLASSES;
    return order.map((g) => {
      const xs = base.filter((v) => (rowsBy === 'severity' ? v.severity : v.asset_class) === g);
      const r = { key: g, n: xs.length, past: xs.filter((v) => v.past_sla).length, avg: xs.length ? Math.round(xs.reduce((s, v) => s + v.days_open, 0) / xs.length) : 0 };
      for (const k of effKeys) r[k.key] = xs.filter((v) => (effStack === 'age' ? ageBand(v.days_open) : v.severity) === k.key).length;
      r.value = `${r.n} · ${r.past} past SLA · avg ${r.avg} d old`;
      return r;
    }).filter((r) => r.n > 0);
  }, [base, rowsBy, effStack]); // eslint-disable-line react-hooks/exhaustive-deps

  const past = base.filter((v) => v.past_sla).length;
  const oldest = base.reduce((m, v) => (v.days_open > (m?.days_open ?? -1) ? v : m), null);

  return (
    <Panel title="Open vulnerabilities"
      tooltip="Every open vulnerability, grouped by severity or by asset class, and split by how long it has been open (age since discovery) or by severity. The right-hand column shows open count · how many are past their patch SLA (Critical 15 d, High 30 d, Medium 60 d, Low 90 d) · average age. Select a row to filter the table below.">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented label="Rows" value={rowsBy} onChange={setRowsBy} options={[{ value: 'severity', label: 'By severity' }, { value: 'asset', label: 'By asset class' }]} />
        <Segmented label="Split by" value={effStack} onChange={setStackBy} options={[{ value: 'age', label: 'Age' }, { value: 'severity', label: 'Severity', disabled: rowsBy === 'severity' }]} />
        <label className="inline-flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={pastOnly} onChange={(e) => setPastOnly(e.target.checked)} className="rounded border-slate-300 focus:ring-blue-500" />Past SLA only</label>
        <label className="inline-flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={exploitOnly} onChange={(e) => setExploitOnly(e.target.checked)} className="rounded border-slate-300 focus:ring-blue-500" />Exploit available only</label>
      </div>
      <p className="mb-2 text-xs text-slate-600">
        <b className="text-slate-900">{base.length}</b> open · <b className="text-red-700">{past}</b> past SLA
        {oldest && <> · oldest <b className="text-slate-900">{oldest.days_open} days</b> ({oldest.severity}, {oldest.asset_class})</>} · as of {asOf}
      </p>
      {!rows.length ? <p className="py-8 text-center text-sm text-slate-500">Nothing open for these filters.</p> : (
        <div style={{ height: Math.max(170, rows.length * 40 + 60) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 0 }} barCategoryGap={8}>
              <CartesianGrid stroke={INK.grid} horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="key" width={rowsBy === 'asset' ? 120 : 70} interval={0} tick={{ fontSize: 12, fill: INK.secondary }} tickLine={false} axisLine={{ stroke: INK.axis }} />
              <YAxis yAxisId="v" orientation="right" type="category" dataKey="value" width={205} interval={0} tickLine={false} axisLine={false}
                tick={({ x, y, payload }) => {
                  const [n, past, avg] = payload.value.split(' · ');
                  return (
                    <text x={x} y={y} dy={4} fontSize={11} fill={INK.secondary}>
                      {n} open · <tspan fill={past.startsWith('0') ? INK.muted : '#b42318'} fontWeight={past.startsWith('0') ? 400 : 700}>{past}</tspan> · {avg}
                    </text>
                  );
                }} />
              <Tooltip {...tooltipStyle} cursor={{ fill: '#f1f5f9' }} formatter={(v, n) => [`${v} open`, n]} />
              <Legend wrapperStyle={{ fontSize: 12, color: INK.secondary }} itemSorter={(i) => effKeys.findIndex((k) => k.key === i.value)} />
              {effKeys.map((k, i) => (
                <Bar key={k.key} dataKey={k.key} stackId="v" fill={k.color} stroke="#fff" strokeWidth={1} maxBarSize={22} isAnimationActive={false}
                  radius={i === effKeys.length - 1 ? [0, 4, 4, 0] : 0} cursor="pointer" onClick={(e) => onPickRow(rowsBy, (e.payload ?? e).key)} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  );
}
