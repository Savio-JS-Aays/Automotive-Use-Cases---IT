import { formatDate, formatINR, formatNumber } from '../../../lib/format';
import { downloadCsv } from '../../../lib/csv';

const CSV_COLUMNS = [
  { key: 'employee_alias', label: 'Employee alias' }, { key: 'software_name', label: 'Product' }, { key: 'edition', label: 'Edition' },
  { key: 'department', label: 'Department' }, { key: 'region_name', label: 'Region' }, { key: 'status', label: 'Status' },
  { key: 'assigned_date', label: 'Assigned' }, { key: 'last_login_date', label: 'Last login' },
  { key: 'days_inactive', label: 'Days inactive' }, { key: 'annual_cost', label: 'Annual cost (INR)' },
];

/**
 * Seats with no login for 90+ days (or never used), most expensive first.
 * data = it_lic_reclaim result: { total_count, total_value, rows }
 */
export default function ReclaimTable({ data, loading, hideProduct = false }) {
  const rows = data?.rows ?? [];
  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between px-4 sm:px-5 py-3 border-b border-slate-200">
        <p className="text-sm text-slate-600">
          {loading ? 'Loading…' : (
            <>
              <span className="font-semibold text-slate-900">{formatNumber(data?.total_count)}</span> reclaimable seats worth{' '}
              <span className="font-semibold text-slate-900">{formatINR(data?.total_value)}</span>/yr
              {data?.total_count > rows.length && <span className="text-slate-500"> · showing top {rows.length} by cost</span>}
            </>
          )}
        </p>
        <button type="button" disabled={!rows.length} onClick={() => downloadCsv('reclaim-candidates.csv', rows, CSV_COLUMNS)} className="self-start sm:self-auto rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-sky-500">
          Export CSV
        </button>
      </div>
      <div className="overflow-x-auto max-h-96">
        <table className="w-full text-sm text-left text-slate-600">
          <thead className="text-xs uppercase bg-slate-50 text-slate-500 border-b border-slate-200 sticky top-0">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">Employee</th>
              {!hideProduct && <th scope="col" className="px-4 py-3 font-semibold">Product</th>}
              <th scope="col" className="px-4 py-3 font-semibold">Edition</th>
              <th scope="col" className="px-4 py-3 font-semibold">Department</th>
              <th scope="col" className="px-4 py-3 font-semibold">Region</th>
              <th scope="col" className="px-4 py-3 font-semibold">Last login</th>
              <th scope="col" className="px-4 py-3 font-semibold text-right">Days inactive</th>
              <th scope="col" className="px-4 py-3 font-semibold text-right">₹ / yr</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.assignment_id} className="border-b border-slate-100">
                <td className="px-4 py-2.5 font-medium text-slate-900 tabular-nums">{r.employee_alias}</td>
                {!hideProduct && <td className="px-4 py-2.5 whitespace-nowrap">{r.software_name}</td>}
                <td className="px-4 py-2.5">{r.edition}</td>
                <td className="px-4 py-2.5 whitespace-nowrap">{r.department}</td>
                <td className="px-4 py-2.5">{r.region_name}</td>
                <td className="px-4 py-2.5 whitespace-nowrap">{r.last_login_date ? formatDate(r.last_login_date) : <span className="text-red-700 font-medium">Never used</span>}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(r.days_inactive)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatINR(r.annual_cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
