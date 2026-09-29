const DAY_MS = 24 * 60 * 60 * 1000;

/** 'Last 7 Days' -> 7. Falls back to 7 for unrecognised labels. */
export function rangeToDays(dateRange) {
  const match = /(\d+)/.exec(dateRange || '');
  return match ? parseInt(match[1], 10) : 7;
}

export function toDayKey(value) {
  return new Date(value).toISOString().slice(0, 10);
}

/** Array of 'YYYY-MM-DD' keys for the last `days` days, oldest first, ending today. */
export function lastNDayKeys(days, now = Date.now()) {
  return Array.from({ length: days }, (_, i) => toDayKey(now - (days - 1 - i) * DAY_MS));
}

export { DAY_MS };