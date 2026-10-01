import { useCallback, useMemo } from 'react';
import { NavLink, Outlet, useSearchParams } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { useGlobalStore } from '../../store/useGlobalStore';
import { useRawTables } from '../../hooks/useRawTables';
import { useRpc } from '../../hooks/useRpc';
import LoadError from '../../components/LoadError';
import { formatDate } from '../../lib/format';
import { LicensingContext, encodeDocScope } from './LicensingContext';
import ProductDrawer from './drawers/ProductDrawer';
import ContractDrawer from './drawers/ContractDrawer';
import VendorDrawer from './drawers/VendorDrawer';
import DocumentDrawer from './drawers/DocumentDrawer';

const OPTION_SPECS = {
  vendors: { table: 'it_dim_vendor', select: 'vendor_id, vendor_name', options: { orderBy: 'vendor_name' } },
  software: { table: 'it_dim_software', select: 'software_id, category, business_vertical', options: { orderBy: 'software_id' } },
};

const PAGES = [
  { to: '/licensing-subs', label: 'Overview', end: true },
  { to: '/licensing-subs/spend', label: 'Spend & Budget' },
  { to: '/licensing-subs/usage', label: 'Usage & Optimisation' },
  { to: '/licensing-subs/renewals', label: 'Renewals & Contracts' },
  { to: '/licensing-subs/vendors', label: 'Vendors' },
  { to: '/licensing-subs/documents', label: 'Documents & Compliance' },
];

const PAGE_FILTERS = [
  { key: 'vertical', label: 'Vertical' },
  { key: 'vendor', label: 'Vendor' },
  { key: 'category', label: 'Category' },
];
const DRAWER_KEYS = ['sw', 'tab', 'contract', 'vendor_id', 'docs', 'month', 'dept'];

/** Section shell for the Licensing suite: header, sub-nav, shared filters, and the shared drill-down drawers. */
export default function LicensingLayout() {
  const regionId = useGlobalStore((s) => s.regionId);
  const [params, setParams] = useSearchParams();
  const { data: options } = useRawTables(OPTION_SPECS);

  const patch = useCallback((changes) => {
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(changes)) {
        if (v === null || v === undefined || v === '') p.delete(k);
        else p.set(k, v);
      }
      return p;
    });
  }, [setParams]);

  const filters = useMemo(() => ({
    region: regionId && regionId !== 'All' ? regionId : null,
    vertical: params.get('vertical'),
    vendor: params.get('vendor'),
    category: params.get('category'),
  }), [regionId, params]);

  const kpis = useRpc('it_lic_kpis_ext', { p_filters: filters });
  const k = kpis.data;
  const fyLabel = k?.fy_start ? `FY ${new Date(k.fy_start).getFullYear()}-${String(new Date(k.fy_start).getFullYear() + 1).slice(2)}` : '';

  const open = useMemo(() => ({
    product: (id, tab) => patch({ sw: id, tab: tab ?? null, contract: null, vendor_id: null, docs: null }),
    contract: (id) => patch({ contract: id, sw: null, tab: null, vendor_id: null, docs: null }),
    vendor: (id) => patch({ vendor_id: id, sw: null, tab: null, contract: null, docs: null }),
    docs: (scope) => patch({ docs: encodeDocScope(scope), sw: null, tab: null, contract: null, vendor_id: null }),
  }), [patch]);

  const ctx = useMemo(() => ({
    filters, kpis, open, patch, params,
    meta: { as_of: k?.as_of, fy_start: k?.fy_start, fyLabel, target: Number(k?.target_utilisation ?? 0.85) },
    setFilter: (key, value) => patch({ [key]: value }),
  }), [filters, kpis, open, patch, params, k, fyLabel]);

  const filterOptions = useMemo(() => {
    const sw = options.software ?? [];
    return {
      vertical: [...new Set(sw.map((s) => s.business_vertical))].sort().map((v) => ({ value: v, label: v })),
      category: [...new Set(sw.map((s) => s.category))].sort().map((v) => ({ value: v, label: v })),
      vendor: (options.vendors ?? []).map((v) => ({ value: v.vendor_id, label: v.vendor_name })),
    };
  }, [options]);

  // Sub-nav links keep the page filters but drop open drawers
  const keepSearch = useMemo(() => {
    const p = new URLSearchParams(params);
    DRAWER_KEYS.forEach((key) => p.delete(key));
    const s = p.toString();
    return s ? `?${s}` : '';
  }, [params]);

  return (
    <LicensingContext.Provider value={ctx}>
      <div className="space-y-5 pb-10">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Licensing &amp; Subscriptions</h1>
            <p className="text-sm text-slate-500">
              As of {formatDate(k?.as_of)} · {fyLabel} (Apr–Mar) · all figures in ₹
              {filters.region && ' · region filter applies to seats and spend; contract values are apportioned by seat share'}
            </p>
          </div>
          <button type="button" onClick={() => open.docs({})}
            className="inline-flex items-center gap-2 self-start rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2">
            <FileText size={16} aria-hidden="true" /> All documents
          </button>
        </div>

        <nav aria-label="Licensing pages" className="overflow-x-auto border-b border-slate-200">
          <ul className="flex w-max gap-1">
            {PAGES.map((pg) => (
              <li key={pg.to}>
                <NavLink to={{ pathname: pg.to, search: keepSearch }} end={pg.end}
                  className={({ isActive }) => `block whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium -mb-px focus:outline-none focus:ring-2 focus:ring-sky-500 ${isActive ? 'border-sky-600 text-sky-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
                  {pg.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex flex-wrap items-end gap-3 bg-white px-4 py-3 rounded-xl border border-slate-200 shadow-sm">
          {PAGE_FILTERS.map((f) => (
            <label key={f.key} className="flex flex-col text-xs font-semibold text-slate-600">
              {f.label}
              <select value={params.get(f.key) ?? ''} onChange={(e) => patch({ [f.key]: e.target.value })}
                className="mt-1 min-w-40 rounded-md border border-slate-300 bg-white py-1.5 px-2 text-sm font-normal text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500">
                <option value="">All</option>
                {filterOptions[f.key].map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          ))}
          {PAGE_FILTERS.some((f) => params.get(f.key)) && (
            <button type="button" onClick={() => patch({ vertical: null, vendor: null, category: null })}
              className="text-sm font-medium text-sky-700 hover:underline focus:outline-none focus:ring-2 focus:ring-sky-500 rounded px-1 py-1.5">Clear filters</button>
          )}
          <p className="ml-auto text-xs text-slate-500">{k ? `${k.products} products · ${k.contracts_active} active contracts · ${k.documents} documents` : '…'}</p>
        </div>

        {kpis.error ? <LoadError error={kpis.error} what="Licensing & Subscriptions" /> : <Outlet />}
      </div>

      {params.get('sw') && <ProductDrawer key={params.get('sw')} softwareId={params.get('sw')} initialTab={params.get('tab') ?? 'Overview'} onClose={() => patch({ sw: null, tab: null })} />}
      {params.get('contract') && <ContractDrawer key={params.get('contract')} contractId={params.get('contract')} onClose={() => patch({ contract: null })} />}
      {params.get('vendor_id') && <VendorDrawer key={params.get('vendor_id')} vendorId={params.get('vendor_id')} onClose={() => patch({ vendor_id: null })} />}
      {params.get('docs') && <DocumentDrawer raw={params.get('docs')} onClose={() => patch({ docs: null })} />}
    </LicensingContext.Provider>
  );
}
