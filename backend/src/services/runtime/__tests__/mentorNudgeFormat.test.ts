/**
 * mentorNudgeFormat — unit tests for the pure struggle detector + nudge message.
 * Hermetic (no DB).
 */
import { detectStruggle, nudgeMessage, buildNudge, personalize, StruggleInputs } from '../mentorNudgeFormat';

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

describe('personalize', () => {
  it('greets by first name when known, passes through otherwise', () => {
    expect(personalize('I noticed this one is tricky.', 'Sofia')).toBe('Sofia — I noticed this one is tricky.');
    expect(personalize('hi', '')).toBe('hi');
    expect(personalize(null, 'Sofia')).toBeNull();
  });
});

/**
 * The screenshot invitation is targeted, not global. It belongs on the
 * screen-shaped struggles and must stay OFF the assessment-shaped ones:
 * suggesting a screenshot while a student is stuck on a graded Evaluation
 * invites them to photograph the questions and ask Cory to answer them, which
 * is exactly what the graded-lock rule exists to prevent.
 */
describe('nudgeMessage — the screenshot invitation is targeted', () => {
  const invites = (reasons: string[]) => /screenshot/i.test(nudgeMessage(reasons) || '');

  it('offers a screenshot on a long back-and-forth', () => {
    expect(invites(['many_questions'])).toBe(true);
  });

  it('offers a screenshot on the generic grind fallback', () => {
    expect(invites(['something_unrecognised'])).toBe(true);
  });

  it('NEVER offers a screenshot on an unpassed graded evaluation', () => {
    expect(invites(['not_yet_passed'])).toBe(false);
  });

  it('never offers a screenshot on repeated attempts or a low score', () => {
    expect(invites(['multiple_attempts'])).toBe(false);
    expect(invites(['low_score'])).toBe(false);
  });

  it('stays silent when the graded reason outranks a screen-shaped one', () => {
    // Worst-signal-first means not_yet_passed wins, and its message must not
    // acquire the invitation just because many_questions is also present.
    expect(invites(['not_yet_passed', 'many_questions'])).toBe(false);
  });

  it('reaches a real struggling student through buildNudge, not just the formatter', () => {
    const n = buildNudge({ turnsOnCard: 5, attempts: 0, gradedLock: false, failedEval: false, lowScorePct: null });
    expect(n.struggling).toBe(true);
    expect(n.message).toMatch(/screenshot/i);
  });

  it('survives personalize() so the name and the invitation coexist', () => {
    const n = buildNudge({ turnsOnCard: 5, attempts: 0, gradedLock: false, failedEval: false, lowScorePct: null });
    const m = personalize(n.message, 'Ali') || '';
    expect(m.startsWith('Ali — ')).toBe(true);
    expect(m).toMatch(/screenshot/i);
  });

  it('still returns null when nothing is wrong', () => {
    expect(nudgeMessage([])).toBeNull();
  });
});
