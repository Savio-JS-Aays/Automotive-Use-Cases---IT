import { supabase } from './supabaseClient';

const PAGE_SIZE = 1000; // Supabase default max rows per request

/**
 * Fetches every row of a table by walking .range() windows in a while loop,
 * bypassing the 1000-row API limit. No SQL aggregates are used.
 *
 * @param {string} table   Table name
 * @param {string} select  Select string (supports joins, e.g. '*, dim_application!inner(*)')
 * @param {object} options
 * @param {(query) => query} [options.filter]  Adds filters, e.g. (q) => q.eq('tier', 1)
 * @param {string} [options.orderBy]           Stable sort column so pages never overlap
 */
export async function fetchAllRows(table, select = '*', { filter, orderBy } = {}) {
  const rows = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabase.from(table).select(select);
    if (filter) query = filter(query);
    if (orderBy) query = query.order(orderBy, { ascending: true });

    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) throw error;

    rows.push(...data);
    hasMore = data.length === PAGE_SIZE;
    from += PAGE_SIZE;
  }

  return rows;
}