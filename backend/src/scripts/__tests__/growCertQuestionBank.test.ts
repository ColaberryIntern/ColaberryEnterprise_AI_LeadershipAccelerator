import { growthPlan, nonOverlappingMocks } from '../growCertQuestionBank';

/**
 * The two calculations that decide what gets written.
 *
 * Both are cheap to test and expensive to get wrong. A bad growth plan produces
 * a bank that is the right SIZE and the wrong SHAPE — the mock builder then
 * silently compensates by serving short forms, which looks like a bug in the
 * exam rather than in the bank. A bad mock count tells you the bank is fine when
 * students are already seeing repeats.
 */

/** The bank as it stood after the 2026-09-10 approval run. */
const TODAY = { D1: 40, D2: 27, D3: 30, D4: 30, D5: 23 };

describe('nonOverlappingMocks', () => {
  it('is the SMALLEST domain division, not the average', () => {
    // The whole point. Averaging would have reported 2.6 and rounded to 3, while
    // D5 can only fill 2 — and a mock short on D5 is short, full stop.
    expect(nonOverlappingMocks(TODAY)).toBe(2);
  });

  it('is limited by the thinnest domain even when the others are deep', () => {
    expect(nonOverlappingMocks({ D1: 160, D2: 110, D3: 120, D4: 120, D5: 9 })).toBe(1);
  });

  it('is zero when any domain cannot fill even one mock', () => {
    // Not "almost one". A form that cannot be built is not a form.
    expect(nonOverlappingMocks({ D1: 16, D2: 11, D3: 12, D4: 12, D5: 8 })).toBe(0);
  });

  it('treats a missing domain as empty rather than throwing', () => {
    expect(nonOverlappingMocks({ D1: 16 })).toBe(0);
  });
});

describe('growthPlan', () => {
  it('allocates by MOCK DEMAND, which is not the same as blueprint weight', () => {
    // The distinction that cost the original recommendation. D2 is 18% of the
    // exam, which is 10.8 of 60 items and therefore 11 in practice. By weight,
    // 300 questions gives D2 fifty-four; five mocks need fifty-five.
    const want = Object.fromEntries(growthPlan(TODAY, 5).map((p) => [p.domain_id, p.want]));
    expect(want).toEqual({ D1: 80, D2: 55, D3: 60, D4: 60, D5: 45 });
    expect(Object.values(want).reduce((a, b) => a + b, 0)).toBe(300);
  });

  it('adds the difference, and the additions sum to the shortfall', () => {
    const plan = growthPlan(TODAY, 5);
    expect(plan.map((p) => p.add)).toEqual([40, 28, 30, 30, 22]);
    const total = Object.values(TODAY).reduce((a, b) => a + b, 0);
    expect(plan.reduce((s, p) => s + p.add, 0)).toBe(300 - total);
  });

  it('never asks for a negative addition when a domain is already over its share', () => {
    // Otherwise the plan would propose deleting questions to hit a ratio.
    const plan = growthPlan({ ...TODAY, D5: 90 }, 5);
    expect(plan.find((p) => p.domain_id === 'D5')?.add).toBe(0);
  });

  it('produces a plan that actually reaches the mock count it aims at', () => {
    // The end-to-end check, and the one that caught the weight-vs-demand error:
    // the plan must not merely look proportional, it must deliver the mocks it
    // was sized for.
    const after = Object.fromEntries(growthPlan(TODAY, 5).map((p) => [p.domain_id, p.want]));
    expect(nonOverlappingMocks(after)).toBe(5);
  });

  it('holds at every size, not just at five', () => {
    for (const n of [1, 2, 3, 4, 5, 8]) {
      const after = Object.fromEntries(growthPlan(TODAY, n).map((p) => [p.domain_id, p.want]));
      expect(nonOverlappingMocks(after)).toBe(n);
    }
  });
});
