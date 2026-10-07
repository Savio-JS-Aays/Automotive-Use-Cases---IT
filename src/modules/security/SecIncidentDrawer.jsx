import { CheckCircle2, Radar, ShieldAlert, ShieldCheck, Zap } from 'lucide-react';
import Drawer from '../../components/Drawer';
import { formatNumber, formatPct } from '../../lib/format';
import { INC_SEV, INCIDENT_VECTOR_OF, fmtDT, fmtH, hoursBetween } from './secData';

const THREAT_OF = Object.fromEntries(Object.entries(INCIDENT_VECTOR_OF).map(([t, i]) => [i, t]));

function Fact({ label, value, note }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="font-semibold text-slate-900">{value}</p>
      {note && <p className="text-xs text-slate-500">{note}</p>}
    </div>
  );
}

/**
 * Security incident drill-down: lifecycle (impact → detected → contained → resolved) with MTTD / MTTC / time to resolve,
 * who and what was affected, and the threat feed for the same vector on the day it was detected.
 */
export default function SecIncidentDrawer({ inc, regionName, productName, threats, onClose }) {
  if (!inc) return null;
  const sev = INC_SEV[inc.severity];
  const detDay = inc.detected_time.slice(0, 10);
  const tv = THREAT_OF[inc.vector];
  const feed = tv ? threats.find((t) => t.vector === tv && t.date_id === detDay) : null;
  const steps = [
    { label: 'Impact started', t: inc.impact_start_time, Icon: Zap },
    { label: 'Detected', t: inc.detected_time, gap: `time to detect ${fmtH(hoursBetween(inc.impact_start_time, inc.detected_time))}`, Icon: Radar },
    { label: inc.contained_time ? 'Contained' : 'Not contained yet', t: inc.contained_time, gap: inc.contained_time ? `time to contain ${fmtH(hoursBetween(inc.detected_time, inc.contained_time))}` : null, Icon: ShieldCheck },
    { label: inc.resolved_time ? 'Resolved' : 'Not resolved yet', t: inc.resolved_time, gap: inc.resolved_time ? `${fmtH(hoursBetween(inc.contained_time, inc.resolved_time))} after containment` : null, Icon: CheckCircle2 },
  ];

  return (
    <Drawer open onClose={onClose} width="max-w-2xl" title={`${inc.sec_incident_id} · ${inc.title}`} subtitle={`${inc.vector} · ${inc.status}`}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-semibold" style={{ borderColor: sev.color, color: sev.color }}>
            <ShieldAlert size={14} aria-hidden="true" />{sev.label}
          </span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">{inc.status}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Fact label="Department" value={inc.department} />
          <Fact label="Region" value={regionName ?? '—'} />
          <Fact label="Product involved" value={productName ?? '—'} />
          <Fact label="Impact to resolved" value={fmtH(hoursBetween(inc.impact_start_time, inc.resolved_time))} note={inc.resolved_time ? null : 'still open'} />
        </div>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-bold text-slate-900">Lifecycle</h3>
          <ol className="relative ml-2 border-l border-slate-200">
            {steps.map((s) => (
              <li key={s.label} className="mb-3 ml-4 last:mb-0">
                <span className="absolute -left-[7px] mt-0.5 rounded-full bg-white"><s.Icon size={14} className={s.t ? 'text-blue-700' : 'text-amber-600'} aria-hidden="true" /></span>
                <p className="text-sm font-medium text-slate-800">{s.label} <span className="font-normal text-slate-500">· {fmtDT(s.t)}</span></p>
                {s.gap && <p className="text-xs text-slate-500">{s.gap}</p>}
              </li>
            ))}
          </ol>
        </section>

        {feed && (
          <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
            <h3 className="mb-1 text-sm font-bold text-slate-900">{tv} feed on the day it was detected</h3>
            <p className="text-slate-700">{formatNumber(feed.detected)} detected · {formatNumber(feed.blocked)} blocked ({formatPct(feed.blocked / feed.detected, 2)}) · <b>{formatNumber(feed.detected - feed.blocked)} got through</b></p>
            <p className="mt-1 text-xs text-slate-500">The threat feed counts attempts stopped (or not) by email, endpoint and network controls; this incident is one that caused real impact.</p>
          </section>
        )}
      </div>
    </Drawer>
  );
}
