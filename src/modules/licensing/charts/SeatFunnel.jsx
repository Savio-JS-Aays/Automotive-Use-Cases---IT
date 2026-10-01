import { formatINR, formatNumber, formatPct } from '../../../lib/format';
import { BLUE_ORDINAL } from '../../../lib/chartTheme';

/**
 * Seat funnel: purchased → assigned → active in 90 days → active in 30 days.
 * Ordinal blue ramp; each stage shows its count, its share of purchased, and the money lost at that step.
 * Assigned can exceed purchased (over-deployment), so the bar scale uses the larger of the two.
 */
export default function SeatFunnel({ purchased = 0, assigned = 0, active90 = 0, active30 = 0, shelfUnassigned, shelfDormant }) {
  const max = Math.max(purchased, assigned, 1);
  const stages = [
    { label: 'Purchased', value: purchased, note: null },
    { label: 'Assigned', value: assigned, note: shelfUnassigned != null ? `${formatINR(shelfUnassigned)}/yr unassigned` : null },
    { label: 'Active in 90 days', value: active90, note: shelfDormant != null ? `${formatINR(shelfDormant)}/yr dormant` : null },
    { label: 'Active in 30 days', value: active30, note: null },
  ];
  return (
    <ol className="space-y-3">
      {stages.map((s, i) => (
        <li key={s.label}>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="font-medium text-slate-700">{s.label}</span>
            <span className="text-slate-900 font-semibold">
              {formatNumber(s.value)} <span className="font-normal text-slate-500">({formatPct(purchased ? s.value / purchased : null, 0)})</span>
            </span>
          </div>
          <div className="mt-1 h-3 rounded-full bg-slate-100 overflow-hidden" aria-hidden="true">
            <div className="h-full rounded-full" style={{ width: `${(s.value / max) * 100}%`, background: BLUE_ORDINAL[i] }} />
          </div>
          {s.note && <p className="mt-1 text-xs text-slate-500">{s.note}</p>}
        </li>
      ))}
      {assigned > purchased && (
        <li className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          Over-deployed: {formatNumber(assigned - purchased)} more seats assigned than purchased (true-up risk).
        </li>
      )}
    </ol>
  );
}
