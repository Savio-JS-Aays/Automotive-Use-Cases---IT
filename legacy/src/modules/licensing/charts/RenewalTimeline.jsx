import { AlarmClock, CalendarClock } from 'lucide-react';
import { formatDate, formatINR } from '../../../lib/format';
import { INK, SERIES, STATUS } from '../../../lib/chartTheme';

const DAY = 86400000;

function urgency(daysToNotice) {
  if (daysToNotice <= 30) return { color: STATUS.critical, text: 'text-red-700', label: daysToNotice < 0 ? 'Notice passed' : `Decide in ${daysToNotice} d` };
  if (daysToNotice <= 90) return { color: STATUS.warning, text: 'text-amber-700', label: `Decide in ${daysToNotice} d` };
  return { color: SERIES[0], text: 'text-slate-600', label: `Decide in ${daysToNotice} d` };
}

/**
 * Renewals in the next 12 months on a shared date axis. The bar spans the decision window:
 * notice deadline (left tick) → contract end (dot). Colour + label show urgency of the notice deadline.
 */
export default function RenewalTimeline({ data = [], asOf, onSelect, horizonDays = 365 }) {
  const start = new Date(asOf).getTime();
  const end = start + horizonDays * DAY;
  const pos = (d) => Math.min(100, Math.max(0, ((new Date(d).getTime() - start) / (end - start)) * 100));
  const rows = data.filter((d) => d.days_to_renewal >= 0 && d.days_to_renewal <= horizonDays).sort((a, b) => a.days_to_renewal - b.days_to_renewal);
  const months = Array.from({ length: 5 }, (_, i) => new Date(start + i * (horizonDays / 4) * DAY));

  if (!rows.length) return <p className="text-sm text-slate-500">No renewals in this horizon.</p>;

  return (
    <div>
      <div className="relative ml-[38%] h-5 text-[11px] text-slate-400" aria-hidden="true">
        {months.map((m, i) => (
          <span key={i} className="absolute -translate-x-1/2" style={{ left: `${(i / 4) * 100}%` }}>
            {i === 0 ? 'Today' : m.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })}
          </span>
        ))}
      </div>
      <ul className="space-y-1">
        {rows.map((r) => {
          const u = urgency(r.days_to_notice);
          const x1 = pos(r.notice_deadline);
          const x2 = pos(r.end_date);
          return (
            <li key={r.contract_id}>
                <button
                  type="button"
                  title={`${r.software_name}: notice by ${formatDate(r.notice_deadline)}, ends ${formatDate(r.end_date)}, ${formatINR(r.annual_cost)}/yr${r.auto_renew ? ', auto-renews' : ''}`}
                  onClick={() => onSelect?.(r.software_id)}
                  className="grid w-full grid-cols-[38%_1fr] items-center gap-0 rounded-md py-1 text-left hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <span className="pr-3 min-w-0">
                    <span className="block truncate text-sm font-medium text-slate-800">{r.software_name}</span>
                    <span className={`flex items-center gap-1 text-[11px] font-medium ${u.text}`}>
                      {r.days_to_notice <= 30 ? <AlarmClock size={12} aria-hidden="true" /> : <CalendarClock size={12} aria-hidden="true" />}
                      {u.label} · {formatINR(r.annual_cost)}{r.auto_renew ? ' · auto-renew' : ''}
                    </span>
                  </span>
                  <span className="relative h-6 border-l border-slate-200" aria-hidden="true">
                    <span className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full" style={{ left: `${x1}%`, width: `${Math.max(0.5, x2 - x1)}%`, background: u.color, opacity: 0.45 }} />
                    <span className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2" style={{ left: `${x1}%`, background: u.color }} />
                    <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2" style={{ left: `${x2}%`, background: u.color, borderColor: INK.surface }} />
                  </span>
                </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-slate-500">Tick = notice deadline · dot = contract end. Red: decide within 30 days; amber: within 90.</p>
    </div>
  );
}
