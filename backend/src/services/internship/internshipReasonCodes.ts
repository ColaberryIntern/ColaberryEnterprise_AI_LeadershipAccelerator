/**
 * The decision vocabulary — and the wall between what a reviewer writes and what
 * an applicant reads.
 *
 * ── WHY REASONS ARE A CLOSED LIST ──────────────────────────────────────────
 *
 * The contract: "Rejection requires a student-safe reason code and message.
 * Email the actual actionable reason, any improvement steps, and the reapply date
 * or rule. Never email internal risk scores, private reviewer notes, or raw model
 * reasoning."
 *
 * A free-text rejection reason cannot satisfy that. Whatever the reviewer typed in
 * a hurry is what the applicant reads, and "not a fit" is not actionable while
 * "weak answers, seems flaky" is actively harmful. So every rejection picks a
 * CODE from this file, and the code carries the student-facing wording — written
 * once, deliberately, by someone not under time pressure.
 *
 * The reviewer still has `reviewer_notes` for anything they want to record. Those
 * are internal and never travel to the applicant; `internshipEmails.ts` reads only
 * `student_message` and the fields below.
 *
 * ── EVERY REASON IS ACTIONABLE OR HONESTLY FINAL ───────────────────────────
 *
 * Each code says what would change our answer, or says plainly that nothing
 * would. `reapply_after_days: null` on `not_eligible_employment` is not a
 * loophole — it means "reapply when the situation changes", which is the truth for
 * someone whose only blocker is a full-time job.
 */

export type InternshipReasonCode =
  | 'incomplete_application'
  | 'not_eligible_employment'
  | 'insufficient_availability'
  | 'tooling_not_ready'
  | 'cost_not_accepted'
  | 'experience_gap'
  | 'capacity_or_timing'
  | 'expectations_not_agreed'
  | 'withdrawn_by_applicant'
  // Reviewer escape hatch, and the ONLY code that requires a written message.
  // See `requiresCustomMessage` — without that rule this becomes the code every
  // rushed rejection uses, and the whole list stops meaning anything.
  | 'other_see_message';

export interface ReasonDefinition {
  code: InternshipReasonCode;
  /** What a reviewer picks from. Internal wording. */
  reviewer_label: string;
  /** What the applicant reads. Plain, specific, never about their character. */
  student_headline: string;
  /** What would change the answer. Empty only where nothing would. */
  improvement_steps: readonly string[];
  /**
   * Days until they may reapply. `null` = no waiting period, reapply whenever the
   * blocker is genuinely resolved. `0` would mean "immediately", which is
   * different and is never what we want.
   */
  reapply_after_days: number | null;
  /** Which decisions this code may accompany. */
  applies_to: readonly ('rejected' | 'waitlisted' | 'information_requested')[];
}

export const REASON_DEFINITIONS: Record<InternshipReasonCode, ReasonDefinition> = {
  incomplete_application: {
    code: 'incomplete_application',
    reviewer_label: 'Application incomplete',
    student_headline: 'Your application was missing some answers we need before we can assess it.',
    improvement_steps: [
      'Open your application and answer the remaining questions.',
      'If a phone answer looks wrong, correct it on the review screen before submitting.',
    ],
    reapply_after_days: null,
    applies_to: ['rejected', 'information_requested'],
  },

  not_eligible_employment: {
    code: 'not_eligible_employment',
    reviewer_label: 'Employed full time (eligibility)',
    student_headline:
      'The AI Internship is for people who are not currently working full time, because of the hours it needs. Your application says you are.',
    improvement_steps: [
      'Apply again whenever that changes — there is no waiting period.',
      'In the meantime, the membership on its own gives you the full training at your own pace.',
    ],
    // Not a judgement about them, so no penalty period.
    reapply_after_days: null,
    applies_to: ['rejected'],
  },

  insufficient_availability: {
    code: 'insufficient_availability',
    reviewer_label: 'Cannot meet 25 hours / meetings',
    student_headline:
      'The internship needs at least 25 hours a week plus the scheduled meetings, and your answers said that is not workable right now.',
    improvement_steps: [
      'Apply again when your week has room for it.',
      'If we misread your availability, reply and tell us — we will look again.',
    ],
    reapply_after_days: null,
    applies_to: ['rejected', 'waitlisted'],
  },

  tooling_not_ready: {
    code: 'tooling_not_ready',
    reviewer_label: 'Claude Code / API not ready',
    student_headline:
      'The internship needs your own Claude Code account and your own API key with billing, and your application said those are not in place.',
    improvement_steps: [
      'Set up a Claude Code subscription and an API key with credit available (usually around $30/month in total).',
      'Then apply again — this is the only thing standing in the way.',
    ],
    reapply_after_days: null,
    applies_to: ['rejected', 'information_requested'],
  },

  cost_not_accepted: {
    code: 'cost_not_accepted',
    reviewer_label: 'Membership cost not accepted',
    student_headline:
      'The internship is included with membership, and your application said the cost does not work for you.',
    improvement_steps: [
      'If you already pay Colaberry as a student, tell us — the fee is waived and we will reopen this.',
      'Otherwise, apply again whenever the timing is better.',
    ],
    reapply_after_days: null,
    applies_to: ['rejected'],
  },

  experience_gap: {
    code: 'experience_gap',
    reviewer_label: 'Not ready for client project work yet',
    student_headline:
      'We did not see enough hands-on building yet for the client project work the internship starts you on.',
    improvement_steps: [
      'Work through the training and ship two or three things end to end — a small agent, an API integration, something with a real repo.',
      'Put them in your portfolio, then apply again and point us at them.',
    ],
    // The only code with a real waiting period, and it is there because the
    // improvement genuinely takes time: reapplying next week would waste
    // everyone's.
    reapply_after_days: 90,
    applies_to: ['rejected', 'waitlisted'],
  },

  capacity_or_timing: {
    code: 'capacity_or_timing',
    reviewer_label: 'Timing / project capacity',
    student_headline:
      'This is about our timing, not your application — we do not have the right project to put you on at the moment.',
    improvement_steps: [
      'Nothing to change on your side.',
      'Tell us if you would like to be considered as soon as something opens up.',
    ],
    reapply_after_days: 30,
    applies_to: ['rejected', 'waitlisted'],
  },

  expectations_not_agreed: {
    code: 'expectations_not_agreed',
    reviewer_label: 'Did not agree to expectations',
    student_headline:
      'Your application did not accept some of the time, attendance, communication or conduct expectations the internship runs on.',
    improvement_steps: [
      'Read the expectations again on the internship page.',
      'If you disagreed by accident, reply and say so — we will reopen your application.',
    ],
    reapply_after_days: null,
    applies_to: ['rejected', 'information_requested'],
  },

  withdrawn_by_applicant: {
    code: 'withdrawn_by_applicant',
    reviewer_label: 'Withdrawn by applicant',
    student_headline: 'You asked to withdraw your application, so we have closed it.',
    improvement_steps: ['Apply again whenever you are ready.'],
    reapply_after_days: null,
    applies_to: ['rejected'],
  },

  other_see_message: {
    code: 'other_see_message',
    reviewer_label: 'Other — I will write the reason',
    // Intentionally empty: the reviewer's written message IS the headline here,
    // and a placeholder would end up emailed verbatim if anyone forgot.
    student_headline: '',
    improvement_steps: [],
    reapply_after_days: null,
    applies_to: ['rejected', 'waitlisted', 'information_requested'],
  },
};

export const REASON_CODES = Object.keys(REASON_DEFINITIONS) as InternshipReasonCode[];

export function isReasonCode(value: unknown): value is InternshipReasonCode {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(REASON_DEFINITIONS, value);
}

export function reasonDefinition(code: InternshipReasonCode): ReasonDefinition {
  return REASON_DEFINITIONS[code];
}

/**
 * `other_see_message` is the only code that demands a written message, because it
 * is the only one with no wording of its own.
 *
 * This is what stops it becoming the default. Without the rule, a reviewer in a
 * hurry picks "Other", writes nothing, and the applicant receives an email with an
 * empty reason — worse than a wrong code, because it reads as contempt.
 */
export function requiresCustomMessage(code: InternshipReasonCode): boolean {
  return code === 'other_see_message';
}

/** May this code be used with this decision? */
export function reasonAppliesTo(
  code: InternshipReasonCode,
  decision: 'rejected' | 'waitlisted' | 'information_requested',
): boolean {
  return REASON_DEFINITIONS[code].applies_to.includes(decision);
}

/**
 * The reapply date for a decision made now, or null when there is no waiting
 * period.
 *
 * `nowMs` is injected rather than read so the date on a decision is reproducible
 * in a test and in an audit.
 */
export function reapplyDate(code: InternshipReasonCode, nowMs: number): string | null {
  const days = REASON_DEFINITIONS[code].reapply_after_days;
  if (days === null) return null;
  const d = new Date(nowMs + days * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

/**
 * Assemble exactly what the applicant will be told.
 *
 * The ONLY function that produces applicant-facing decision text. Everything it
 * returns is either from this file or from `student_message`, which a reviewer
 * writes knowing it is read by the applicant. `reviewer_notes` is not a parameter
 * here, and that is the point — it cannot leak through a function that never
 * receives it.
 */
export function buildStudentFacingReason(params: {
  code: InternshipReasonCode;
  /** The reviewer's own words TO THE APPLICANT. Never their private notes. */
  studentMessage?: string | null;
  nowMs: number;
}): {
  headline: string;
  steps: readonly string[];
  reapply_after: string | null;
} {
  const def = reasonDefinition(params.code);
  const custom = (params.studentMessage || '').trim();

  return {
    // A reviewer's message replaces the canned headline when supplied — they know
    // this applicant, the list does not.
    headline: custom || def.student_headline,
    steps: def.improvement_steps,
    reapply_after: reapplyDate(params.code, params.nowMs),
  };
}
