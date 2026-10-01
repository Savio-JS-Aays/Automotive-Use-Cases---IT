import { createContext, useContext } from 'react';

/**
 * Shared state for the Licensing suite, provided by LicensingLayout:
 *   filters  — RPC filter contract { region, vertical, vendor, category }
 *   meta     — { as_of, fy_start, fyLabel, target } from it_lic_kpis_ext
 *   open     — openers for the shared drawers (all URL-backed):
 *              product(id, tab?), contract(id), vendor(id), docs(scope) where scope is
 *              { software } | { contract } | { vendor } | { invoice } | { doc_type } | { gaps: true } | {}
 *   setFilter(key, value) — page-level filter (vertical / vendor / category)
 */
export const LicensingContext = createContext(null);

export function useLicensing() {
  const ctx = useContext(LicensingContext);
  if (!ctx) throw new Error('useLicensing must be used inside LicensingLayout');
  return ctx;
}

// Encode / decode the ?docs= scope ("contract:CT-2024-001", "vendor:V05", "all", legacy "missing" / "SW05")
export function encodeDocScope(scope = {}) {
  const [key, value] = Object.entries(scope).find(([, v]) => v !== undefined && v !== null && v !== '') ?? [];
  if (!key) return 'all';
  if (key === 'gaps') return 'missing';
  return `${key}:${value}`;
}

export function decodeDocScope(raw) {
  if (!raw || raw === 'all') return {};
  if (raw === 'missing') return { gaps: true };
  if (/^SW\d+$/.test(raw)) return { software: raw };
  const i = raw.indexOf(':');
  return i > 0 ? { [raw.slice(0, i)]: raw.slice(i + 1) } : {};
}
