import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * One URL search param as state, so drill-downs are linkable and survive reloads.
 * Setting null/'' removes the param.
 */
export function useUrlParam(key) {
  const [params, setParams] = useSearchParams();
  const value = params.get(key);
  const set = useCallback((next) => {
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      if (next === null || next === undefined || next === '') p.delete(key);
      else p.set(key, next);
      return p;
    });
  }, [key, setParams]);
  return [value, set];
}

/** Set several params in one navigation: patch({ cell: null, incident: 'INC00012' }). */
export function usePatchUrlParams() {
  const [, setParams] = useSearchParams();
  return useCallback((patch) => {
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === undefined || v === '') p.delete(k);
        else p.set(k, v);
      }
      return p;
    });
  }, [setParams]);
}
