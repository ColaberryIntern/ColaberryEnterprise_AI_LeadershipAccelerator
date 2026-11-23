import { recordConsent, normalizeEmail, normalizePhone } from '../consentService';
import type { ConsentChannel, ConsentSubjectType } from '../../models/ConsentRecord';
import { isAffirmative, type ConsentChoice } from './affirmative';

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
 * Re-exported, not redeclared: `ConsentChoice` and `isAffirmative` now live in
 * ./affirmative, which explains at length why a pure helper does not belong in a module
 * that tests replace wholesale. Kept exported HERE because capturePhoneConsent.ts and
 * portalPhoneGate.ts already import the type from this path.
 *
 * `isAffirmative` is deliberately NOT re-exported. A caller that wants it should import
 * ./affirmative directly, so nobody reintroduces the mock trap by reaching for it here.
 */
export type { ConsentChoice };

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
   * The request that produced this consent.
   *
   * Without it NO consent row can be traced back to what created it, which for a
   * record whose entire purpose is auditability is a defect in itself. It is also
   * what makes an anomaly investigable: an orphaned grant on 2026-08-25 - consent
   * written, no matching lead - had nowhere to start precisely because this field
   * did not exist.
   *
   * Optional because not every call site has one. A site WITHOUT a real request id
   * must pass nothing rather than minting a fresh UUID here: an id that correlates
   * with no log line looks like a trace and traces nothing, which is worse than an
   * honest null.
   */
  correlationId?: string | null;
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
      correlation_id: input.correlationId ?? null,
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

/**
 * Permission to call or text, asked for at signup.
 *
 * SEPARATE FROM SIGNUP_CONSENT_TEXT, which is the entire point. The email wording says "Email me",
 * and that cannot be read as agreement to a phone call. Until now the landing page collected no
 * phone at all - 270 signups in thirty days, zero numbers - so there was nothing to be
 * over-permissive with. The moment a number is collected the distinction becomes load bearing.
 *
 * WEAKER THAN CALLBACK_CONSENT_TEXT ON PURPOSE. That one records an affirmative request ("I asked
 * Colaberry to call me") and carries a 30 day lapse. This is a standing permission granted before
 * the person has any question to ask, so it says what it is: permission to reach out, not a
 * request for contact. A surface that needs the stronger grant should ask at the moment of need
 * and record CALLBACK_CONSENT_TEXT instead.
 *
 * It names calls AND texts, because one checkbox cannot honestly authorise only whichever channel
 * turns out to be convenient later.
 *
 * PH1 (Ali, 2026-11-19): every public form now REQUIRES a phone number, so this box is always
 * shown beside the field - unticked and optional. The wording therefore names AI-assisted or
 * automated calls (an AI voice agent may be what places the call) and says outright that consent
 * is not a condition of signing up, so a required number can never be read as a granted
 * permission.
 */
export const PHONE_CONSENT_TEXT =
  "Colaberry may call or text me at this number, including with AI-assisted or automated calls, about my program and events. Consent isn't required to sign up. Message and data rates may apply. Reply STOP or ask us to stop at any time.";

/**
 * Permission to be NAMED in the recent-signup notices a landing page shows.
 *
 * NOT A CONTACT PERMISSION, which is why there is no `consent_records` row behind it.
 * `ConsentChannel` is voice | sms | email, and every one of those authorises a SEND. This
 * authorises a DISPLAY, so it lives on `leads.social_proof_opt_in` instead. Putting it in the
 * consent table would mean inventing a fourth channel that the send gate would then have to learn
 * to ignore, and a row that looks like permission to contact somebody is the one shape of mistake
 * that table exists to prevent.
 *
 * The wording is pinned HERE, beside the other two, for the reason the others are: one sentence
 * per permission, shown and stored identically, so the column means one specific thing years from
 * now. `consentTextParity.test.ts` holds the frontend copy to this string.
 *
 * IT SAYS WHAT ACTUALLY APPEARS. "Social proof" means nothing to the person ticking the box, and
 * the bar renders a real person: first name, last initial, city. Anything vaguer would be consent
 * to something the reader did not picture.
 *
 * NOT A CONDITION OF BEING COUNTED. Without the tick the same signup still appears, as
 * "Someone in <city>", so leaving it unticked costs the person nothing.
 */
export const SOCIAL_PROOF_CONSENT_TEXT =
  'Show my first name, last initial and city when Colaberry mentions recent signups.';
