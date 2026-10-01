import { supabase } from './supabaseClient';

// Postgres RPC wrapper with a short de-dup cache (pattern from Warranty/my-react-app/src/lib/rpc.js).
// React StrictMode runs effects twice in dev and filter toggles re-ask the same questions; the data only
// changes when migrations reload it, so caching identical calls for a few minutes is safe.

const CACHE_MS = 5 * 60 * 1000;
const cache = new Map();

// Thrown when the database objects from the migrations are not there yet
export class BackendMissingError extends Error {}

async function callRpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    // PGRST202: function not found in the schema cache; 42883: undefined function; 42P01: undefined table
    if (['PGRST202', '42883', '42P01'].includes(error.code)) {
      throw new BackendMissingError(`Database function ${name} is missing. Apply documentations/schema/migrations/001–010 in order.`);
    }
    throw new Error(error.message || `RPC ${name} failed`);
  }
  return data;
}

export function rpc(name, args = {}) {
  const key = `${name}|${JSON.stringify(args)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.promise;
  const promise = callRpc(name, args);
  cache.set(key, { at: Date.now(), promise });
  promise.catch(() => cache.delete(key)); // never cache failures
  return promise;
}
