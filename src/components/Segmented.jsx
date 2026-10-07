import { toggleCls, toggleGroupCls } from '../lib/ui';

/**
 * Small segmented toggle (radio group) for chart views and filters.
 * options: [{ value, label, disabled? }]
 */
export default function Segmented({ label, options, value, onChange }) {
  return (
    <div role="radiogroup" aria-label={label} className={toggleGroupCls}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} disabled={o.disabled} onClick={() => onChange(o.value)}
          title={o.title}
          className={toggleCls(value === o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Labelled native select sized for chart toolbars. */
export function ToolbarSelect({ label, value, onChange, children }) {
  return (
    <label className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-slate-200 bg-white py-1.5 px-2 text-sm font-normal normal-case tracking-normal text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500">
        {children}
      </select>
    </label>
  );
}
