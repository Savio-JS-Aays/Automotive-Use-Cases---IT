import { HelpCircle } from 'lucide-react';
import Tooltip from './ToolTip';

export default function ChartCard({ title, tooltip, children }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-600">{title}</h3>
        <Tooltip content={tooltip}>
          <button type="button" aria-label={`About ${title}`} className="rounded focus:outline-none focus:ring-2 focus:ring-sky-500">
            <HelpCircle size={16} className="text-slate-400" />
          </button>
        </Tooltip>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}