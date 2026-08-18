/**
 * mentorNudgeFormat — PURE struggle detection + the proactive nudge message.
 * This is the "reach out unprompted" half of the mentor: when a student looks
 * stuck, the mentor offers help instead of waiting to be asked. No I/O, so it is
 * unit-testable, and the message is deterministic (no LLM) so the nudge is cheap
 * enough to compute on every card open.
 *
 * The nudge always OFFERS help — it never reveals answers to graded work (that
 * stays the coach's job, guarded by mentorContextFormat).
 */

export interface StruggleInputs {
  turnsOnCard: number;         // prior mentor exchanges on THIS card
  attempts: number;            // assessment attempts on this card
  gradedLock: boolean;         // an Evaluation they have not passed (retryable)
  failedEval: boolean;         // most recent Evaluation explicitly not passed
  lowScorePct: number | null;  // most recent score %, if any
}

export interface Nudge { struggling: boolean; reasons: string[]; message: string | null; }

const TURN_THRESHOLD = 4;     // lots of back-and-forth with the mentor
const ATTEMPT_THRESHOLD = 3;  // retried the assessment several times
const LOW_SCORE = 50;         // scored under half

/** PURE — decide whether the student is stuck, and why (worst signal first). */
export function detectStruggle(s: StruggleInputs): { struggling: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (s.gradedLock || s.failedEval) reasons.push('not_yet_passed');
  if (s.attempts >= ATTEMPT_THRESHOLD) reasons.push('multiple_attempts');
  if (s.lowScorePct != null && s.lowScorePct < LOW_SCORE) reasons.push('low_score');
  if (s.turnsOnCard >= TURN_THRESHOLD) reasons.push('many_questions');
  return { struggling: reasons.length > 0, reasons };
}

/**
 * PURE — the warm, proactive opener the mentor sends unprompted (or null).
 *
 * The screenshot invitation appears on the SCREEN-SHAPED struggles only —
 * `many_questions` (a long back-and-forth is usually someone describing
 * something they can see) and the generic fallback.
 *
 * It is deliberately ABSENT from the three assessment-shaped reasons
 * (`not_yet_passed`, `multiple_attempts`, `low_score`). Inviting a screenshot
 * while a student is stuck on a graded Evaluation invites them to photograph
 * the questions and ask Cory to answer them — precisely what the graded-lock
 * rule in mentorContextFormat exists to prevent. A capability that is useful
 * in one context is not automatically appropriate in all of them.
 *
 * Because reasons are ordered worst-first, a student who is BOTH stuck on a
 * graded evaluation and has asked a lot of questions gets the graded message,
 * without the invitation. That ordering is the safety property, not a detail.
 */
export function nudgeMessage(reasons: string[]): string | null {
  if (!reasons.length) return null;
  if (reasons.includes('not_yet_passed')) return "I noticed this one hasn't clicked into place yet. Want to take it one question at a time together — I won't hand over answers, just point you in the right direction?";
  if (reasons.includes('multiple_attempts')) return "You've given this a few solid tries. Want me to help you spot the pattern in what's tripping you up before your next attempt?";
  if (reasons.includes('low_score')) return "This section looks like it's still settling in. Want me to break the trickiest idea down with a quick example?";
  if (reasons.includes('many_questions')) return "We've been going back and forth on this a while — want me to step back and lay out the next move in one clear step? If it's something on your screen, paste a screenshot straight in and I'll read it.";
  return "Looks like this one's a bit of a grind. Want a hand breaking it into a smaller next step? If something on screen isn't behaving, paste a screenshot and I'll take a look.";
}

/** PURE — the full nudge decision. */
export function buildNudge(s: StruggleInputs): Nudge {
  const { struggling, reasons } = detectStruggle(s);
  return { struggling, reasons, message: nudgeMessage(reasons) };
}

/** PURE — greet the student by their first name, if known. */
export function personalize(message: string | null, firstName: string): string | null {
  if (!message) return null;
  const fn = (firstName || '').trim();
  return fn ? `${fn} — ${message}` : message;
}
