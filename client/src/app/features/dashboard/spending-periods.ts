import { toIsoDate } from '../../core/utils';

export type RangeKey = 'month' | '3m' | '6m' | '12m' | 'year';
type Granularity = 'day' | 'week' | 'twoWeeks' | 'month';

export const RANGES: { key: RangeKey; label: string }[] = [
  { key: 'month', label: 'This month' },
  { key: '3m', label: '3 months' },
  { key: '6m', label: '6 months' },
  { key: '12m', label: '12 months' },
  { key: 'year', label: 'This year' },
];

const GRANULARITY: Record<RangeKey, Granularity> = {
  month: 'day',
  '3m': 'week',
  '6m': 'twoWeeks',
  '12m': 'month',
  year: 'month',
};

const CHART_TITLE: Record<Granularity, string> = {
  day: 'Daily spending',
  week: 'Weekly spending',
  twoWeeks: 'Biweekly spending',
  month: 'Monthly spending',
};

export interface Bucket {
  from: string; // yyyy-MM-dd, inclusive
  to: string; // yyyy-MM-dd, inclusive
  label: string;
  tooltip: string;
  paid: number;
  pending: number;
}

/**
 * The full period a range covers. Every range runs to the end of the current period
 * (month or year), so future days with scheduled expenses are included.
 */
export function rangeBounds(key: RangeKey, now = new Date()): { from: Date; to: Date } {
  const y = now.getFullYear();
  const m = now.getMonth();
  if (key === 'year') return { from: new Date(y, 0, 1), to: new Date(y, 11, 31) };
  const monthsBack = { month: 0, '3m': 2, '6m': 5, '12m': 11 }[key];
  return { from: new Date(y, m - monthsBack, 1), to: new Date(y, m + 1, 0) };
}

export function chartTitle(key: RangeKey): string {
  return CHART_TITLE[GRANULARITY[key]];
}

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const minDate = (a: Date, b: Date) => (a < b ? a : b);
const maxDate = (a: Date, b: Date) => (a > b ? a : b);
const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) => d.toLocaleDateString(undefined, opts);

/** Splits the range into day / week / two-week / month buckets and sums daily totals into them. */
export function buildBuckets(
  key: RangeKey,
  byDay: { date: string; paid: number; pending: number }[],
  now = new Date(),
): Bucket[] {
  const { from, to } = rangeBounds(key, now);
  const granularity = GRANULARITY[key];
  const buckets: Bucket[] = [];

  const push = (start: Date, end: Date, label: string, tooltip: string) =>
    buckets.push({ from: toIsoDate(start), to: toIsoDate(end), label, tooltip, paid: 0, pending: 0 });

  if (granularity === 'day') {
    for (let d = from; d <= to; d = addDays(d, 1)) {
      push(d, d, String(d.getDate()), fmt(d, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }));
    }
  } else if (granularity === 'month') {
    for (let d = from; d <= to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      // "This year" only spans one year, so the month name is enough; 12 months crosses a year boundary.
      const label = key === 'year' ? fmt(d, { month: 'short' }) : fmt(d, { month: 'short', year: 'numeric' });
      push(d, end, label, fmt(d, { month: 'long', year: 'numeric' }));
    }
  } else {
    // Weeks start on Monday; the first and last buckets are clipped to the range.
    const days = granularity === 'week' ? 7 : 14;
    let start = addDays(from, -((from.getDay() + 6) % 7));
    for (; start <= to; start = addDays(start, days)) {
      const s = maxDate(start, from);
      const e = minDate(addDays(start, days - 1), to);
      const range = `${fmt(s, { month: 'short', day: 'numeric' })} – ${fmt(e, { month: 'short', day: 'numeric', year: 'numeric' })}`;
      push(s, e, fmt(s, { month: 'short', day: 'numeric' }), range);
    }
  }

  // Both lists are sorted by date, so walk them together.
  let i = 0;
  for (const day of byDay) {
    while (i < buckets.length && day.date > buckets[i].to) i++;
    if (i === buckets.length) break;
    if (day.date >= buckets[i].from) {
      buckets[i].paid += day.paid;
      buckets[i].pending += day.pending;
    }
  }
  return buckets;
}
