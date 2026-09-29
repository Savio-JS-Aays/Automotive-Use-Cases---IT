import { useEffect, useState } from 'react';
import { fetchAllRows } from '../lib/fetchAllRows';

/**
 * Fetches several tables in parallel using the paginated loop.
 * `specs` must be defined outside the component so it stays stable:
 *   { incidents: { table: 'fact_incidents', select: '*', options: { orderBy: 'open_time' } } }
 * Returns { data: { incidents: [...] }, loading, error }.
 */
export function useRawTables(specs) {
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all(
      Object.entries(specs).map(async ([key, { table, select = '*', options }]) => [
        key,
        await fetchAllRows(table, select, options),
      ])
    )
      .then((entries) => {
        if (!cancelled) setData(Object.fromEntries(entries));
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Failed to load data');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [specs]);

  return { data, loading, error };
}