import { PriorityBadge } from './StatusBadge';
import { downloadCsv } from '../lib/csv';

const fmtTime = (t) => (t ? new Date(t).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const fmtMttr = (m) => (m === null || m === undefined ? '—' : m < 90 ? `${m} min` : `${(m / 60).toFixed(1)} h`);

/** Incident list (it_ops_incidents rows). Row click opens the incident drawer. */
export default function IncidentsTable({ rows = [], loading, onOpen, empty = 'No incidents in this window.' }) {
  return (
    <div>
      <div className="flex items-center justify-between px-4 sm:px-5 py-2 border-b border-slate-100 text-xs text-slate-500">
        <span>{loading ? 'Loading…' : `${rows.length} incident${rows.length === 1 ? '' : 's'}`}</span>
        <button type="button" disabled={!rows.length} onClick={() => downloadCsv('incidents.csv', rows, [
          { key: 'incident_id', label: 'Incident' }, { key: 'title', label: 'Title' }, { key: 'short_name', label: 'Service' },
          { key: 'priority', label: 'Priority' }, { key: 'status', label: 'Status' }, { key: 'root_cause_type', label: 'Root cause' },
          { key: 'open_time', label: 'Opened' }, { key: 'mtta_minutes', label: 'MTTA (min)' }, { key: 'mttr_minutes', label: 'MTTR (min)' },
          { key: 'region_name', label: 'Region' }, { key: 'location_name', label: 'Site' }, { key: 'deployment_id', label: 'Caused by deployment' },
        ])} className="rounded-md border border-slate-300 bg-white px-2 py-1 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-sky-500">Export CSV</button>
      </div>
      <div className="overflow-x-auto max-h-[28rem]">
        <table className="w-full text-sm text-left text-slate-600">
          <thead className="text-xs uppercase bg-slate-50 text-slate-500 border-b border-slate-200 sticky top-0">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-semibold">Incident</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Priority</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Cause</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Opened</th>
              <th scope="col" className="px-4 py-2.5 font-semibold text-right">MTTA</th>
              <th scope="col" className="px-4 py-2.5 font-semibold text-right">MTTR</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Where</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.incident_id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-2.5">
                  <button type="button" onClick={() => onOpen(r.incident_id)} className="text-left focus:outline-none focus:ring-2 focus:ring-sky-500 rounded">
                    <span className="block font-medium text-slate-900 hover:text-sky-700">{r.title}</span>
                    <span className="block text-xs text-slate-500">{r.incident_id} · {r.status}{r.deployment_id ? ` · from ${r.deployment_id}` : ''}</span>
                  </button>
                </td>
                <td className="px-4 py-2.5"><PriorityBadge priority={r.priority} /></td>
                <td className="px-4 py-2.5 whitespace-nowrap">{r.root_cause_type}</td>
                <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">{fmtTime(r.open_time)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">{fmtMttr(r.mtta_minutes)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">{r.status === 'Active' ? <span className="text-amber-700 font-medium">open</span> : fmtMttr(r.mttr_minutes)}</td>
                <td className="px-4 py-2.5 text-xs">{r.location_name ?? r.region_name ?? '—'}</td>
              </tr>
            ))}
            {!loading && !rows.length && <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-500">{empty}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
