import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Activity, CreditCard, GitPullRequestArrow, LayoutDashboard, Server, ShieldAlert } from 'lucide-react';
import { useGlobalStore } from '../store/useGlobalStore';
import { useRawTables } from '../hooks/useRawTables';

const REGION_SPECS = { regions: { table: 'dim_region', select: 'region_id, region_name', options: { orderBy: 'region_id' } } };

const NAV_ITEMS = [
  { path: '/executive-overview', label: 'Overview', icon: LayoutDashboard },
  { path: '/app-reliability', label: 'App Reliability', icon: Server },
  { path: '/change-impact', label: 'Change Impact', icon: GitPullRequestArrow },
  { path: '/security', label: 'Security', icon: ShieldAlert },
  { path: '/licensing-subs', label: 'Licensing', icon: CreditCard },
];

const selectCls = 'w-full border border-slate-300 rounded-md py-1.5 px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500';

export default function DashboardLayout({ children }) {
  const { data: lookups } = useRawTables(REGION_SPECS);
  const { dateRange, regionId, setGlobalFilter } = useGlobalStore();
  // Licensing is fiscal-year based (as-of date), so the rolling date range does not apply there
  const usesDateRange = !useLocation().pathname.startsWith('/licensing-subs');

  return (
    <div className="flex flex-col h-screen bg-slate-50 font-sans">
      <header className="bg-slate-900 text-white flex items-center gap-6 px-4 sm:px-6 h-16 shrink-0 border-b border-slate-800 shadow-sm z-10">
        <div className="font-bold text-lg sm:text-xl tracking-wide flex items-center gap-2 shrink-0">
          <Activity className="text-sky-400" aria-hidden="true" />
          <span>Fleet Command</span>
        </div>
        <nav aria-label="Modules" className="flex-1 min-w-0 overflow-x-auto">
          <ul className="flex gap-1 w-max">
            {NAV_ITEMS.map((item) => (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  className={({ isActive }) => `flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                    isActive ? 'bg-slate-800 text-sky-400' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
                >
                  <item.icon size={16} aria-hidden="true" />
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="hidden sm:flex w-8 h-8 shrink-0 rounded-full bg-sky-600 border-2 border-slate-700 items-center justify-center text-sm font-bold text-white shadow-sm">SJ</div>
      </header>

      <div className="flex flex-1 flex-col md:flex-row overflow-hidden">
        <aside className="md:w-60 bg-white border-b md:border-b-0 md:border-r border-slate-200 p-4 md:p-5 shrink-0 overflow-y-auto">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 md:mb-4">Global Filters</h2>
          <div className="grid grid-cols-2 md:grid-cols-1 gap-3 md:gap-4">
            {usesDateRange ? (
              <label className="block text-xs font-semibold text-slate-600">
                <span className="block mb-1">Date Range</span>
                <select value={dateRange} onChange={(e) => setGlobalFilter('dateRange', e.target.value)} className={selectCls}>
                  <option>Last 7 Days</option>
                  <option>Last 30 Days</option>
                  <option>Last 90 Days</option>
                </select>
              </label>
            ) : (
              <p className="text-xs text-slate-500 self-end">Period: fiscal year to the as-of date (set on this page).</p>
            )}
            <label className="block text-xs font-semibold text-slate-600">
              <span className="block mb-1">Region</span>
              <select value={regionId} onChange={(e) => setGlobalFilter('regionId', e.target.value)} className={selectCls}>
                <option value="All">All</option>
                {(lookups.regions ?? []).map((r) => <option key={r.region_id} value={r.region_id}>{r.region_name}</option>)}
              </select>
            </label>
          </div>
          <p className="hidden md:block mt-5 text-xs text-slate-400">All data is as of 30 Sep 2026 (demo date). Windows end on that day.</p>
        </aside>

        <main className="p-4 sm:p-6 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
