import { useEffect, useState } from 'react';
import { rpc } from '../lib/rpc';

/**
 * Calls a Postgres RPC and re-calls it when the args change (compared by value).
 * Pass `enabled = false` to skip the call (e.g. while a drawer is closed).
 * Returns { data, loading, error } where error is an Error (BackendMissingError when migrations are missing).
 * While new args load, `data` keeps the previous result so charts don't flash empty.
 */
export function useRpc(name, args, enabled = true) {
  const key = `${name}|${JSON.stringify(args ?? {})}`;
  const [state, setState] = useState({ data: null, error: null, key: null });

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    rpc(name, args ?? {})
      .then((data) => !cancelled && setState({ data, error: null, key }))
      .catch((error) => !cancelled && setState({ data: null, error, key }));
    return () => {
      cancelled = true;
    };
    // args is captured through `key`, which changes whenever its value does
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  return { data: state.data, error: state.key === key ? state.error : null, loading: enabled && state.key !== key };
}
