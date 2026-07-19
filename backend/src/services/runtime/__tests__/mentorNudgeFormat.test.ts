/**
 * mentorNudgeFormat — unit tests for the pure struggle detector + nudge message.
 * Hermetic (no DB).
 */
import { detectStruggle, nudgeMessage, buildNudge, StruggleInputs } from '../mentorNudgeFormat';

const base: StruggleInputs = { turnsOnCard: 0, attempts: 0, gradedLock: false, failedEval: false, lowScorePct: null };

describe('detectStruggle', () => {
  it('flags an unpassed graded evaluation', () => {
    expect(detectStruggle({ ...base, gradedLock: true }).reasons).toContain('not_yet_passed');
    expect(detectStruggle({ ...base, failedEval: true }).reasons).toContain('not_yet_passed');
  });
  it('flags multiple attempts, low score, and many mentor turns at their thresholds', () => {
    expect(detectStruggle({ ...base, attempts: 3 }).reasons).toContain('multiple_attempts');
    expect(detectStruggle({ ...base, lowScorePct: 40 }).reasons).toContain('low_score');
    expect(detectStruggle({ ...base, turnsOnCard: 4 }).reasons).toContain('many_questions');
  });
  it('is quiet for a student who is doing fine', () => {
    const d = detectStruggle({ ...base, turnsOnCard: 2, attempts: 1, lowScorePct: 90 });
    expect(d.struggling).toBe(false);
    expect(d.reasons).toEqual([]);
  });
  it('orders reasons worst-first (not_yet_passed before the rest)', () => {
    const d = detectStruggle({ ...base, gradedLock: true, attempts: 3, lowScorePct: 30, turnsOnCard: 5 });
    expect(d.reasons[0]).toBe('not_yet_passed');
    expect(d.struggling).toBe(true);
  });
});

describe('nudgeMessage', () => {
  it('returns null when there is nothing to nudge about', () => {
    expect(nudgeMessage([])).toBeNull();
  });
  it('offers help and never promises answers', () => {
    const msg = nudgeMessage(['not_yet_passed'])!;
    expect(msg).toMatch(/won't hand over answers/i);
    expect(msg.toLowerCase()).not.toMatch(/here('| i)s the answer|the correct answer is/);
  });
  it('picks a message per top reason', () => {
    expect(nudgeMessage(['multiple_attempts'])).toMatch(/few solid tries/i);
    expect(nudgeMessage(['low_score'])).toMatch(/break the trickiest idea down/i);
    expect(nudgeMessage(['many_questions'])).toMatch(/back and forth/i);
  });
});

describe('buildNudge', () => {
  it('is null-message + not struggling when fine', () => {
    expect(buildNudge(base)).toEqual({ struggling: false, reasons: [], message: null });
  });
  it('returns a message when struggling', () => {
    const n = buildNudge({ ...base, attempts: 3 });
    expect(n.struggling).toBe(true);
    expect(n.message).toBeTruthy();
  });
});
