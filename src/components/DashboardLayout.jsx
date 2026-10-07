import React from 'react';
import { NavLink, useLocation, useSearchParams } from 'react-router-dom';
import { useGlobalStore } from '../store/useGlobalStore';
import { useRawTables } from '../hooks/useRawTables';
import { NAV_ITEMS } from '../lib/nav';
import { selectCls } from '../lib/ui';
import { PRIORITY_FILTERS } from '../lib/priority';

// Security sidebar lists (it_fact_security_incident / it_fact_phishing_sim departments; it_fact_vulnerability asset classes)
const SEC_DEPARTMENTS = ['Corporate', 'Dealer Network', 'Engineering', 'Finance', 'HR', 'Logistics', 'Manufacturing', 'Sales'];
const SEC_ASSETS = ['OT device', 'Server', 'Endpoint', 'Network device', 'SaaS configuration'];

const REGION_SPECS = {
  regions: { table: 'dim_region', select: 'region_id, region_name', options: { orderBy: 'region_id' } },
  services: { table: 'it_dim_service', select: 'service_id, short_name', options: { orderBy: 'short_name' } },
  vendors: { table: 'it_dim_vendor', select: 'vendor_id, vendor_name', options: { orderBy: 'vendor_name' } },
  software: { table: 'it_dim_software', select: 'software_id, category, business_vertical', options: { orderBy: 'software_id' } },
};

function FilterSelect({ label, value, onChange, children }) {
  return (
    <label className="block">
      <span className="block mb-1.5 text-sm font-semibold text-slate-700">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={selectCls}>{children}</select>
    </label>
  );
}

/** App shell in the suite style: dark module bar (vertical code + tabs), white filter sidebar, light content area. */
export default function DashboardLayout({ children }) {
  const { data: lookups } = useRawTables(REGION_SPECS);
  const { dateRange, regionId, incidentPriority, deployService, changeType, secDepartment, secAsset, setGlobalFilter } = useGlobalStore();
  const { pathname } = useLocation();
  // Licensing is fiscal-year based (as-of date), so the rolling date range does not apply there
  const usesDateRange = !pathname.startsWith('/licensing-subs');
  const usesPriority = pathname.startsWith('/executive-overview') || pathname.startsWith('/app-reliability');
  const usesDeployFilters = pathname.startsWith('/deployments');
  const usesSecFilters = pathname.startsWith('/security');
  const usesLicFilters = pathname.startsWith('/licensing-subs');
  // Licensing filters live in the URL (?vertical= &vendor= &category=) so every Licensing tab and drawer shares them
  const [params, setParams] = useSearchParams();
  const setParam = (key, value) => setParams((prev) => { const p = new URLSearchParams(prev); if (value) p.set(key, value); else p.delete(key); return p; });
  const sw = lookups.software ?? [];
  const licOptions = {
    vertical: [...new Set(sw.map((x) => x.business_vertical))].sort(),
    category: [...new Set(sw.map((x) => x.category))].sort(),
  };

  return (
    <div className="flex flex-col h-screen bg-[#f4f6fa] font-sans">
      <header className="bg-[#0f172a] text-white flex items-center gap-6 px-4 sm:px-6 h-16 shrink-0 z-10">
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xl font-bold tracking-wide">IT</span>
          <span className="hidden sm:inline border-l border-slate-600 pl-3 text-sm text-slate-400">Information Technology</span>
        </div>
        <nav aria-label="Modules" className="flex-1 min-w-0 overflow-x-auto">
          <ul className="flex gap-1.5 w-max">
            {NAV_ITEMS.map((item) => (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  className={({ isActive }) => `block px-4 py-2 rounded-lg text-[15px] font-medium whitespace-nowrap transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                    isActive ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-200 hover:bg-slate-800 hover:text-white'}`}
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <div className="flex flex-1 flex-col md:flex-row overflow-hidden">
        <aside className="md:w-64 bg-white border-b md:border-b-0 md:border-r border-slate-200 shrink-0 overflow-y-auto">
          <h2 className="mx-4 md:mx-5 pt-4 md:pt-5 pb-3 border-b border-slate-200 text-xs font-bold tracking-wider uppercase text-slate-900">Filters</h2>
          <div className="grid grid-cols-2 md:grid-cols-1 gap-3 md:gap-5 p-4 md:p-5">
            {usesDateRange ? (
              <FilterSelect label="Date Range" value={dateRange} onChange={(v) => setGlobalFilter('dateRange', v)}>
                <option>Last 7 Days</option>
                <option>Last 30 Days</option>
                <option>Last 90 Days</option>
              </FilterSelect>
            ) : (
              <p className="text-sm text-slate-500 self-end">Period: fiscal year to the as-of date (set on this page).</p>
            )}
            <FilterSelect label="Region" value={regionId} onChange={(v) => setGlobalFilter('regionId', v)}>
              <option value="All">All Regions</option>
              {(lookups.regions ?? []).map((r) => <option key={r.region_id} value={r.region_id}>{r.region_name}</option>)}
            </FilterSelect>
            {usesDeployFilters && (
              <>
                <FilterSelect label="Service" value={deployService} onChange={(v) => setGlobalFilter('deployService', v)}>
                  <option value="">All Services</option>
                  {(lookups.services ?? []).map((x) => <option key={x.service_id} value={x.service_id}>{x.short_name}</option>)}
                </FilterSelect>
                <FilterSelect label="Change Type" value={changeType} onChange={(v) => setGlobalFilter('changeType', v)}>
                  <option value="">All Change Types</option>
                  {['Code', 'Config', 'Infra'].map((t) => <option key={t} value={t}>{t}</option>)}
                </FilterSelect>
              </>
            )}
            {usesLicFilters && (
              <>
                <FilterSelect label="Vertical" value={params.get('vertical') ?? ''} onChange={(v) => setParam('vertical', v)}>
                  <option value="">All Verticals</option>
                  {licOptions.vertical.map((v) => <option key={v} value={v}>{v}</option>)}
                </FilterSelect>
                <FilterSelect label="Vendor" value={params.get('vendor') ?? ''} onChange={(v) => setParam('vendor', v)}>
                  <option value="">All Vendors</option>
                  {(lookups.vendors ?? []).map((v) => <option key={v.vendor_id} value={v.vendor_id}>{v.vendor_name}</option>)}
                </FilterSelect>
                <FilterSelect label="Category" value={params.get('category') ?? ''} onChange={(v) => setParam('category', v)}>
                  <option value="">All Categories</option>
                  {licOptions.category.map((c) => <option key={c} value={c}>{c}</option>)}
                </FilterSelect>
              </>
            )}
            {usesSecFilters && (
              <>
                <FilterSelect label="Department" value={secDepartment} onChange={(v) => setGlobalFilter('secDepartment', v)}>
                  <option value="">All Departments</option>
                  {SEC_DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                </FilterSelect>
                <FilterSelect label="Asset Class" value={secAsset} onChange={(v) => setGlobalFilter('secAsset', v)}>
                  <option value="">All Asset Classes</option>
                  {SEC_ASSETS.map((a) => <option key={a} value={a}>{a}</option>)}
                </FilterSelect>
              </>
            )}
            {usesPriority && (
              <FilterSelect label="Incident Priority" value={incidentPriority} onChange={(v) => setGlobalFilter('incidentPriority', v)}>
                {PRIORITY_FILTERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </FilterSelect>
            )}
          </div>
          <p className="hidden md:block mx-5 text-xs text-slate-400">All data is as of 30 Sep 2026 (demo date). Windows end on that day.</p>
        </aside>

        <main className="p-4 sm:p-6 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
