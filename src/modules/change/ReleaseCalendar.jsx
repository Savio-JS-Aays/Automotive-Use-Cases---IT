import { useMemo, useState } from 'react';
import Panel from '../../components/Panel';
import Segmented from '../../components/Segmented';
import { addDays, day, longDate } from './changeData';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
// Light blue tints so the numbers stay readable; failures are called out in words, not only colour
const TINTS = [
  { max: 0, bg: '#f8fafc', label: 'none' },
  { max: 2, bg: '#e3eefc', label: '1–2' },
  { max: 4, bg: '#c4dbf8', label: '3–4' },
  { max: Infinity, bg: '#9cc2f1', label: '5+' },
];
const tint = (n) => TINTS.find((t) => n <= t.max).bg;
const monthLabel = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/**
 * Wall-calendar view of deployments: one month card per month in the window, a cell per day showing how many deployments
 * went out and how many failed, written out in words. "Show" switches to failures only. A day opens it in the table below.
 */
export default function ReleaseCalendar({ deps, window: w, selected, onSelect }) {
  const [show, setShow] = useState('all');

  const model = useMemo(() => {
    if (!w) return null;
    const byDay = new Map();
    for (const d of deps) {
      const k = day(d);
      const x = byDay.get(k) || { n: 0, failed: 0, services: new Set() };
      x.n += 1; if (d.status === 'Failed') x.failed += 1; x.services.add(d.short_name);
      byDay.set(k, x);
    }
    const months = [];
    for (let d = w.d_from.slice(0, 8) + '01'; d <= w.d_to; ) {
      months.push(d);
      const nd = new Date(`${d}T00:00:00Z`); nd.setUTCMonth(nd.getUTCMonth() + 1); d = nd.toISOString().slice(0, 10);
    }
    const inWin = (iso) => iso >= w.d_from && iso <= w.d_to;
    const winDays = []; for (let d = w.d_from; d <= w.d_to; d = addDays(d, 1)) winDays.push(d);
    const active = winDays.filter((d) => byDay.get(d)?.n);
    const busiest = winDays.reduce((b, d) => ((byDay.get(d)?.n ?? 0) > (byDay.get(b)?.n ?? 0) ? d : b), winDays[0]);
    const weekend = winDays.filter((d) => [0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay())).reduce((t, d) => t + (byDay.get(d)?.n ?? 0), 0);
    const failDays = winDays.filter((d) => byDay.get(d)?.failed);
    return { byDay, months, inWin, total: deps.length, activeDays: active.length, days: winDays.length, busiest, weekend, failDays };
  }, [deps, w]);

  if (!model) return <Panel title="Deployment calendar"><p className="text-sm text-slate-500">Loading…</p></Panel>;
  const b = model.byDay.get(model.busiest);

  return (
    <Panel title="Deployment calendar"
      tooltip="Each day shows how many production deployments went out (rollbacks excluded) and, in red, how many of them failed. Darker blue = more deployments. Switch to 'Failures only' to see just the bad days. Select a day to list its deployments in the table below.">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Segmented label="Show" value={show} onChange={setShow} options={[{ value: 'all', label: 'All deployments' }, { value: 'failed', label: 'Failures only' }]} />
      </div>
      <ul className="mb-4 grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
        <li className="rounded-lg border border-slate-200 px-3 py-2"><p className="text-xs text-slate-500">Deployments</p><p className="font-semibold text-slate-900">{model.total} on {model.activeDays} of {model.days} days</p></li>
        <li className="rounded-lg border border-slate-200 px-3 py-2"><p className="text-xs text-slate-500">Busiest day</p><p className="font-semibold text-slate-900">{b?.n ? `${longDate(model.busiest)} · ${b.n}` : '—'}</p></li>
        <li className="rounded-lg border border-slate-200 px-3 py-2"><p className="text-xs text-slate-500">Days with a failure</p><p className="font-semibold text-red-700">{model.failDays.length} {model.failDays.length === 1 ? 'day' : 'days'}</p></li>
        <li className="rounded-lg border border-slate-200 px-3 py-2"><p className="text-xs text-slate-500">Weekend deployments</p><p className="font-semibold text-slate-900">{model.weekend} ({model.total ? Math.round((model.weekend / model.total) * 100) : 0}%)</p></li>
      </ul>
      <div className={`grid gap-5 ${model.months.length > 1 ? 'lg:grid-cols-2' : ''}`}>
        {model.months.map((m) => {
          const first = new Date(`${m}T00:00:00Z`);
          const lead = (first.getUTCDay() + 6) % 7;
          const daysInMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
          const cells = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => addDays(m, i))];
          return (
            <section key={m} aria-label={monthLabel(m)}>
              <h4 className="mb-2 text-sm font-semibold text-slate-800">{monthLabel(m)}</h4>
              <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {WEEKDAYS.map((wd) => <div key={wd} className="pb-1">{wd}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {cells.map((d, i) => {
                  if (!d) return <div key={`pad-${i}`} />;
                  const num = Number(d.slice(8));
                  if (!model.inWin(d)) return <div key={d} className="h-16 rounded-md border border-dashed border-slate-200 p-1 text-left text-[11px] text-slate-300">{num}</div>;
                  const x = model.byDay.get(d) ?? { n: 0, failed: 0, services: new Set() };
                  const dim = show === 'failed' && !x.failed;
                  const isSel = selected === d;
                  const label = `${longDate(d)}: ${x.n} deployment${x.n === 1 ? '' : 's'}${x.failed ? `, ${x.failed} failed` : ''}${x.services.size ? ` (${[...x.services].join(', ')})` : ''}`;
                  return (
                    <button key={d} type="button" title={label} aria-label={label} aria-pressed={isSel} onClick={() => onSelect(isSel ? null : d)}
                      className={`h-16 rounded-md p-1 text-left transition focus:outline-none focus:ring-2 focus:ring-blue-500 hover:ring-1 hover:ring-slate-400 ${isSel ? 'ring-2 ring-slate-900' : ''} ${dim ? 'opacity-30' : ''}`}
                      style={{ background: show === 'failed' ? (x.failed ? '#fde8e8' : '#f8fafc') : tint(x.n), borderLeft: x.failed ? '3px solid #d03b3b' : undefined }}>
                      <span className="block text-[11px] text-slate-500">{num}</span>
                      {x.n > 0 && <span className="block text-sm font-bold leading-tight text-slate-900">{x.n}<span className="ml-0.5 text-[10px] font-normal text-slate-600"> dep{x.n === 1 ? '' : 's'}</span></span>}
                      {x.failed > 0 && <span className="block text-[10px] font-semibold text-red-700">{x.failed} failed</span>}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-600">
        {show === 'all' && TINTS.map((t) => (
          <span key={t.label} className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-[3px] border border-black/5" style={{ background: t.bg }} />{t.label} deployments</span>
        ))}
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-1 rounded-sm bg-[#d03b3b]" />red edge + "n failed" = a deployment failed that day</span>
        <span className="text-slate-400">Select a day to list its deployments.</span>
      </div>
    </Panel>
  );
}
