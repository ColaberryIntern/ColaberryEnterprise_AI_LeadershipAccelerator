import { deriveBidDecision, type BidDecisionInput } from '../govBidDecision';

// A "strong" baseline; each test flips fields to exercise a band. Deterministic + explainable.
const strongBase: BidDecisionInput = {
  establishedCount: 10, pursuitBlockingCount: 0, openSubmissionCount: 0, eligibilityGapCount: 0,
  capability: 'strong', daysLeft: 30, estimatedValue: 1_000_000,
};

describe('deriveBidDecision (pure, deterministic, advisory)', () => {
  it('strong capability + no blockers + runway + value -> strong fit, high score', () => {
    const d = deriveBidDecision(strongBase);
    expect(d.band).toBe('strong');
    expect(d.score).toBeGreaterThanOrEqual(72);
    expect(d.headline).toMatch(/pursue/i);
  });

  it('a closed deadline forces "pass" regardless of everything else', () => {
    const d = deriveBidDecision({ ...strongBase, daysLeft: -2 });
    expect(d.band).toBe('pass');
    expect(d.headline).toMatch(/closed/i);
    expect(d.factors.find((f) => f.key === 'deadline')?.signal).toBe('concern');
  });

  it('a pursuit-blocking requirement forces "pass" (resolve-first)', () => {
    const d = deriveBidDecision({ ...strongBase, pursuitBlockingCount: 2 });
    expect(d.band).toBe('pass');
    expect(d.headline).toMatch(/blocking/i);
  });

  it('the IVR case (no auto match + eligibility gates + heavy effort, but no blocker, 16 days) -> caution, not pass', () => {
    const d = deriveBidDecision({ establishedCount: 81, pursuitBlockingCount: 0, openSubmissionCount: 81, eligibilityGapCount: 3, capability: 'none', daysLeft: 16, estimatedValue: 500_000 });
    expect(d.band).toBe('caution');
    expect(d.score).toBeGreaterThanOrEqual(35);
    // honest capability note: a missing match is a caveat, not a verdict
    expect(d.factors.find((f) => f.key === 'capability')?.detail).toMatch(/literal|confirm/i);
  });

  it('every factor carries an explainable detail; missing capability is a concern not a hard fail', () => {
    const d = deriveBidDecision({ ...strongBase, capability: 'none' });
    for (const f of d.factors) expect(typeof f.detail).toBe('string');
    expect(d.factors.find((f) => f.key === 'capability')?.signal).toBe('concern');
    expect(d.band).not.toBe('pass'); // no capability alone doesn't condemn it
  });

  it('is total: clamps the score to 0..100', () => {
    const worst = deriveBidDecision({ establishedCount: 1, pursuitBlockingCount: 5, openSubmissionCount: 100, eligibilityGapCount: 9, capability: 'none', daysLeft: -30, estimatedValue: null });
    expect(worst.score).toBeGreaterThanOrEqual(0);
    expect(worst.score).toBeLessThanOrEqual(100);
    expect(worst.band).toBe('pass');
  });
});
