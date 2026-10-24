import { Lead } from '../models';
import { signParticipantJwt } from './participantService';
import { bridgeExplorerProfileAtRegistration } from './explorerGrowth/explorerProfileAtRegistration';
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

  /**
   * Acquisition evidence, Phase 2 T204. Optional throughout, and absent means
   * **not known** — recorded as null rather than defaulted, because a default
   * here would invent attribution that nobody can later distinguish from a real
   * measurement.
   *
   * Deliberately kept apart from `programme`: these say where the person came
   * from, `programme` says what they joined. **Origin brand is not journey
   * ownership** — someone arriving from a non-learner brand's page can still be a
   * free AI learner, and the two facts live in different columns in different
   * tables so neither can overwrite the other. Origin brand is DERIVED, via
   * `Lead.source_id → LeadSource.brand_id`, so there is no second brand column to
   * disagree with the first.
   */
  /**
   * Field types match `models/Lead.ts` exactly, which the first draft did not: the
   * three ids are **UUID strings**, not numbers, and there is no `referrer` because
   * `Lead` has no such column. The draft disagreed with the model on six of nine
   * fields and — because this capture swallows its errors — would have silently
   * lost the lead row rather than reporting anything. See the schema for the full
   * account.
   */
  acquisition?: {
    source?: string;
    form_type?: string;
    source_id?: string;
    entry_point_id?: string;
    utm_source?: string;
    utm_campaign?: string;
    page_url?: string;
    visitor_id?: string;
  };
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
async function captureGuestAsLead(
  clean: FreeAccountIdentity,
  acquisition: FreeSignupInput['acquisition'],
): Promise<number | null> {
  try {
    const [lead] = await Lead.findOrCreate({
      where: { email: clean.email },
      defaults: {
        name: clean.full_name,
        email: clean.email,
        // The caller's own source wins when supplied, so a signup that arrived
        // through a named entry point keeps that provenance. `free_signup` stays
        // the fallback, and is still what makes these rows identifiable and
        // excludable in campaign segments.
        source: acquisition?.source || 'free_signup',
        form_type: acquisition?.form_type || 'free_signup',
        status: 'engaged',
        // Acquisition evidence. `?? null` rather than `|| null` so that a
        // deliberate 0 or empty string is preserved instead of being swallowed,
        // and so "absent" lands as NULL rather than as an invented default.
        source_id: acquisition?.source_id ?? null,
        entry_point_id: acquisition?.entry_point_id ?? null,
        utm_source: acquisition?.utm_source ?? null,
        utm_campaign: acquisition?.utm_campaign ?? null,
        page_url: acquisition?.page_url ?? null,
        // No `referrer`: `Lead` has no such column, so writing it was a key
        // Sequelize silently dropped. Preserving a referrer needs a column and
        // that belongs to T205, which owns the drift-guard list.
        visitor_id: acquisition?.visitor_id ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Sequelize creation attrs
      } as any,
    });

    /**
     * Push to the CRM so admissions and the callers can actually reach them.
     *
     * THIS CALL WAS MISSING AND IT COST 112 LEADS. Every other capture path syncs
     * - adminLeadController, calendarController, apolloService, csvImportService
     * and enrollmentService all call it - and this one, the path every
     * landing-page CTA points at, never did. Measured on production 2026-10-23:
     * of 112 leads from the first ad campaign, zero had a `ghl_contact_id`.
     *
     * It is the SAME omission `enrollmentService` already documents against
     * itself ("this path captured leads for months without ever calling the
     * sync, which is why 490 open-house leads had no GHL contact"). Twice now,
     * which is why the test added alongside this asserts the call rather than
     * trusting the next reader to notice.
     *
     * Fire-and-forget and routing-aware, matching every other call site:
     * `syncNewLeadToGhl` resolves the destination through `ghlAccountRouting`,
     * so a training lead reaches the school account and never the dialer, and a
     * missing key withholds rather than misfiling.
     */
    const { syncNewLeadToGhl } = await import('./ghlService');
    syncNewLeadToGhl(lead as never).catch((e: unknown) =>
      console.error('[freeSignup] GHL sync error', {
        error_class: e instanceof Error ? e.constructor.name : 'Unknown',
        message: e instanceof Error ? e.message : String(e),
      }));

    // Returned so the welcome's CommunicationLog row can be attached to the person
    // rather than floating with a null lead_id. Null stays null on failure: an
    // invented id would be worse than an honest absence.
    //
    // AFTER the CRM sync above, which is fire-and-forget and must still be kicked
    // off on every capture. Returning first would skip it entirely.
    return (lead as unknown as { id?: number }).id ?? null;
  } catch (error) {
    // Never allowed to affect signup. Logged with a class so the failure is
    // traceable rather than swallowed — a silent catch here would recreate the
    // very gap this function closes.
    console.error('[freeSignup] lead capture failed', {
      error_class: error instanceof Error ? error.constructor.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
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

  const leadId = await captureGuestAsLead(clean, input.acquisition);

  // T205: the Explorer journey profile, AT REGISTRATION rather than overnight.
  //
  // AFTER lead capture, deliberately: the bridge resolves `lead_id` by normalized
  // email, so running it first would store `lead_id: null` and leave the link to be
  // acquired by the nightly repair — the behaviour T205 exists to remove.
  //
  // ONLY for a learner. A `programme: 'standard'` account (an org teammate, a
  // prospect) has not entered the Explorer journey, and giving it a journey profile
  // would make it visible to Explorer Growth — the exact conscription that the
  // required `programme` argument exists to prevent. Keyed on the RESOLVED row, not
  // on the input, so a reused non-learner row is also correctly skipped.
  if (enrollment.enrollment_type === 'explorer') {
    await bridgeExplorerProfileAtRegistration(enrollment.id, 'portal_free_signup');
  }

  // The sign-in link. THIS IS THE BUG THIS CHANGE FIXES.
  //
  // This door never emailed anybody. Measured in production on 2026-10-23: 113
  // paid-ad signups over three days, all with enrollment rows, and zero
  // `communication_logs` rows between them. Its sibling door
  // (`enrollmentService.createExplorerEnrollment`, reached via
  // /api/create-free-account) has always sent this.
  //
  // Nobody was locked out at signup - `signParticipantJwt` below signs them in on
  // the spot - but with no email they had no way back in on a second device and
  // nothing in their inbox recording that the account exists.
  //
  // ONLY ON CREATION. A reused account has already been welcomed, and
  // `sendPortalWelcome` independently refuses to mail an address that has a `sent`
  // welcome row, so a retried signup cannot double-send even if this guard were
  // wrong.
  //
  // AWAITED, unlike Reese's intro above. The response tells the person to check
  // their email, so returning before the send is decided is how you get a promise
  // in the body of a response that nothing kept. It cannot throw and it cannot fail
  // the signup.
  //
  // NOT a marketing send, which is what makes it exempt from the decision recorded
  // on `captureGuestAsLead` above: free guests are deliberately excluded from
  // nurture segments. A login link is transactional, carries no campaign_id, and
  // therefore passes neither the brand gate nor the marketing-consent gate.
  if (disposition === 'created') {
    const { sendPortalWelcome } = await import('./welcome/sendPortalWelcome');
    await sendPortalWelcome({ enrollment, leadId });
  }

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
