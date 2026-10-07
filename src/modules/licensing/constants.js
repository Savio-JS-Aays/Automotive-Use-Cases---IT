import { STATUS } from '../../lib/chartTheme';

// Chip styles for the per-product recommendation (it_lic_portfolio.recommendation). Text always names the action.
export const RECOMMENDATION_STYLE = {
  Renew: 'bg-green-50 text-green-800 border-green-200',
  Review: 'bg-amber-50 text-amber-800 border-amber-200',
  'Right-size': 'bg-orange-50 text-orange-800 border-orange-200',
  'True-up': 'bg-red-50 text-red-700 border-red-200',
};

export const DOC_TYPES = ['MSA', 'Order Form', 'SOW', 'SLA', 'DPA', 'Renewal Quote', 'Invoice', 'Security Assessment'];

// Invoice status chips (text always states the status)
export const INVOICE_STYLE = {
  Paid: 'bg-green-50 text-green-800 border-green-200',
  Due: 'bg-slate-100 text-slate-700 border-slate-200',
  Overdue: 'bg-amber-50 text-amber-800 border-amber-200',
  Disputed: 'bg-red-50 text-red-700 border-red-200',
};

// Utilisation heatmap: neutral at/above target, then one orange hue darker as utilisation falls
export const UTIL_BUCKETS = [
  { min: 0.85, color: '#f0efec', label: '≥ 85% (target)' },
  { min: 0.75, color: '#fbd9c6', label: '75–85%' },
  { min: 0.65, color: '#f4a37f', label: '65–75%' },
  { min: 0.55, color: '#e2683a', label: '55–65%' },
  { min: -1, color: '#9a3412', label: '< 55%' },
];
export const utilColor = (v) => UTIL_BUCKETS.find((b) => v >= b.min).color;

// Recommended action colours (always shown with the action name)
export const ACTION_COLOR = { Renew: STATUS.good, Review: STATUS.warning, 'Right-size': STATUS.serious, 'True-up': STATUS.critical };
