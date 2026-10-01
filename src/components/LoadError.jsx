import { BackendMissingError } from '../lib/rpc';

// Shown when a module's RPCs fail. Missing functions get set-up guidance instead of a raw error.
export default function LoadError({ error, what = 'this page' }) {
  const missing = error instanceof BackendMissingError;
  return (
    <div className={`rounded-xl border p-5 text-sm ${missing ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-red-200 bg-white text-red-700'}`}>
      <p className="font-semibold mb-1">{missing ? `Data for ${what} is not set up yet` : `Could not load ${what}`}</p>
      <p>{missing ? 'Apply the IT migrations in documentations/schema/migrations (001–010, in order); see the README in that folder.' : error.message}</p>
      {missing && <p className="mt-1 text-xs opacity-80">{error.message}</p>}
    </div>
  );
}
