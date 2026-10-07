// Shared control styles (suite look: solid blue active pill, light grey inactive pills)
export const toggleGroupCls = 'inline-flex flex-wrap items-center gap-1.5';
export const toggleCls = (active) => `inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:opacity-40 ${
  active ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`;
// Native select with the suite's chevron
export const selectCls = 'suite-select w-full appearance-none rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-9 text-[15px] text-slate-800 shadow-sm hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500';
