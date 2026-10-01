import { formatNumber, formatPct } from '../lib/format';
import { BLUE_ORDINAL } from '../lib/chartTheme';

/**
 * Ordinal funnel. stages: [{ label, value, note? }]. Each bar shows the count and its share of the first stage.
 */
export default function Funnel({ stages = [] }) {
  const first = stages[0]?.value || 0;
  const max = Math.max(1, ...stages.map((s) => s.value || 0));
  return (
    <ol className="space-y-3">
      {stages.map((s, i) => (
        <li key={s.label}>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="font-medium text-slate-700">{s.label}</span>
            <span className="font-semibold text-slate-900">
              {formatNumber(s.value)}{i > 0 && first ? <span className="font-normal text-slate-500"> ({formatPct(s.value / first, 0)})</span> : null}
            </span>
          </div>
          <div className="mt-1 h-3 rounded-full bg-slate-100 overflow-hidden" aria-hidden="true">
            <div className="h-full rounded-full" style={{ width: `${((s.value || 0) / max) * 100}%`, background: BLUE_ORDINAL[Math.min(i, BLUE_ORDINAL.length - 1)] }} />
          </div>
          {s.note && <p className="mt-1 text-xs text-slate-500">{s.note}</p>}
        </li>
      ))}
    </ol>
  );
}
