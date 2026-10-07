/**
 * Small segmented toggle (radio group) for chart views and filters.
 * options: [{ value, label, disabled? }]
 */
export default function Segmented({ label, options, value, onChange }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} disabled={o.disabled} onClick={() => onChange(o.value)}
          title={o.title}
          className={`rounded-md px-2.5 py-1 font-medium whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:opacity-40 ${value === o.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Labelled native select sized for chart toolbars. */
export function ToolbarSelect({ label, value, onChange, children }) {
  return (
    <label className="inline-flex items-center gap-1.5 text-xs text-slate-500">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-slate-300 bg-white py-1 px-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500">
        {children}
      </select>
    </label>
  );
}
