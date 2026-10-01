import { CircleAlert, CircleCheck, TriangleAlert } from 'lucide-react';

// Status always ships with an icon and a text label, never colour alone.
const STYLE = {
  good: { cls: 'bg-green-50 text-green-800 border-green-200', Icon: CircleCheck, label: 'Good' },
  warning: { cls: 'bg-amber-50 text-amber-800 border-amber-200', Icon: TriangleAlert, label: 'Watch' },
  critical: { cls: 'bg-red-50 text-red-700 border-red-200', Icon: CircleAlert, label: 'Act' },
};

export default function StatusBadge({ status = 'good', label }) {
  const s = STYLE[status] ?? STYLE.good;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${s.cls}`}>
      <s.Icon size={12} aria-hidden="true" />
      {label ?? s.label}
    </span>
  );
}

export function PriorityBadge({ priority }) {
  const label = ['P1 Critical', 'P2 High', 'P3 Medium', 'P4 Low'][priority - 1] ?? `P${priority}`;
  const cls = priority === 1 ? 'bg-red-50 text-red-700 border-red-200'
    : priority === 2 ? 'bg-amber-50 text-amber-800 border-amber-200'
      : 'bg-slate-100 text-slate-700 border-slate-200';
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${cls}`}>{label}</span>;
}
