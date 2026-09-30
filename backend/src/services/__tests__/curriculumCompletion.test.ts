import {
  BUCKET_ORDER, WEEK_DONE_THRESHOLD, bucketRank, paceBandFor, weekFromSessionTitle,
} from '../curriculumCompletionService';

/**
 * The three definitions the Class Dashboard's pace KPI rests on.
 *
 * Every one of them is a judgement that could have gone another way, and two of them were
 * wrong on the first attempt in a way that produced a plausible-looking dashboard:
 *
 *   - reading the WEEK off `session_number` put a cohort on week 13 when it was on week 6,
 *     which would have painted all 49 students red;
 *   - a 50% "week done" bar put 47 of 49 into red and left green empty, reporting nothing.
 *
 * Neither failed loudly. Both rendered a full, confident screen of colour. So the rules are
 * pinned here rather than left to be re-derived by whoever next reads the service.
 */

describe('the cohort week comes from the session title, not its number', () => {
  it('reads the week out of the title the sessions actually carry', () => {
    // Verbatim shapes from the July 2026 cohort.
    expect(weekFromSessionTitle('Week 6 · Build Day — Advanced MCP + Systems')).toBe(6);
    expect(weekFromSessionTitle('Week 12 · Architecture Day — Capstone')).toBe(12);
    expect(weekFromSessionTitle('week 3 build day')).toBe(3);
  });

  it('treats a title naming no week as week 0', () => {
    // "Orientation — Welcome to the Accelerator" is session #1 and precedes week 1. It is
    // the only unparseable title in the cohort, and 0 is the truthful answer for it.
    expect(weekFromSessionTitle('Orientation — Welcome to the Accelerator')).toBe(0);
    expect(weekFromSessionTitle('')).toBe(0);
    expect(weekFromSessionTitle(null)).toBe(0);
    expect(weekFromSessionTitle(undefined)).toBe(0);
  });

  it('does not mistake a session NUMBER for a week', () => {
    // THE LOAD-BEARING ASSERTION. Two sessions run per week and the numbering skips, so
    // session 13 is week 6. A regex that matched a bare digit would return 13 here and
    // every student would read as seven weeks behind.
    expect(weekFromSessionTitle('Session 13 — Build Day')).toBe(0);
  });
});

describe('the pace bands, exactly as Ali set them', () => {
  it('puts 2 or more weeks ahead in gold', () => {
    expect(paceBandFor(2)).toBe('gold');
    expect(paceBandFor(6)).toBe('gold');
  });

  it('keeps level and one week ahead in green', () => {
    // A student level with the class is keeping up by any reading, so 0 is green, not a
    // band of its own.
    expect(paceBandFor(0)).toBe('green');
    expect(paceBandFor(1)).toBe('green');
  });

  it('puts exactly one week behind in yellow', () => {
    expect(paceBandFor(-1)).toBe('yellow');
  });

  it('puts two or more weeks behind in red', () => {
    expect(paceBandFor(-2)).toBe('red');
    expect(paceBandFor(-6)).toBe('red');
  });

  it('leaves no delta unbanded', () => {
    const bands = new Set<string>();
    for (let d = -12; d <= 12; d += 1) bands.add(paceBandFor(d));
    expect(bands).toEqual(new Set(['gold', 'green', 'yellow', 'red']));
  });
});

describe('the week-done threshold', () => {
  it('is 30%, the value measured to separate the bands', () => {
    // At 50% the July cohort produced gold 2, green 0, yellow 0, red 47 - a KPI with an
    // empty middle reports nothing. At 30% it produced 2 / 4 / 2 / 41. If this constant
    // moves, that trade-off is what moved with it.
    expect(WEEK_DONE_THRESHOLD).toBe(0.3);
  });

  it('is a fraction, not a percentage', () => {
    // Passing 30 here would make every week complete and every student gold.
    expect(WEEK_DONE_THRESHOLD).toBeGreaterThan(0);
    expect(WEEK_DONE_THRESHOLD).toBeLessThan(1);
  });
});

describe('sections come back in the order a week is taught', () => {
  it('orders the seven buckets the way the curriculum runs', () => {
    expect([...BUCKET_ORDER]).toEqual([
      'pre_class', 'learn', 'practice', 'build', 'reflect', 'share', 'advance',
    ]);
  });

  it('does not sort them alphabetically', () => {
    // THE LOAD-BEARING ASSERTION. `localeCompare` was the original sort, which put
    // `advance` — the last thing in a week — in the first column of the heatmap and
    // `pre_class` in the fifth. Seven rows hid that; seven columns read left to right
    // do not.
    const alphabetical = [...BUCKET_ORDER].sort((a, b) => a.localeCompare(b));
    const taught = [...BUCKET_ORDER].sort((a, b) => bucketRank(a) - bucketRank(b));
    expect(taught).not.toEqual(alphabetical);
    expect(taught[0]).toBe('pre_class');
    expect(taught[taught.length - 1]).toBe('advance');
  });

  it('sorts an unknown bucket last instead of dropping it', () => {
    // A bucket added to the enum but not to BUCKET_ORDER must still render as a column,
    // otherwise cards silently vanish from a view whose whole job is showing what is there.
    expect(bucketRank('some_new_bucket')).toBe(BUCKET_ORDER.length);
    const mixed = ['advance', 'some_new_bucket', 'pre_class']
      .sort((a, b) => bucketRank(a) - bucketRank(b));
    expect(mixed).toEqual(['pre_class', 'advance', 'some_new_bucket']);
  });
});
