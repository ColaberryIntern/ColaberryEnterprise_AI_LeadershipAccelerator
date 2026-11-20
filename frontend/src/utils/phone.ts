/**
 * The one phone rule for every public signup and lead form (PH1, Ali 2026-11-19:
 * every public signup/lead form requires a phone number).
 *
 * Counted in DIGITS, matching `requiredPhone` in backend/src/schemas/phone.ts, so a
 * page never accepts something the backend will refuse. Started on the Open House
 * page (Ali, 2026-11-11) and moved here so every form says the same thing.
 *
 * Requiring the NUMBER says nothing about PERMISSION TO RING IT. The call/text box
 * beside every phone field stays optional and unticked.
 */
export const PHONE_MIN_DIGITS = 10;
export const PHONE_MAX_DIGITS = 15;
// The route caps the raw string at 50 characters as well as the digit count. Without
// this a long entry passed here and came back a 400.
export const PHONE_MAX_CHARS = 50;

/** The friendly reason a phone entry would be refused, or null when it is fine. */
export function phoneProblem(raw: string | null | undefined): string | null {
  const value = typeof raw === 'string' ? raw : '';
  const digits = value.replace(/\D/g, '');
  if (digits === '') return 'Please enter your phone number.';
  if (value.trim().length > PHONE_MAX_CHARS) return 'That number is too long. Please enter just the number.';
  if (digits.length < PHONE_MIN_DIGITS) return 'That number looks too short. Please include the area code.';
  if (digits.length > PHONE_MAX_DIGITS) return 'That number has too many digits.';
  return null;
}
