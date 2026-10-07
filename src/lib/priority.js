// Incident priority filter (global sidebar filter on Overview and App Reliability)
export const PRIORITY_FILTERS = [
  { value: 'all', label: 'All priorities', short: 'All' },
  { value: '1', label: 'P1 · Critical', short: 'P1' },
  { value: '2', label: 'P2 · High', short: 'P2' },
  { value: '3', label: 'P3 · Medium', short: 'P3' },
  { value: '4', label: 'P4 · Low', short: 'P4' },
  { value: '12', label: 'P1 + P2', short: 'P1 + P2' },
];
export const prioSet = (v) => (v === '12' ? [1, 2] : ['1', '2', '3', '4'].includes(v) ? [Number(v)] : [1, 2, 3, 4]);
export const prioShort = (v) => PRIORITY_FILTERS.find((p) => p.value === v)?.short ?? 'All';
export const matchesPrio = (v) => { const s = prioSet(v); return (i) => s.includes(i.priority); };
