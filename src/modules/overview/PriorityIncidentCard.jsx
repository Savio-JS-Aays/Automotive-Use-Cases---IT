import { Link } from 'react-router-dom';
import { ArrowRight, HelpCircle } from 'lucide-react';
import Tooltip from '../../components/ToolTip';
import { formatNumber } from '../../lib/format';

const LABEL = { 1: 'P1', 2: 'P2', 3: 'P3', 4: 'P4', 12: 'P1 + P2', all: 'All' };

/**
 * Overview incident card: the count for the global Incident Priority filter (sidebar). No filtering of its own.
 * "Details" opens App Reliability's incident explorer, which uses the same global priority (and the service, if one is picked).
 */
export default function PriorityIncidentCard({ prio, counts, loading, service }) {
  const title = prio === 'all' ? 'All Incidents' : `${LABEL[prio]} Incidents`;
  const qs = new URLSearchParams({ focus: 'incidents', ...(service ? { service } : {}) }).toString();
  const tip = 'Incidents opened in the window (Region, Vertical, Service and Incident Priority filters apply). "Details" opens the drill-down in App Reliability.';

  return (
    <div className="kpi-card bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        <span className="flex items-center gap-2">
          <Link to={`/app-reliability?${qs}`} className="inline-flex items-center gap-0.5 rounded text-xs font-medium text-sky-700 hover:underline focus:outline-none focus:ring-2 focus:ring-sky-500">
            Details <ArrowRight size={12} aria-hidden="true" />
          </Link>
          <Tooltip content={tip}>
            <span tabIndex={0} aria-label={`About ${title}`} className="rounded focus:outline-none focus:ring-2 focus:ring-sky-500">
              <HelpCircle size={18} className="text-slate-400" />
            </span>
          </Tooltip>
        </span>
      </div>
      <span className="mt-4 text-[28px] leading-tight font-bold text-slate-900 tabular-nums">{loading ? '…' : formatNumber(counts[prio] ?? 0)}</span>
    </div>
  );
}
