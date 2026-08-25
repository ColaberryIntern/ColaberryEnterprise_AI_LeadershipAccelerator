import { recordConsent } from '../consentService';

/**
 * Capture marketing consent at signup. One helper, called by every signup path,
 * so consent is recorded the same way everywhere.
 *
 * WHY THIS EXISTS. As of 2026-08-24, all 143 contactable Explorers are emailable
 * only under CAN-SPAM's default rule for US business contacts — legal, and NOT
 * the same as anyone having asked to hear from us. `evaluateConsent` returns
 * `allow`/`can_spam_opt_out` for a person with no record at all, so the absence
 * of consent reads as permission unless something writes a record. Nothing did.
 *
 * WHY SIGNUP AND NOT LOGIN. Consent must be freely given. A checkbox you have to
 * tick to reach your own account is a toll, not a choice, and would not survive
 * scrutiny — nor would it help, since the existing 143 already have accounts.
 * Signup is the moment a person is genuinely choosing.
 *
 * WHAT IT DOES NOT FIX. Nothing here retroactively creates consent for the
 * existing 143. They stay on the default rule until they act on the in-app
 * prompt or an email footer link. The fix is forward-looking, deliberately.
 *
 * SWALLOW-SAFE. `recordConsent` never throws, and a failure to record must never
 * break a signup — the person still gets their account, and their consent state
 * simply stays what it was.
 */

export type ConsentChoice = boolean | 'true' | 'false' | 'on' | undefined | null;

export interface SignupConsentInput {
  email: string;
  /** What the person actually ticked. Absent or false means NO consent recorded. */
  marketingOptIn: ConsentChoice;
  /** Which surface captured it — `enrollment_form`, `open_house`, `free_signup`. */
  source: string;
  /** The exact wording shown, stored as evidence of what they agreed to. */
  consentText?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** A checkbox arrives as a boolean, "true", or "on" depending on the form. */
function isAffirmative(v: ConsentChoice): boolean {
  return v === true || v === 'true' || v === 'on';
}

/**
 * Record an explicit opt-in, if one was given.
 *
 * Returns whether a record was written. **An absent or false checkbox writes
 * NOTHING** — it is not a revocation, and recording a `revoked` row would be
 * worse than silence: it would suppress a person who simply did not tick a box,
 * losing contacts we are currently permitted to reach.
 */
export async function captureSignupConsent(input: SignupConsentInput): Promise<boolean> {
  if (!input?.email || !isAffirmative(input.marketingOptIn)) return false;

  const record = await recordConsent({
    subjectType: 'email',
    subjectId: input.email,
    channel: 'email',
    status: 'granted',
    // express_written is what lifts a learner off the CAN-SPAM default and, per
    // §4 of the consent engine, is one of the two bases that also unlock SMS
    // and voice. Only ever set from a real affirmative act.
    basis: 'express_written',
    source: input.source,
    evidence: {
      // The wording matters: consent is to a specific thing, and "they agreed"
      // is unfalsifiable without knowing what was on screen.
      consent_text: input.consentText ?? null,
      ip_address: input.ipAddress ?? null,
      user_agent: input.userAgent ?? null,
      captured_via: 'signup_checkbox',
    },
  });

  return record !== null;
}

/** The wording to render. Kept here so every surface shows the same thing. */
export const SIGNUP_CONSENT_TEXT =
  'Email me about Colaberry courses, events and AI resources. You can unsubscribe at any time.';
