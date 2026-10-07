import { HelpCircle } from 'lucide-react';
import Tooltip from './ToolTip';
import Sparkline from './Sparkline';

const TONE_CLASS = {
  good: 'text-green-800 bg-green-50',
  bad: 'text-red-700 bg-red-50',
  neutral: 'text-slate-600 bg-slate-100',
};

/**
 * KPI tile. Optional extras (all backwards compatible):
 *   sub        secondary line under the value (e.g. "of ₹35.4 Cr budget")
 *   delta      short change text (e.g. "+1.2 pts vs Jun")
 *   deltaTone  'good' | 'bad' | 'neutral' — colours the delta chip (the text always says the direction)
 *   onClick    makes the tile a button (drill-down)
 *   spark      array of numbers for a small trend line (decorative)
 */
export default function KpiCard({ title, value, tooltip, sub, delta, deltaTone = 'neutral', onClick, spark }) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        {tooltip && (
          <Tooltip content={tooltip}>
            <span tabIndex={0} aria-label={`About ${title}`} className="rounded focus:outline-none focus:ring-2 focus:ring-sky-500">
              <HelpCircle size={18} className="text-slate-400" />
            </span>
          </Tooltip>
        )}
      </div>
      <div className="mt-4 flex items-end justify-between gap-2">
        <span className="text-[28px] leading-tight font-bold text-slate-900">{value}</span>
        {spark && <Sparkline values={spark} />}
      </div>
      {(sub || delta) && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
          {delta && <span className={`rounded-full px-2 py-0.5 font-medium ${TONE_CLASS[deltaTone]}`}>{delta}</span>}
          {sub && <span className="text-slate-500">{sub}</span>}
        </div>
      )}
    </>
  );

  // `icon` is accepted for compatibility but not drawn: the suite style uses a coloured top edge instead (.kpi-card)
  const base = 'kpi-card bg-white rounded-xl shadow-sm border border-slate-200 p-5 text-left';
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${base} w-full flex flex-col justify-start hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 transition`}>
        {body}
      </button>
    );
  }
  return <div className={base}>{body}</div>;
}
