import { recordConsent, normalizeEmail, normalizePhone } from '../consentService';
import type { ConsentChannel, ConsentSubjectType } from '../../models/ConsentRecord';

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

/**
 * Whatever the caller has. Deliberately wide: a checkbox reaches a handler as a
 * boolean, "true" or "on" depending on the form, and a value arriving over the
 * wire from another service could be anything at all. `isAffirmative` below is
 * the single narrow gate - widening what may be PASSED does not widen what
 * COUNTS, and it keeps callers from having to cast (or worse, pre-filter, and
 * get the filter subtly wrong).
 */
export type ConsentChoice = boolean | string | undefined | null;

export interface SignupConsentInput {
  email?: string;
  /**
   * Required when `channel` is 'sms' or 'voice' — those are keyed on the PHONE,
   * not the email. See resolveConsentSubject below for why that is not optional.
   */
  phone?: string | null;
  /** Which permission this is. Defaults to email so existing callers are unchanged. */
  channel?: ConsentChannel;
  /** What the person actually ticked. Absent or false means NO consent recorded. */
  marketingOptIn: ConsentChoice;
  /** Which surface captured it — `enrollment_form`, `open_house`, `free_signup`. */
  source: string;
  /** The exact wording shown, stored as evidence of what they agreed to. */
  consentText?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  /**
   * Optional lapse. Use it when the affirmative act authorises something bounded
   * ("call me about this") rather than an open-ended standing permission.
   * `getCurrentConsent` honours it: `expires_at IS NULL OR expires_at > now()`.
   */
  expiresAt?: Date | null;
}

/**
 * Which (subject_type, subject_id) a consent row must be keyed on for a given
 * channel.
 *
 * THIS MUST MIRROR `subjectCandidates` IN consentService.ts. That function decides
 * what a SEND looks consent up by, and it keys email sends on the email and
 * voice/SMS sends on the PHONE:
 *
 *     if (channel === 'email') keys.push({ subject_type: 'email', ... })
 *     else                     keys.push({ subject_type: 'phone', ... })
 *
 * Write a voice grant keyed on the email and it is invisible to the gate: the row
 * exists, reads `channel='voice'` and `basis='express_written'`, passes any
 * table-level assertion anyone would think to write, and changes no behaviour.
 * That is the same failure class as consent being absent in the first place - a
 * thing that looks like a record and does nothing - so the two must stay in sync.
 *
 * Returns null when the identifier this channel keys on is missing. Recording
 * NOTHING is correct there: a phone grant with no phone cannot ever be matched,
 * and writing it under the email key would be worse than not writing it.
 */
export function resolveConsentSubject(
  channel: ConsentChannel,
  ids: { email?: string | null; phone?: string | null },
): { subjectType: ConsentSubjectType; subjectId: string } | null {
  if (channel === 'email') {
    const e = normalizeEmail(ids.email);
    return e ? { subjectType: 'email', subjectId: e } : null;
  }
  const p = normalizePhone(ids.phone);
  return p ? { subjectType: 'phone', subjectId: p } : null;
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
  if (!input || !isAffirmative(input.marketingOptIn)) return false;

  const channel: ConsentChannel = input.channel ?? 'email';
  // No usable identifier for this channel -> record nothing. Never fall back to
  // the email key for a phone channel; see resolveConsentSubject.
  const subject = resolveConsentSubject(channel, { email: input.email, phone: input.phone });
  if (!subject) return false;

  const record = await recordConsent({
    subjectType: subject.subjectType,
    subjectId: subject.subjectId,
    channel,
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
    expiresAt: input.expiresAt ?? null,
  });

  return record !== null;
}

/**
 * What a callback request records as evidence.
 *
 * Deliberately a description of an ACTION the person took, not a permission they
 * were asked to grant. Nothing on screen asks them to accept marketing calls, so
 * nothing here may claim they did — which is also why this text needs none of the
 * TCPA disclosures a marketing SMS/voice opt-in would (autodialed/prerecorded,
 * not a condition of purchase, frequency, message-and-data rates).
 */
export const CALLBACK_CONSENT_TEXT =
  'I asked Colaberry to call me at the number I provided about AI training.';

/**
 * How long a callback request authorises calling that number.
 *
 * Long enough to cover following up on the request, short enough that it cannot
 * become a standing telemarketing licence. An unbounded grant here would be the
 * original consent bug inverted: over-permission manufactured by the presence of
 * a record rather than by its absence.
 */
export const CALLBACK_CONSENT_TTL_DAYS = 30;

/** The wording to render. Kept here so every surface shows the same thing. */
export const SIGNUP_CONSENT_TEXT =
  'Email me about Colaberry courses, events and AI resources. You can unsubscribe at any time.';
