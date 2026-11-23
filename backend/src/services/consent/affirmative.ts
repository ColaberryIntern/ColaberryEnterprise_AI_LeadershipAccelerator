/**
 * What counts as a tick. One rule, in a module of its own.
 *
 * ── WHY THIS IS NOT INSIDE captureSignupConsent.ts ──────────────────────────────
 *
 * It lived there, and exporting it from there broke 22 tests in one file the moment a
 * second caller imported it. `openHousePublicSignup.test.ts` replaces that whole module
 * with `jest.mock(..., () => ({ captureSignupConsent, SIGNUP_CONSENT_TEXT }))`, so any
 * export the factory does not list is `undefined` at run time. The controller called it
 * and threw before it could answer the request - every test in the file failed with a
 * symptom (status never set) that pointed nowhere near the cause.
 *
 * That is a property of wholesale module mocks, not a one-off: a heavily-mocked module is
 * a bad home for a pure helper that other code wants. A test mocks
 * `captureSignupConsent` because it does not want a consent RECORD written; it has no
 * opinion about what the string "on" means. Those are different concerns and they now
 * live in different files.
 *
 * Pure, dependency-free, and never mocked anywhere - so importing it cannot do this again.
 */

/**
 * Whatever the caller has. Deliberately wide: a checkbox reaches a handler as a boolean,
 * "true" or "on" depending on the form, and a value arriving over the wire from another
 * service could be anything at all. `isAffirmative` is the single narrow gate - widening
 * what may be PASSED does not widen what COUNTS, and it keeps callers from having to cast
 * (or worse, pre-filter, and get the filter subtly wrong).
 */
export type ConsentChoice = boolean | string | undefined | null;

/**
 * A checkbox arrives as a boolean, "true", or "on" depending on the form.
 *
 * Everything else is NOT a grant - including "false", "off", "0", an empty string and
 * absence. Silence is not consent, and a value nobody recognises is silence.
 */
export function isAffirmative(v: ConsentChoice): boolean {
  return v === true || v === 'true' || v === 'on';
}
