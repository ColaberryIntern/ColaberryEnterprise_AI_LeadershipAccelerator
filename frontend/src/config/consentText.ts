/**
 * The marketing-consent wording shown at signup.
 *
 * ── WHY THIS IS A SHARED CONSTANT AND NOT INLINE COPY ───────────────────────
 *
 * The backend stores this string on the consent record as evidence of WHAT THE
 * PERSON WAS SHOWN (`captureSignupConsent` takes a `consentText` and persists it).
 * If the form displays one sentence and the record attests to another, the record
 * is worse than useless: it is a confident claim about an agreement that never
 * happened in those words.
 *
 * So this value is pinned to the backend's `SIGNUP_CONSENT_TEXT` by a test that
 * reads both and requires them to be identical. Change one and the test fails
 * until the other matches. That is the whole point of the indirection; it is not
 * tidiness.
 *
 * Keep it a plain string with no interpolation. Evidence of consent has to be
 * reproducible years later without re-running the app to find out what a template
 * rendered.
 */
export const SIGNUP_CONSENT_TEXT =
  'Email me about Colaberry courses, events and AI resources. You can unsubscribe at any time.';

/**
 * Permission to call or text, shown beside every phone field (PH1, Ali 2026-11-19).
 *
 * Same pinning rule as above, for the same reason: the backend stores this exact string as
 * evidence of what the person was shown. It is a SEPARATE permission from the email wording and so
 * must be a separate string - a record attesting "Email me about Colaberry courses" cannot stand
 * as evidence that somebody agreed to a phone call.
 *
 * The phone NUMBER is required on every public form; this permission is NOT. The box is always
 * shown, never pre-ticked, never required, and it names AI-assisted or automated calls because
 * that may be what places the call.
 *
 * Double-quoted because the wording contains an apostrophe; the parity test accepts either quote.
 */
export const PHONE_CONSENT_TEXT =
  "Colaberry may call or text me at this number, including with AI-assisted or automated calls, about my program and events. Consent isn't required to sign up. Message and data rates may apply. Reply STOP or ask us to stop at any time.";

/**
 * Permission to be named in the recent-signup notices on a landing page.
 *
 * Same pinning rule as the two above, and for a sharper reason: this one is not a contact
 * permission at all. There is no `consent_records` row behind it - `ConsentChannel` is
 * voice | sms | email and all three authorise a SEND, while this authorises a DISPLAY - so the
 * only record of what the person agreed to is `leads.social_proof_opt_in`, a bare boolean. A
 * boolean carries no wording with it, which makes the sentence shown on screen the whole of the
 * evidence. If this drifts from the backend constant, nothing anywhere records what was actually
 * on the page.
 */
export const SOCIAL_PROOF_CONSENT_TEXT =
  'Show my first name, last initial and city when Colaberry mentions recent signups.';

export default SIGNUP_CONSENT_TEXT;
