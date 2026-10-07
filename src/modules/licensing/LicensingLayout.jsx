import { useCallback, useMemo } from 'react';
import { NavLink, Outlet, useSearchParams } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { useGlobalStore } from '../../store/useGlobalStore';
import { useRpc } from '../../hooks/useRpc';
import LoadError from '../../components/LoadError';
import { PageHeader } from '../../components/Panel';
import { toggleCls } from '../../lib/ui';
import { formatDate } from '../../lib/format';
import { LicensingContext, encodeDocScope } from './LicensingContext';
import ProductDrawer from './drawers/ProductDrawer';
import ContractDrawer from './drawers/ContractDrawer';
import VendorDrawer from './drawers/VendorDrawer';
import DocumentDrawer from './drawers/DocumentDrawer';

const PAGES = [
  { to: '/licensing-subs', label: 'Subscriptions', end: true },
  { to: '/licensing-subs/spend', label: 'Spend & Budget' },
  { to: '/licensing-subs/usage', label: 'Usage & Optimisation' },
  { to: '/licensing-subs/renewals', label: 'Renewals & Contracts' },
  { to: '/licensing-subs/vendors', label: 'Vendors' },
  { to: '/licensing-subs/documents', label: 'Documents & Compliance' },
];

const DRAWER_KEYS = ['sw', 'tab', 'contract', 'vendor_id', 'docs', 'month', 'dept'];

/** Section shell for the Licensing suite: header, sub-nav, shared filters, and the shared drill-down drawers. */
export default function LicensingLayout() {
  const regionId = useGlobalStore((s) => s.regionId);
  const [params, setParams] = useSearchParams();

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
        <PageHeader title="Licensing & Subscriptions"
          note={`As of ${formatDate(k?.as_of)} · ${fyLabel} (Apr–Mar) · all figures in ₹${k ? ` · ${k.products} products · ${k.contracts_active} active contracts · ${k.documents} documents` : ''}${filters.vertical || filters.vendor || filters.category ? ' · sidebar filters applied' : ''}${filters.region ? ' · region filter applies to seats and spend; contract values are apportioned by seat share' : ''}`}>
          <button type="button" onClick={() => open.docs({})}
            className="inline-flex items-center gap-2 self-start rounded-lg bg-[#0f172a] px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
            <FileText size={16} aria-hidden="true" /> All documents
          </button>
        </PageHeader>

        <nav aria-label="Licensing pages" className="overflow-x-auto">
          <ul className="flex w-max gap-1.5">
            {PAGES.map((pg) => (
              <li key={pg.to}>
                <NavLink to={{ pathname: pg.to, search: keepSearch }} end={pg.end}
                  className={({ isActive }) => `block ${toggleCls(isActive)}`}>
                  {pg.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {kpis.error ? <LoadError error={kpis.error} what="Licensing & Subscriptions" /> : <Outlet />}
      </div>

      {params.get('sw') && <ProductDrawer key={params.get('sw')} softwareId={params.get('sw')} initialTab={params.get('tab') ?? 'Overview'} onClose={() => patch({ sw: null, tab: null })} />}
      {params.get('contract') && <ContractDrawer key={params.get('contract')} contractId={params.get('contract')} onClose={() => patch({ contract: null })} />}
      {params.get('vendor_id') && <VendorDrawer key={params.get('vendor_id')} vendorId={params.get('vendor_id')} onClose={() => patch({ vendor_id: null })} />}
      {params.get('docs') && <DocumentDrawer raw={params.get('docs')} onClose={() => patch({ docs: null })} />}
    </LicensingContext.Provider>
  );
}
