/**
 * Page-level tabs (below the KPI cards) that split a long page into sections. Same pill style as the Licensing sub-nav.
 * tabs: [{ value, label, hint }] — hint is a short description shown under the active tab row.
 */
export default function SubTabs({ label, tabs, value, onChange }) {
  const active = tabs.find((t) => t.value === value) ?? tabs[0];
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 px-5 py-3">
      <div role="tablist" aria-label={label} className="flex flex-wrap items-center gap-1.5">
        {tabs.map((t) => (
          <button key={t.value} type="button" role="tab" aria-selected={t.value === active.value} onClick={() => onChange(t.value)}
            className={`rounded-lg px-4 py-2 text-[15px] font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              t.value === active.value ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {active.hint && <p className="mt-2 text-sm text-slate-500">{active.hint}</p>}
    </div>
  );
}
