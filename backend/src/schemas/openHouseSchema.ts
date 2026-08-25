import { z } from 'zod';

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
  // true / "true" / "on" depending on the form, and an unrecognised string must
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
