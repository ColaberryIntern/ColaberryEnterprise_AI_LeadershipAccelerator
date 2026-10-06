import { Lead } from '../models';
import { signParticipantJwt } from './participantService';
import {
  resolveFreeAccount,
  normalizeIdentity,
  freeEnrollmentDefaults,
  type FreeAccountProgramme,
  type FreeAccountDisposition,
  type FreeAccountIdentity,
} from './freeAccountRegistration';

export interface FreeSignupInput {
  full_name: string;
  email: string;
  /**
   * REQUIRED. Which programme this account is joining.
   *
   * 'learner'  — the free AI course. Becomes an Explorer, visible to Explorer Growth.
   * 'standard' — free platform access with no learner programme: an org teammate
   *              invited by their employer, or a prospect account.
   *
   * No default, deliberately. This service has five callers and only ONE of them
   * is a free-AI signup; the other four create accounts for people who never
   * asked to be learners. A default would have silently reclassified whichever
   * caller forgot to pass it, and the first draft of this change defaulted to
   * 'learner' — which would have put every org owner and every invited corporate
   * teammate onto learner rosters and into the nurture the growth engine runs.
   * That is the mistake `orgService` carries a comment about, and it is the one
   * this argument exists to make impossible.
   */
  programme: FreeAccountProgramme;
}

export interface FreeSignupResult {
  jwt: string;
  enrollment: { id: string; full_name: string; email: string; tier: string };
  /**
   * True only when a NEW row was written. `participantController` turns this into
   * a 201 vs 200, so an account that merely gained the learner programme is a
   * 200: nothing was created.
   */
  created: boolean;
  /** 'created' | 'reused' | 'upgraded'. Additive, so callers can tell the three apart. */
  disposition: FreeAccountDisposition;
}

/**
 * @deprecated Use `normalizeIdentity` from `freeAccountRegistration`.
 * Kept because two existing suites import it by this name.
 */
export const normalizeSignupInput = normalizeIdentity;

/**
 * @deprecated Use `freeEnrollmentDefaults(clean, programme)` from
 * `freeAccountRegistration`, which is the one place the two semantic columns are
 * decided. Kept because an existing suite imports it by this name, and delegating
 * rather than duplicating means the old name cannot drift from the new rule.
 */
export function guestEnrollmentDefaults(clean: FreeAccountIdentity) {
  return freeEnrollmentDefaults(clean, 'standard');
}

/**
 * Record a free signup as a Lead, so the student has an acquisition history.
 *
 * WHY THIS EXISTS. This service created an Enrollment and nothing else, so every
 * guest account was a student who had never been a lead. Measured on production
 * 2026-09-05: of 42 guest-tier enrolments, 37 (88%) matched no lead by any rule
 * — not by email, not by phone (none of them carry one), not by name. They were
 * not a matching failure; the acquisition record was never written.
 *
 * The effect on the funnel is visible and worsening. Enrolments traceable to a
 * lead ran at 98% in July, 66% in August and 56% in September, tracking the
 * introduction of this tier on 2026-07-19.
 *
 * The paid path already does this (enrollmentService captures open-house and
 * payment-readiness signups the same way). This mirrors it rather than inventing
 * a second pattern.
 *
 * Best-effort and idempotent, exactly like the paid path: findOrCreate keyed on
 * email means a returning guest never gets a second lead, and the try/catch means
 * a CRM problem can never block someone from signing up. Signup succeeding
 * matters more than the record being perfect.
 *
 * `source: 'free_signup'` is deliberately distinctive so these are identifiable
 * and excludable in campaign segments — a free guest is not a prospect to
 * nurture like an inbound enquiry, and they should not silently join those
 * lists.
 */
async function captureGuestAsLead(clean: FreeAccountIdentity): Promise<void> {
  try {
    await Lead.findOrCreate({
      where: { email: clean.email },
      defaults: {
        name: clean.full_name,
        email: clean.email,
        source: 'free_signup',
        form_type: 'free_signup',
        status: 'engaged',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Sequelize creation attrs
      } as any,
    });
  } catch (error) {
    // Never allowed to affect signup. Logged with a class so the failure is
    // traceable rather than swallowed — a silent catch here would recreate the
    // very gap this function closes.
    console.error('[freeSignup] lead capture failed', {
      error_class: error instanceof Error ? error.constructor.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Create, reuse or upgrade a free account and issue a participant session JWT so
 * the visitor lands straight in the platform preview.
 *
 * The account decision itself lives in `freeAccountRegistration.resolveFreeAccount`
 * — one place, shared with every other free-account path — because this service
 * and `enrollmentService.createExplorerEnrollment` each used to write ONE of the
 * two columns that describe a free account. Explorer Growth finds its population
 * by `enrollment_type = 'explorer'`, so every account created here was a real
 * free AI learner that the growth engine could not see.
 *
 * What stays here is what is specific to this entry point: the acquisition
 * record and Reese's intro. Both are best-effort and neither may block a signup.
 */
export async function createFreeAccount(input: FreeSignupInput): Promise<FreeSignupResult> {
  const clean = normalizeIdentity(input);

  const { enrollment, disposition } = await resolveFreeAccount({
    full_name: input.full_name,
    email: input.email,
    programme: input.programme,
  });

  // Reese's intros. Self-serve signup is the other way a student reaches the
  // portal for the first time, so it gets the same greeting as the magic-link
  // path. Fire-and-forget: signup must not wait on a DM, and maybeSendWelcomes
  // is idempotent, so a returning guest whose account is merely being reused is
  // short-circuited rather than greeted twice.
  void (async () => {
    try {
      const { maybeSendWelcomes } = await import('./reese/reeseWelcomeService');
      await maybeSendWelcomes(enrollment.id);
    } catch { /* never allowed to affect signup */ }
  })();

  await captureGuestAsLead(clean);

  return {
    jwt: signParticipantJwt(enrollment),
    enrollment: {
      id: enrollment.id,
      full_name: enrollment.full_name,
      email: enrollment.email,
      tier: enrollment.tier || 'member',
    },
    created: disposition === 'created',
    disposition,
  };
}
