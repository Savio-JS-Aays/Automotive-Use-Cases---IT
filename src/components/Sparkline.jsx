import { SERIES } from '../lib/chartTheme';

/**
 * Tiny trend line for KPI tiles (decorative; the tile states the value in text).
 * values: numbers (nulls skipped). The y-range is fitted to the data so small changes are visible.
 */
export default function Sparkline({ values = [], color = SERIES[0], width = 96, height = 28 }) {
  const pts = values.map((v, i) => [i, v]).filter(([, v]) => v !== null && v !== undefined && !Number.isNaN(Number(v)));
  if (pts.length < 2) return null;
  const ys = pts.map(([, v]) => Number(v));
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const span = max - min || 1;
  const x = (i) => (i / (values.length - 1)) * (width - 4) + 2;
  const y = (v) => height - 3 - ((v - min) / span) * (height - 6);
  const d = pts.map(([i, v], k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)},${y(Number(v)).toFixed(1)}`).join(' ');
  const [li, lv] = pts[pts.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="shrink-0">
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(li)} cy={y(Number(lv))} r="2.5" fill={color} />
    </svg>
  );
}
