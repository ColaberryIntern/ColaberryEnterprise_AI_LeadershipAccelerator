import { onTimeProbability, BLOCKED_DAY_COST } from '../govOnTimeProbability';

const P = (workingDaysToShipBy: number | null, remainingCriticalPathDays: number | null, humanBlockedCount = 0) =>
  onTimeProbability({ workingDaysToShipBy, remainingCriticalPathDays, humanBlockedCount });

describe('onTimeProbability (deterministic, reproducible from its inputs)', () => {
  it('returns "-" (null) with a reason when a required input is missing', () => {
    expect(P(null, 10).probability).toBeNull();
    expect(P(null, 10).reason).toBe('no submission deadline');
    expect(P(20, null).probability).toBeNull();
    expect(P(20, null).reason).toBe('no build plan yet');
  });

  it('is 95 when there is no remaining critical-path work', () => {
    expect(P(20, 0).probability).toBe(95);
    expect(P(1, 0).probability).toBe(95);
  });

  it('maps the slack ratio to the documented bands', () => {
    expect(P(30, 15).probability).toBe(95); // ratio 2.0
    expect(P(18, 15).probability).toBe(85); // ratio 1.2
    expect(P(15, 15).probability).toBe(70); // ratio 1.0
    expect(P(13, 15).probability).toBe(50); // ratio ~0.87
    expect(P(11, 15).probability).toBe(30); // ratio ~0.73
    expect(P(8, 15).probability).toBe(15);  // ratio ~0.53
    expect(P(5, 15).probability).toBe(5);   // ratio ~0.33
  });

  it('never returns 0 or 100 (there is always uncertainty)', () => {
    expect(P(1000, 1).probability).toBe(95);
    expect(P(1, 1000).probability).toBe(5);
  });

  it('human-blocked items add latency and lower the probability', () => {
    expect(BLOCKED_DAY_COST).toBe(2);
    expect(P(20, 10, 0).probability).toBe(95);              // ratio 2.0
    const withBlocked = P(20, 10, 3);                        // effectiveNeeded = 10 + 3*2 = 16, ratio 1.25
    expect(withBlocked.inputs.effectiveNeeded).toBe(16);
    expect(withBlocked.probability).toBe(85);
    expect(P(14, 10, 3).probability).toBe(50);               // effectiveNeeded 16, ratio 0.875
    expect(P(14, 10, 3).reason).toContain('3 item(s) waiting on your answer');
  });

  it('exposes every input used, so the band is reproducible by hand (the tooltip)', () => {
    const r = P(13, 15, 0);
    expect(r.inputs).toMatchObject({ workingDaysToShipBy: 13, remainingCriticalPathDays: 15, humanBlockedCount: 0, blockedDayCost: 2, effectiveNeeded: 15, slackRatio: 0.87 });
    expect(r.reason).toContain('13 working days to ship-by vs 15');
  });

  it('is a pure function - identical inputs give identical output', () => {
    expect(P(13, 15, 2)).toEqual(P(13, 15, 2));
  });
});
