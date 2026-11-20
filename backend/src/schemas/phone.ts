import { z } from 'zod';

/**
 * The one phone rule for every public signup and lead form (PH1, Ali 2026-11-19:
 * every public signup/lead form requires a phone number).
 *
 * This started life on the Open House route (Ali, 2026-11-11: "We need to collect
 * phone number mandatory in this process") and was moved here so every route
 * refuses the same inputs the same way, and so the frontend's `phoneProblem` has one
 * backend rule to mirror instead of several.
 *
 * Counted in DIGITS, not characters, because "(512) 555-0142" is 14 characters and
 * "5125550142" is 10 and both are the same number. The ceiling is E.164's 15 digits.
 *
 * COLLECTING A NUMBER IS NOT CONSENT TO RING IT. Requiring the field changes nothing
 * about permission: no box is pre-ticked, and a consent record is written only when
 * the visitor ticks the separate, optional `phone_consent` box.
 */
export const PHONE_MIN_DIGITS = 10;
export const PHONE_MAX_DIGITS = 15;
export const PHONE_MAX_CHARS = 50;
export const phoneDigits = (raw: string): string => raw.replace(/\D/g, '');

/** True when a string carries a number we would accept on a required field. */
export function isAcceptablePhone(raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > PHONE_MAX_CHARS) return false;
  const n = phoneDigits(trimmed).length;
  return n >= PHONE_MIN_DIGITS && n <= PHONE_MAX_DIGITS;
}

// NOTE ON THE OPTIONS OBJECT. This deliberately passes none. zod 4 removed
// 'required_error' (it is 'error' now), and an unknown key here is a typecheck
// failure, not a runtime nicety. An ABSENT phone therefore gets zod's own
// "expected string, received undefined", which is only ever a backstop: every form
// validates first and gives the friendly wording.
export const requiredPhone = z
  .string()
  .trim()
  .min(1, 'phone is required')
  .max(PHONE_MAX_CHARS)
  .refine((v) => phoneDigits(v).length >= PHONE_MIN_DIGITS, {
    message: `a phone number with at least ${PHONE_MIN_DIGITS} digits is required`,
  })
  .refine((v) => phoneDigits(v).length <= PHONE_MAX_DIGITS, {
    message: 'that phone number has too many digits',
  });
