import { HelpCircle } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import Tooltip from './ToolTip';
import { pageFor } from '../lib/nav';

// First sentence of the help text, shown as the panel's description line (the full text stays in the tooltip)
const firstSentence = (t) => {
  if (typeof t !== 'string') return null;
  const m = t.match(/^(.+?[.!?])(\s|$)/);
  const s = (m ? m[1] : t).trim();
  return s.length <= 160 ? s : null;
};

/**
 * Card with a title, a one-line description, an optional help tooltip and right-side actions.
 * `subtitle` overrides the description (pass '' to hide it). `flush` removes body padding (tables).
 */
export default function Panel({ title, subtitle, tooltip, actions, children, flush = false, className = '' }) {
  const desc = subtitle ?? firstSentence(tooltip);
  return (
    <section className={`bg-white rounded-2xl shadow-sm border border-slate-200 min-w-0 ${className}`}>
      <div className="flex items-start justify-between gap-3 px-5 sm:px-6 pt-5 pb-4 border-b border-slate-100">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-slate-900">{title}</h3>
          {desc && <p className="mt-0.5 text-sm text-slate-500">{desc}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {actions}
          {tooltip && (
            <Tooltip content={tooltip}>
              <span tabIndex={0} aria-label={`About ${title}`} className="rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500">
                <HelpCircle size={18} className="text-slate-400" />
              </span>
            </Tooltip>
          )}
        </div>
      </div>
      <div className={flush ? '' : 'p-5 sm:p-6'}>{children}</div>
    </section>
  );
}

/** Page title card: title + "Page n" badge, the page description, the data window, and optional controls on the right. */
export function PageHeader({ title, window: w, note, description, children }) {
  const page = pageFor(useLocation().pathname);
  const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '…');
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 px-5 sm:px-6 py-5 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          {page && <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-sm font-semibold text-blue-700">Page {page.page}</span>}
        </div>
        <p className="mt-1 text-[15px] text-slate-500">{description ?? page?.description}</p>
        {(w !== undefined || note) && (
          <p className="mt-1 text-xs text-slate-400">
            {w ? `${fmt(w.d_from)} – ${fmt(w.d_to)} (${w.days} days, as of ${fmt(w.as_of)}) · compared with the previous ${w.days} days` : w === undefined ? '' : 'Loading…'}
            {note && `${w ? ' · ' : ''}${note}`}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}
