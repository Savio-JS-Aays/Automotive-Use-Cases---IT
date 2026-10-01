// Shared number formatting: INR with Indian magnitudes, percentages, counts, dates.
// Same conventions as the Warranty app (Warranty/my-react-app/src/lib/format.js).

const isBlank = (v) => v === null || v === undefined || v === '' || Number.isNaN(Number(v));

// ₹ with Indian magnitude suffixes: K (thousand), L (lakh = 1e5), Cr (crore = 1e7)
export function formatINR(value, { compact = true } = {}) {
  if (isBlank(value)) return '—';
  const v = Number(value);
  if (!compact) return `₹${Math.round(v).toLocaleString('en-IN')}`;
  const abs = Math.abs(v);
  if (abs >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `₹${(v / 1e5).toFixed(1)} L`;
  if (abs >= 1e3) return `₹${(v / 1e3).toFixed(1)}K`;
  return `₹${Math.round(v)}`;
}

// Axis tick formatter for INR (no decimal noise)
export function formatINRAxis(value) {
  const abs = Math.abs(value);
  if (abs >= 1e7) return `₹${(value / 1e7).toFixed(abs >= 1e8 ? 0 : 1)}Cr`;
  if (abs >= 1e5) return `₹${(value / 1e5).toFixed(0)}L`;
  if (abs >= 1e3) return `₹${(value / 1e3).toFixed(0)}K`;
  return `₹${value}`;
}

export function formatNumber(value, digits = 0) {
  if (isBlank(value)) return '—';
  return Number(value).toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

// value is a fraction (0.134 -> "13.4%")
export function formatPct(value, digits = 1) {
  if (isBlank(value)) return '—';
  return `${(Number(value) * 100).toFixed(digits)}%`;
}

// Signed percentage-point or percent change from fractions: 0.012 -> "+1.2%"
export function formatSignedPct(value, digits = 1, unit = '%') {
  if (isBlank(value)) return '—';
  const v = Number(value) * 100;
  return `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(digits)}${unit}`;
}

export function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatMonth(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
}
