/**
 * The gap line is the only sentence that tells a student why a band is locked.
 *
 * The server states a gap as the gate key it was checked against
 * ("attendance: 0 < 1"). One learner shipped twenty-nine verified stories, sat
 * at rank 0 because she had never attended a live class, and read a line naming
 * a database column instead of the one thing she had to do. These tests hold the
 * translation, and hold the two shapes that previously fell through it raw.
 */
import { formatGap } from '../PointsDrilldown';

describe('a gate key becomes something a student can act on', () => {
  it('names the action, not the column', () => {
    expect(formatGap('attendance: 0 < 1')).toBe('Live classes attended — 0 of 1');
    expect(formatGap('artifacts: 0 < 2')).toBe('Artifacts published — 0 of 2');
    expect(formatGap('github: 1 < 2')).toBe('GitHub commits or pull requests — 1 of 2');
  });

  it('keeps the counts intact, because the distance is the useful part', () => {
    // "you need 2" is not the same information as "you have 1 of 2".
    expect(formatGap('evidence: 29 < 3')).toContain('29 of 3');
    expect(formatGap('implementation: 8 < 1')).toContain('8 of 1');
  });
});

describe('the shapes that used to render raw', () => {
  it('handles a competency gap, whose numbers are decimals not integers', () => {
    // `competency ${domain}: ${have.toFixed(2)} < ${min}` — the old integer-only
    // pattern never matched this, so a student saw the raw string.
    expect(formatGap('competency prompt_engineering: 0.35 < 0.4'))
      .toBe('prompt engineering confidence — 0.35 of 0.4');
  });

  it('handles the AI approval gap, which carries no numbers at all', () => {
    expect(formatGap('ai_approval: pending')).toBe('AI review of your work — pending');
  });
});

describe('it never makes a line worse than the one it replaced', () => {
  it('passes an unrecognised gap through untouched rather than mangling it', () => {
    // A new gate key added server-side must still show SOMETHING truthful.
    expect(formatGap('some_future_gate: 3 < 9')).toBe('some_future_gate — 3 of 9');
    expect(formatGap('an entirely unstructured sentence')).toBe('an entirely unstructured sentence');
  });

  it('does not invent a number when the gap has none', () => {
    expect(formatGap('at max level')).toBe('at max level');
  });
});
