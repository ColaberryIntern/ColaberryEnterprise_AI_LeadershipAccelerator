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

export default SIGNUP_CONSENT_TEXT;
