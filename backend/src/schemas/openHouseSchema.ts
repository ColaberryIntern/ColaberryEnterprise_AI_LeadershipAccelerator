import { z } from 'zod';

/**
 * A phone number we will actually be able to call.
 *
 * Counted in DIGITS, not characters, because "(512) 555-0142" is 14 characters and
 * "5125550142" is 10 and both are the same number. The ceiling is E.164's 15 digits.
 */
export const PHONE_MIN_DIGITS = 10;
export const PHONE_MAX_DIGITS = 15;
export const phoneDigits = (raw: string): string => raw.replace(/\D/g, '');

/**
 * REQUIRED on our own landing page (Ali, 2026-11-11: "We need to collect phone number
 * mandatory in this process").
 *
 * It is required on THIS route only. `openHouseRegisterSchema` below keeps phone
 * optional because that route is called by training.colaberry.com, a separate
 * deployment in a separate repo; making it mandatory here would start 400ing their
 * signups the moment this deploys, with no coordinated release.
 *
 * COLLECTING A NUMBER IS NOT CONSENT TO RING IT. This makes the field mandatory and
 * nothing more - no box is pre-ticked and no consent record is written from it. The
 * marketing opt-in below remains separate, freely given, and about email.
 */
// NOTE ON THE OPTIONS OBJECT. This deliberately passes none. zod 4 removed
// 'required_error' (it is 'error' now), and an unknown key here is a typecheck
// failure, not a runtime nicety - which is exactly how the first push of this change
// broke the build. An ABSENT phone therefore gets zod's own
// "expected string, received undefined", which is only ever a backstop: the form
// validates first and gives the friendly wording.
const requiredPhone = z
  .string()
  .trim()
  .min(1, 'phone is required')
  .max(50)
  .refine((v) => phoneDigits(v).length >= PHONE_MIN_DIGITS, {
    message: `a phone number with at least ${PHONE_MIN_DIGITS} digits is required`,
  })
  .refine((v) => phoneDigits(v).length <= PHONE_MAX_DIGITS, {
    message: 'that phone number has too many digits',
  });

// Contract for POST /api/v1/open-house/register (called by training.colaberry.com).
export const openHouseRegisterSchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(200),
  email: z.string().trim().email('a valid email is required').max(255),
  phone: z.string().trim().max(50).optional(),
  order_id: z.string().trim().max(64).optional(),
  utm_source: z.string().trim().max(255).optional(),
  utm_campaign: z.string().trim().max(255).optional(),
  page_url: z.string().trim().max(500).optional(),

  // Marketing consent captured at signup on training.colaberry.com. Registering
  // for free training is not the same as asking for marketing email, so it is a
  // separate, freely-given choice. A tick becomes an `express_written`
  // ConsentRecord; an absent or false value records NOTHING (it is not a
  // revocation).
  //
  // Deliberately permissive (boolean OR short string): a checkbox reaches us as
  // true / "true" / "on" depending on the form, and an unrecognized string must
  // fall through as "not affirmative" rather than 400 the whole registration.
  // Consent capture must never be able to break a signup.
  marketing_opt_in: z.union([z.boolean(), z.string().max(10)]).optional(),
  // The exact wording shown on screen. "They consented" is unfalsifiable without it.
  marketing_consent_text: z.string().trim().max(500).optional(),

  // End-user IP + user agent, forwarded by the caller. This route is
  // service-to-service, so `req.ip` and `req.get('user-agent')` describe the
  // training site's server, not the person who ticked the box.
  ip_address: z.string().trim().max(64).optional(),
  user_agent: z.string().trim().max(500).optional(),
});

export type OpenHouseRegisterInput = z.infer<typeof openHouseRegisterSchema>;

/**
 * Contract for POST /api/v1/open-house/signup — the PUBLIC door (OH-2), called
 * by a stranger's browser from our own landing-page funnel.
 *
 * WHY THIS IS NOT THE SCHEMA ABOVE, with four fields removed rather than reused.
 * `ip_address`, `user_agent` and `order_id` are provenance: the service-authed
 * route accepts them because the real end user is one hop away behind
 * training.colaberry.com's server, so `req.ip` there describes a datacenter.
 * On a public route the request IS the end user, so those values are read off
 * the request and a body that tries to supply them is rejected by `.strict()` —
 * otherwise anyone could post a consent record stamped with someone else's IP,
 * and the one artifact that makes consent falsifiable would be forgeable.
 *
 * `marketing_consent_text` is likewise not accepted here: on our own page we
 * know what wording we displayed, and letting the caller declare it would let a
 * forged record claim wording that was never shown.
 */
export const openHousePublicSignupSchema = z
  .object({
    name: z.string().trim().min(1, 'name is required').max(200),
    email: z.string().trim().email('a valid email is required').max(255),
    phone: requiredPhone,
    utm_source: z.string().trim().max(255).optional(),
    utm_campaign: z.string().trim().max(255).optional(),
    page_url: z.string().trim().max(500).optional(),
    // Same permissive shape and the same meaning as above: a tick records
    // consent, an absence records nothing at all.
    marketing_opt_in: z.union([z.boolean(), z.string().max(10)]).optional(),
    // PERMISSION TO CALL OR TEXT, which is a different grant from the email opt-in
    // above and is keyed on the NUMBER rather than the address. This schema is
    // `.strict()`, so the key has to be declared here or a form that sends it gets a
    // 400 for the whole signup - and the tick would be lost between the box and the
    // table with nothing logged.
    phone_consent: z.union([z.boolean(), z.string().max(10)]).optional(),
  })
  .strict();

export type OpenHousePublicSignupInput = z.infer<typeof openHousePublicSignupSchema>;
