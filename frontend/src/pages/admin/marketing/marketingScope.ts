/**
 * marketingScope — the brand/date scope every marketing read is filtered by, as pure logic.
 *
 * Separated from the strip that renders it so the two things most likely to be silently wrong
 * are testable without a DOM: what gets sent to the server when the operator changes brand, and
 * what "compared to" actually means.
 *
 * WHY THE COMPARISON MATH IS THE RISKY PART. A comparison window that is one day shorter than
 * the primary window produces a number that is wrong and entirely plausible — "leads down 14%"
 * when the truth is "we compared six days against seven". Nothing errors, the chart renders, and
 * the conclusion is acted on. So the length invariant is asserted rather than assumed, and the
 * arithmetic is done in UTC throughout: constructing a Date from a wall-clock string and doing
 * day arithmetic in local time drifts by an hour twice a year, which silently moves a boundary
 * across a day for anyone near midnight.
 */

/** Sentinel for "every brand this operator may see". Not a brand id, deliberately. */
export const ALL_BRANDS = 'all' as const;

export type BrandScope = typeof ALL_BRANDS | string;

export type ComparisonMode = 'none' | 'previous_period' | 'previous_year';

export interface DateRange {
  /** Inclusive, ISO date (YYYY-MM-DD). */
  start: string;
  /** Inclusive, ISO date (YYYY-MM-DD). */
  end: string;
}

export interface MarketingScope {
  brand: BrandScope;
  range: DateRange;
  comparison: ComparisonMode;
}

const MS_PER_DAY = 86_400_000;

function toUtc(isoDate: string): number {
  // Explicitly UTC midnight. `new Date('2026-09-10')` is already UTC, but
  // `new Date('2026-09-10T00:00:00')` is LOCAL — a one-character difference that moves the
  // boundary. Parsing the parts removes the ambiguity entirely.
  const [y, m, d] = isoDate.split('-').map(Number);
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Whole days covered by a range, INCLUSIVE of both ends. A single day is length 1, not 0. */
export function rangeLengthDays(range: DateRange): number {
  return Math.round((toUtc(range.end) - toUtc(range.start)) / MS_PER_DAY) + 1;
}

/**
 * The window to compare against, or null when no comparison is selected.
 *
 * `previous_period` returns the window of EQUAL LENGTH ending the day before the primary
 * window starts — contiguous and non-overlapping. Overlapping by a day would double-count that
 * day into both sides of the comparison.
 *
 * `previous_year` shifts by 364 days rather than by a calendar year, on purpose: marketing
 * performance is strongly day-of-week shaped, and 365 days lands the comparison on a different
 * weekday, so a Tuesday gets compared against a Monday. 364 is exactly 52 weeks and preserves
 * alignment. It drifts against the calendar date, which is the correct trade for weekly
 * seasonality and is stated here so nobody "fixes" it to 365.
 */
export function comparisonRange(range: DateRange, mode: ComparisonMode): DateRange | null {
  if (mode === 'none') return null;

  const startMs = toUtc(range.start);
  const endMs = toUtc(range.end);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return null;

  if (mode === 'previous_year') {
    const shift = 364 * MS_PER_DAY;
    return { start: fromUtc(startMs - shift), end: fromUtc(endMs - shift) };
  }

  const lengthMs = endMs - startMs;
  const prevEnd = startMs - MS_PER_DAY;
  return { start: fromUtc(prevEnd - lengthMs), end: fromUtc(prevEnd) };
}

/**
 * The query the server is actually asked for.
 *
 * `ALL_BRANDS` omits the brand parameter entirely rather than sending `brand=all`. The server
 * scopes by membership regardless, so omitting it means "everything I am allowed to see" and
 * cannot be mistaken for a brand whose slug happens to be "all". Sending the sentinel would
 * make the API's meaning depend on a client-side constant.
 */
export function scopeToQuery(scope: MarketingScope): Record<string, string> {
  const query: Record<string, string> = { start: scope.range.start, end: scope.range.end };
  if (scope.brand !== ALL_BRANDS) query.brand_id = scope.brand;

  const compare = comparisonRange(scope.range, scope.comparison);
  if (compare) {
    query.compare_start = compare.start;
    query.compare_end = compare.end;
  }
  return query;
}

/** A sensible default: the last 30 days ending today, inclusive, compared to the period before. */
export function defaultScope(today: string): MarketingScope {
  const end = toUtc(today);
  return {
    brand: ALL_BRANDS,
    range: { start: fromUtc(end - 29 * MS_PER_DAY), end: today },
    comparison: 'previous_period',
  };
}

/**
 * How fresh the data on screen is, in words.
 *
 * `null` means nothing has loaded, and says so rather than rendering a time. This exists
 * because the marketing page previously derived freshness from `new Date()` at render time,
 * which reported the moment the component mounted as the data's age — it never moved when the
 * data refreshed, and still claimed freshness after a failed fetch.
 */
export function freshnessLabel(fetchedAt: string | null | undefined, now: number): string {
  if (!fetchedAt) return 'Not loaded yet';
  const then = Date.parse(fetchedAt);
  if (Number.isNaN(then)) return 'Unknown';

  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) return 'Updated just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `Updated ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Updated ${hours} hr ago`;
  return `Updated ${Math.round(hours / 24)} d ago`;
}
