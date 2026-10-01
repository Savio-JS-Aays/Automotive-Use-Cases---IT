import { useMemo } from 'react';
import { useGlobalStore } from '../store/useGlobalStore';
import { rangeToDays } from '../lib/dateUtils';

/**
 * Global sidebar filters as the it_* RPC filter contract: { days, region }.
 * Extra keys (e.g. service) are merged in by the caller. "All" becomes null (no filter).
 */
export function useItFilters(extra = {}) {
  const dateRange = useGlobalStore((s) => s.dateRange);
  const regionId = useGlobalStore((s) => s.regionId);
  const extraKey = JSON.stringify(extra);
  return useMemo(() => ({
    days: rangeToDays(dateRange),
    region: regionId && regionId !== 'All' ? regionId : null,
    ...JSON.parse(extraKey),
  }), [dateRange, regionId, extraKey]);
}
