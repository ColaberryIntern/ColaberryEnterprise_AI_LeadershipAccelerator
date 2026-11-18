/**
 * The rule that decides whether a playhead jump was watching or scrubbing.
 *
 * Before 2026-11-18 the test was a constant: advance less than 2.5s and it
 * counted, more and it was discarded. That punished sparse sampling rather
 * than dishonesty, so a student who finished a 59:48 video in a background tab
 * was credited 55% and locked out of his points. The rule is now the clock.
 */
import { creditForTick, MAX_PLAYBACK_RATE, TICK_GRACE_S } from '../watchCredit';

describe('creditForTick', () => {
  it('credits ordinary playback in full', () => {
    expect(creditForTick(0.25, 0.25)).toBeCloseTo(0.25);
    expect(creditForTick(1, 1)).toBeCloseTo(1);
  });

  it('REGRESSION: credits a throttled gap that the old 2.5s constant threw away', () => {
    expect(creditForTick(60, 60)).toBeCloseTo(60);     // backgrounded tab, sampled once a minute
    expect(creditForTick(5, 5)).toBeCloseTo(5);        // buffering stall
  });

  it('gives a scrub essentially nothing, because no real time passed', () => {
    expect(creditForTick(2400, 0.05)).toBeLessThan(1);
    expect(creditForTick(3588, 0)).toBe(TICK_GRACE_S);
  });

  it('does not short-change faster playback speeds', () => {
    expect(creditForTick(2, 1)).toBeCloseTo(2);        // 2x
    expect(creditForTick(1.5, 1)).toBeCloseTo(1.5);    // 1.5x
  });

  it('never credits more than the clock allows', () => {
    expect(creditForTick(600, 10)).toBe(10 * MAX_PLAYBACK_RATE + TICK_GRACE_S);
  });

  it('ignores a rewind, a standstill, and junk', () => {
    expect(creditForTick(-30, 1)).toBe(0);
    expect(creditForTick(0, 1)).toBe(0);
    expect(creditForTick(NaN, 1)).toBe(0);
    expect(creditForTick(5, NaN)).toBe(TICK_GRACE_S);
  });
});
