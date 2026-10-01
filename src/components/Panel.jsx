import { HelpCircle } from 'lucide-react';
import Tooltip from './ToolTip';

/**
 * Card with a title row, optional help tooltip and right-side actions. `flush` removes body padding (tables).
 */
export default function Panel({ title, tooltip, actions, children, flush = false, className = '' }) {
  return (
    <section className={`bg-white rounded-xl shadow-sm border border-slate-200 min-w-0 ${className}`}>
      <div className="flex items-center justify-between gap-3 px-4 sm:px-5 pt-4 pb-3 border-b border-slate-100">
        <h3 className="text-sm font-bold tracking-wide uppercase text-slate-700">{title}</h3>
        <div className="flex items-center gap-2">
          {actions}
          {tooltip && (
            <Tooltip content={tooltip}>
              <span tabIndex={0} aria-label={`About ${title}`} className="rounded focus:outline-none focus:ring-2 focus:ring-sky-500">
                <HelpCircle size={16} className="text-slate-400" />
              </span>
            </Tooltip>
          )}
        </div>
      </div>
      <div className={flush ? '' : 'p-4 sm:p-5'}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, window: w, note, children }) {
  const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '…');
  return (
    <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        <p className="text-sm text-slate-500">
          {w ? `${fmt(w.d_from)} – ${fmt(w.d_to)} (${w.days} days, as of ${fmt(w.as_of)}) · compared with the previous ${w.days} days` : 'Loading…'}
          {note && ` · ${note}`}
        </p>
      </div>
      {children}
    </div>
  );
}
