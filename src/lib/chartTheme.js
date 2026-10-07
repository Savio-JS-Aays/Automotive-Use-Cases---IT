// Chart colours, from the validated dataviz reference palette (light surface).
// Categorical slots are assigned in fixed order and follow the entity, never its rank.
// Status colours are reserved for state and always ship with an icon or text label.

export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];

export const STATUS = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
};

// Ordinal blue ramp (funnel stages), darkest = most important stage; lightest step still clears 2:1
export const BLUE_ORDINAL = ['#86b6ef', '#5598e7', '#2a78d6', '#1c5cab'];

export const INK = {
  primary: '#0b0b0b',
  secondary: '#52514e',
  muted: '#898781',
  grid: '#e1e0d9',
  axis: '#c3c2b7',
  surface: '#fcfcfb',
  successText: '#006300',
};

export const axisTick = { fontSize: 12, fill: INK.muted };
export const gridProps = { stroke: INK.grid, strokeDasharray: '0', vertical: false };
export const tooltipStyle = {
  contentStyle: { borderRadius: 8, border: '1px solid rgba(11,11,11,0.10)', fontSize: 12, color: INK.primary },
  labelStyle: { color: INK.secondary, fontWeight: 600 },
};

// Downtime-severity ramp for availability cells: neutral gray = no meaningful downtime, then one orange hue light -> dark
export const AVAILABILITY_BUCKETS = [
  { min: 0.9995, color: '#f0efec', label: '≥ 99.95%' },
  { min: 0.999, color: '#fbd9c6', label: '99.9 – 99.95%' },
  { min: 0.995, color: '#f4a37f', label: '99.5 – 99.9%' },
  { min: 0.98, color: '#e2683a', label: '98 – 99.5%' },
  { min: -1, color: '#9a3412', label: '< 98%' },
];
export const availabilityColor = (v) => AVAILABILITY_BUCKETS.find((b) => v >= b.min).color;

// Incident priority colours (P1 critical → P4 neutral); always shown with the P1–P4 label
export const PRIORITY_COLOR = { 1: STATUS.critical, 2: STATUS.serious, 3: STATUS.warning, 4: '#b8b6ac' };
