/**
 * The wall between what a reviewer writes and what an applicant reads.
 *
 * "Rejection requires a student-safe reason code and message… Never email
 * internal risk scores, private reviewer notes, or raw model reasoning."
 */
import {
  REASON_CODES,
  REASON_DEFINITIONS,
  buildStudentFacingReason,
  isReasonCode,
  reapplyDate,
  reasonAppliesTo,
  reasonDefinition,
  requiresCustomMessage,
} from '../internshipReasonCodes';

const NOW = Date.UTC(2026, 8, 9); // 2026-09-09

describe('every reason is student-safe', () => {
  it.each(REASON_CODES)('%s has wording an applicant can act on', (code) => {
    const def = reasonDefinition(code);
    if (requiresCustomMessage(code)) {
      // The only code with no wording of its own — a reviewer must supply it.
      expect(def.student_headline).toBe('');
      return;
    }
    expect(def.student_headline.length).toBeGreaterThan(20);
    expect(def.improvement_steps.length).toBeGreaterThan(0);
  });

  it('never describes the applicant\'s character', () => {
    // The failure mode this list exists to prevent: a rejection that reads as a
    // judgement about the person rather than about a requirement.
    const banned = /\b(lazy|flaky|unmotivated|weak candidate|poor attitude|not smart|unqualified as a person)\b/i;
    for (const code of REASON_CODES) {
      const def = reasonDefinition(code);
      expect(def.student_headline).not.toMatch(banned);
      for (const step of def.improvement_steps) expect(step).not.toMatch(banned);
    }
  });

  it('leaks no internal vocabulary into applicant-facing text', () => {
    const internal = /\b(score|rank|risk|flag|model|ai recommendation|factor|blocking)\b/i;
    for (const code of REASON_CODES) {
      const def = reasonDefinition(code);
      expect(def.student_headline).not.toMatch(internal);
      for (const step of def.improvement_steps) expect(step).not.toMatch(internal);
    }
  });
});

describe('"Other" cannot become the default', () => {
  it('is the only code that requires a written message', () => {
    const requiring = REASON_CODES.filter(requiresCustomMessage);
    expect(requiring).toEqual(['other_see_message']);
  });

  it('carries no canned wording, so a forgotten message cannot be emailed as one', () => {
    expect(REASON_DEFINITIONS.other_see_message.student_headline).toBe('');
  });
});

describe('reason scoping', () => {
  it('does not let a rejection reason be used for a waitlist unless it fits both', () => {
    expect(reasonAppliesTo('not_eligible_employment', 'rejected')).toBe(true);
    // Being employed full time is a hard eligibility answer, not a queue position.
    expect(reasonAppliesTo('not_eligible_employment', 'waitlisted')).toBe(false);
  });

  it('allows genuinely dual-purpose reasons in both', () => {
    expect(reasonAppliesTo('capacity_or_timing', 'rejected')).toBe(true);
    expect(reasonAppliesTo('capacity_or_timing', 'waitlisted')).toBe(true);
  });

  it('gives every code at least one decision it applies to', () => {
    for (const code of REASON_CODES) {
      expect(reasonDefinition(code).applies_to.length).toBeGreaterThan(0);
    }
  });
});

describe('reapply rules', () => {
  it('imposes no waiting period where nothing about the applicant needs to change', () => {
    // A full-time job is circumstance, not a deficiency, so there is no penalty.
    expect(reapplyDate('not_eligible_employment', NOW)).toBeNull();
    expect(reapplyDate('tooling_not_ready', NOW)).toBeNull();
  });

  it('imposes one only where the improvement genuinely takes time', () => {
    expect(reapplyDate('experience_gap', NOW)).toBe('2026-12-08');
    expect(reapplyDate('capacity_or_timing', NOW)).toBe('2026-10-09');
  });

  it('is deterministic for a given decision time', () => {
    expect(reapplyDate('experience_gap', NOW)).toBe(reapplyDate('experience_gap', NOW));
  });
});

describe('buildStudentFacingReason', () => {
  it('has no parameter for reviewer notes — they cannot leak through it', () => {
    // The structural guarantee: the function that produces applicant-facing text
    // does not receive the internal field, so no amount of caller error can
    // include it.
    const out = buildStudentFacingReason({ code: 'experience_gap', nowMs: NOW });
    expect(JSON.stringify(out)).not.toMatch(/notes/i);
    expect(buildStudentFacingReason.length).toBe(1);
  });

  it('uses the canned wording by default', () => {
    const out = buildStudentFacingReason({ code: 'experience_gap', nowMs: NOW });
    expect(out.headline).toBe(REASON_DEFINITIONS.experience_gap.student_headline);
    expect(out.steps).toEqual(REASON_DEFINITIONS.experience_gap.improvement_steps);
    expect(out.reapply_after).toBe('2026-12-08');
  });

  it('lets a reviewer\'s own message replace the headline', () => {
    const mine = 'We spoke on the phone — get those two projects shipped and come back to me directly.';
    const out = buildStudentFacingReason({ code: 'experience_gap', studentMessage: mine, nowMs: NOW });
    expect(out.headline).toBe(mine);
    // The steps and reapply rule still come from the code, so a reviewer cannot
    // accidentally drop them by writing a message.
    expect(out.steps.length).toBeGreaterThan(0);
    expect(out.reapply_after).toBe('2026-12-08');
  });

  it('ignores a whitespace-only message rather than emailing a blank reason', () => {
    const out = buildStudentFacingReason({ code: 'experience_gap', studentMessage: '   ', nowMs: NOW });
    expect(out.headline).toBe(REASON_DEFINITIONS.experience_gap.student_headline);
  });
});

describe('isReasonCode', () => {
  it('rejects anything not in the list', () => {
    expect(isReasonCode('experience_gap')).toBe(true);
    expect(isReasonCode('not_a_real_reason')).toBe(false);
    expect(isReasonCode('')).toBe(false);
    expect(isReasonCode(null)).toBe(false);
    expect(isReasonCode('__proto__')).toBe(false);
  });
});
