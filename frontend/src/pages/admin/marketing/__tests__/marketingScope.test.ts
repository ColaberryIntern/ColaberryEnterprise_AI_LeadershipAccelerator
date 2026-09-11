import {
  ALL_BRANDS,
  comparisonLabel,
  comparisonRange,
  defaultScope,
  freshnessLabel,
  rangeLengthDays,
  scopeToQuery,
} from '../marketingScope';

/**
 * The scope maths, where a wrong answer looks exactly like a right one.
 *
 * Every assertion here guards a failure that renders cleanly. A comparison window one day
 * shorter than the primary window reports "leads down 14%" when the truth is "we compared six
 * days against seven" - no error, a perfectly good chart, and a decision made on it. Off-by-one
 * in an inclusive date range is the same shape. So is a freshness label derived from render
 * time rather than fetch time.
 */

describe('rangeLengthDays counts inclusively', () => {
  it('a single day is one day, not zero', () => {
    // The classic off-by-one. A zero-length window silently divides by zero downstream or
    // reports a rate of Infinity.
    expect(rangeLengthDays({ start: '2026-09-10', end: '2026-09-10' })).toBe(1);
  });

  it('counts both endpoints', () => {
    expect(rangeLengthDays({ start: '2026-09-01', end: '2026-09-30' })).toBe(30);
    expect(rangeLengthDays({ start: '2026-09-01', end: '2026-09-07' })).toBe(7);
  });

  it('is unaffected by a daylight-saving transition', () => {
    // US DST ends 2026-11-01. Day arithmetic in LOCAL time yields 25 hours for that day and
    // the division rounds to the wrong count. UTC throughout is what prevents it.
    expect(rangeLengthDays({ start: '2026-10-25', end: '2026-11-08' })).toBe(15);
  });
});

describe('comparisonRange', () => {
  const range = { start: '2026-09-04', end: '2026-09-10' }; // 7 days inclusive

  it('returns null when no comparison is selected', () => {
    expect(comparisonRange(range, 'none')).toBeNull();
  });

  it('previous_period is the SAME LENGTH as the primary window', () => {
    // The load-bearing invariant. Comparing unequal windows is the defect this whole module
    // exists to prevent, and it is invisible in the output.
    const prev = comparisonRange(range, 'previous_period')!;
    expect(rangeLengthDays(prev)).toBe(rangeLengthDays(range));
  });

  it('previous_period ends the day BEFORE the primary window starts', () => {
    const prev = comparisonRange(range, 'previous_period')!;
    expect(prev.end).toBe('2026-09-03');
    expect(prev.start).toBe('2026-08-28');
  });

  it('previous_period does not overlap the primary window', () => {
    // An overlap of even one day double-counts it into both sides of the comparison.
    const prev = comparisonRange(range, 'previous_period')!;
    expect(prev.end < range.start).toBe(true);
  });

  it('preserves length for a single-day window', () => {
    const single = { start: '2026-09-10', end: '2026-09-10' };
    const prev = comparisonRange(single, 'previous_period')!;
    expect(prev).toEqual({ start: '2026-09-09', end: '2026-09-09' });
    expect(rangeLengthDays(prev)).toBe(1);
  });

  it('previous_year shifts by 364 days so the WEEKDAY is preserved', () => {
    // 2026-09-10 is a Thursday. A 365-day shift lands on a Wednesday and compares Thursday
    // traffic against Wednesday traffic - marketing performance is strongly day-of-week
    // shaped, so that comparison is worse than no comparison.
    const prev = comparisonRange(range, 'previous_year')!;
    const primaryDow = new Date(`${range.end}T00:00:00Z`).getUTCDay();
    const compareDow = new Date(`${prev.end}T00:00:00Z`).getUTCDay();
    expect(compareDow).toBe(primaryDow);
    expect(rangeLengthDays(prev)).toBe(rangeLengthDays(range));
  });

  it('crosses a month boundary correctly', () => {
    const prev = comparisonRange({ start: '2026-03-01', end: '2026-03-07' }, 'previous_period')!;
    expect(prev).toEqual({ start: '2026-02-22', end: '2026-02-28' });
  });

  it('handles a leap day without losing one', () => {
    // 2028 is a leap year. February has 29 days, and a naive month-arithmetic implementation
    // drops or duplicates the 29th.
    const prev = comparisonRange({ start: '2028-03-01', end: '2028-03-07' }, 'previous_period')!;
    expect(prev).toEqual({ start: '2028-02-23', end: '2028-02-29' });
    expect(rangeLengthDays(prev)).toBe(7);
  });
});

describe('scopeToQuery', () => {
  const range = { start: '2026-09-04', end: '2026-09-10' };

  it('OMITS brand_id for "all brands" rather than sending the sentinel', () => {
    // Sending brand=all would make the API's meaning depend on a client-side constant, and
    // would collide with a real brand whose slug happened to be "all". Omitting it means
    // "everything I am allowed to see", which is what the server already enforces.
    const query = scopeToQuery({ brand: ALL_BRANDS, range, comparison: 'none' });
    expect(query.brand_id).toBeUndefined();
    expect(query).toEqual({ start: '2026-09-04', end: '2026-09-10' });
  });

  it('sends brand_id when a single brand is selected', () => {
    const query = scopeToQuery({ brand: 'brand-1', range, comparison: 'none' });
    expect(query.brand_id).toBe('brand-1');
  });

  it('carries the comparison window when one is selected', () => {
    const query = scopeToQuery({ brand: ALL_BRANDS, range, comparison: 'previous_period' });
    expect(query.compare_start).toBe('2026-08-28');
    expect(query.compare_end).toBe('2026-09-03');
  });

  it('omits the comparison keys entirely when comparison is none', () => {
    // Not empty strings. A blank compare_start is a parameter the server has to interpret,
    // and "" is exactly the kind of value that becomes epoch zero somewhere downstream.
    const query = scopeToQuery({ brand: ALL_BRANDS, range, comparison: 'none' });
    expect('compare_start' in query).toBe(false);
    expect('compare_end' in query).toBe(false);
  });

  it('changing brand changes the query it would send', () => {
    // The acceptance criterion, expressed where it can be checked without a DOM: the scope is
    // what drives the request, so a brand change must be observable in the outgoing params.
    const a = scopeToQuery({ brand: ALL_BRANDS, range, comparison: 'none' });
    const b = scopeToQuery({ brand: 'brand-2', range, comparison: 'none' });
    expect(a).not.toEqual(b);
    expect(b.brand_id).toBe('brand-2');
  });
});

describe('defaultScope', () => {
  it('is 30 days INCLUSIVE, ending today', () => {
    const scope = defaultScope('2026-09-10');
    expect(scope.range.end).toBe('2026-09-10');
    expect(scope.range.start).toBe('2026-08-12');
    expect(rangeLengthDays(scope.range)).toBe(30);
  });

  it('defaults to all brands, not to an arbitrary first brand', () => {
    // Defaulting to one brand would silently scope every figure on the page to it, and the
    // operator would have no reason to suspect the totals were partial.
    expect(defaultScope('2026-09-10').brand).toBe(ALL_BRANDS);
  });
});

describe('freshnessLabel reports the FETCH time, never the render time', () => {
  const now = Date.parse('2026-09-10T12:00:00Z');

  it('says nothing has loaded rather than showing a time', () => {
    expect(freshnessLabel(null, now)).toBe('Not loaded yet');
    expect(freshnessLabel(undefined, now)).toBe('Not loaded yet');
  });

  it('reports elapsed time since the given fetch', () => {
    expect(freshnessLabel('2026-09-10T11:58:00Z', now)).toBe('Updated 2 min ago');
    expect(freshnessLabel('2026-09-10T09:00:00Z', now)).toBe('Updated 3 hr ago');
    expect(freshnessLabel('2026-09-08T12:00:00Z', now)).toBe('Updated 2 d ago');
  });

  it('is pure - the same inputs always give the same label', () => {
    // The property that distinguishes a reported timestamp from a manufactured one. A
    // `new Date()` implementation would drift between these two calls.
    expect(freshnessLabel('2026-09-10T11:00:00Z', now)).toBe(
      freshnessLabel('2026-09-10T11:00:00Z', now),
    );
  });

  it('does not print a stale label for an unparseable timestamp', () => {
    expect(freshnessLabel('not-a-date', now)).toBe('Unknown');
  });
});

describe('comparisonLabel', () => {
  it('states both counts and a signed absolute delta', () => {
    expect(comparisonLabel(12, 8)).toBe('12 vs 8 (+4)');
    expect(comparisonLabel(30, 31)).toBe('30 vs 31 (−1)');
    expect(comparisonLabel(2, 2)).toBe('2 vs 2 (±0)');
  });

  it('never a percentage - a small prior period would turn noise into a trend', () => {
    expect(comparisonLabel(3, 1)).not.toMatch(/%/);
  });
});
