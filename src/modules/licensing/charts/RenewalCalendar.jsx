import { useState } from 'react';
import { AlarmClock, CircleDot } from 'lucide-react';
import Segmented, { ToolbarSelect } from '../../../components/Segmented';
import { formatINR } from '../../../lib/format';
import { ACTION_COLOR } from '../constants';
const monthKey = (iso) => iso.slice(0, 7);
const monthTitle = (k) => new Date(`${k}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dayNum = (iso) => Number(iso.slice(8, 10));
const urgency = (d) => (d < 0 ? { cls: 'text-slate-400', label: 'passed' } : d <= 30 ? { cls: 'text-red-700', label: `in ${d} d` } : d <= 90 ? { cls: 'text-amber-700', label: `in ${d} d` } : { cls: 'text-slate-600', label: `in ${d} d` });

/**
 * Year planner of renewals: one card per month for the horizon. Each contract appears twice: on its notice deadline
 * (the last day to cancel or renegotiate; alarm icon, coloured by urgency) and on its end date (dot coloured by the
 * recommended action, with the annual value). Filters: what to show, action, auto-renew only. An entry opens the contract.
 */
export default function RenewalCalendar({ rows, asOf, months: horizon, onOpen }) {
  const [show, setShow] = useState('both');
  const [action, setAction] = useState('');
  const [autoOnly, setAutoOnly] = useState(false);

  const start = asOf.slice(0, 7);
  const months = Array.from({ length: horizon }, (_, i) => { const d = new Date(`${start}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + i); return d.toISOString().slice(0, 7); });
  const last = months[months.length - 1];
  const scoped = rows.filter((r) => (!action || r.recommendation === action) && (!autoOnly || r.auto_renew));
  const events = [];
  for (const r of scoped) {
    if (show !== 'ends' && monthKey(r.notice_deadline) >= start && monthKey(r.notice_deadline) <= last) events.push({ kind: 'notice', date: r.notice_deadline, r });
    if (show !== 'notice' && monthKey(r.end_date) >= start && monthKey(r.end_date) <= last) events.push({ kind: 'end', date: r.end_date, r });
  }
  const byMonth = new Map(months.map((m) => [m, []]));
  events.sort((a, b) => a.date.localeCompare(b.date)).forEach((e) => byMonth.get(monthKey(e.date))?.push(e));
  const endingValue = (m) => (byMonth.get(m) ?? []).filter((e) => e.kind === 'end').reduce((t, e) => t + Number(e.r.annual_value), 0);
  const nextNotice = scoped.filter((r) => r.days_to_notice >= 0).sort((a, b) => a.days_to_notice - b.days_to_notice)[0];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented label="Show" value={show} onChange={setShow} options={[{ value: 'both', label: 'Deadlines & renewals' }, { value: 'notice', label: 'Notice deadlines' }, { value: 'ends', label: 'Contract ends' }]} />
        <ToolbarSelect label="Action" value={action} onChange={setAction}>
          <option value="">All</option>{Object.keys(ACTION_COLOR).map((a) => <option key={a}>{a}</option>)}
        </ToolbarSelect>
        <label className="inline-flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={autoOnly} onChange={(e) => setAutoOnly(e.target.checked)} className="rounded border-slate-300 focus:ring-blue-500" />Auto-renew only</label>
      </div>
      {nextNotice && (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <AlarmClock size={14} className="mr-1 inline" aria-hidden="true" />
          Next decision: <b>{nextNotice.software_name}</b> — notice deadline <b>{new Date(nextNotice.notice_deadline).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</b> ({nextNotice.days_to_notice} d){nextNotice.auto_renew ? '; it auto-renews if nobody acts' : ''}.
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {months.map((m) => {
          const evs = byMonth.get(m) ?? [];
          const val = endingValue(m);
          return (
            <section key={m} aria-label={monthTitle(m)} className={`rounded-xl border p-3 ${m === start ? 'border-blue-300 bg-blue-50/40' : 'border-slate-200 bg-white'}`}>
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <h4 className="text-sm font-semibold text-slate-800">{monthTitle(m)}{m === start && <span className="ml-1 text-xs font-normal text-blue-700">· now</span>}</h4>
                {val > 0 && <span className="text-xs font-semibold text-slate-700">{formatINR(val)} ends</span>}
              </div>
              {!evs.length ? <p className="text-xs text-slate-300">Nothing due</p> : (
                <ul className="space-y-1.5">
                  {evs.map((e) => {
                    const u = urgency(e.r.days_to_notice);
                    return (
                      <li key={`${e.kind}-${e.r.contract_id}`}>
                        <button type="button" onClick={() => onOpen(e.r.contract_id)}
                          className="flex w-full items-start gap-2 rounded-md px-1.5 py-1 text-left hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500">
                          <span className="w-5 shrink-0 text-right text-xs font-bold tabular-nums text-slate-500">{dayNum(e.date)}</span>
                          {e.kind === 'notice'
                            ? <AlarmClock size={14} className={`mt-0.5 shrink-0 ${u.cls}`} aria-label="Notice deadline" />
                            : <CircleDot size={14} className="mt-0.5 shrink-0" style={{ color: ACTION_COLOR[e.r.recommendation] }} aria-label={`Contract ends · ${e.r.recommendation}`} />}
                          <span className="min-w-0 text-xs">
                            <span className="block truncate font-medium text-slate-900">{e.r.short_name || e.r.software_name}</span>
                            {e.kind === 'notice'
                              ? <span className={u.cls}>notice deadline {u.label}{e.r.auto_renew ? ' · auto-renews' : ''}</span>
                              : <span className="text-slate-500">ends · {formatINR(e.r.annual_value)}/yr · {e.r.recommendation}</span>}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1"><AlarmClock size={13} className="text-red-700" />notice deadline (red ≤ 30 d, amber ≤ 90 d)</span>
        {Object.entries(ACTION_COLOR).map(([a, c]) => <span key={a} className="inline-flex items-center gap-1"><CircleDot size={13} style={{ color: c }} />ends · {a}</span>)}
        <span className="text-slate-400">Select an entry to open the contract.</span>
      </div>
    </div>
  );
}
