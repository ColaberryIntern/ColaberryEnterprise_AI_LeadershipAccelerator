import { z } from 'zod';

export const bookCallSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
  company: z.string().optional().default(''),
  phone: z.string().optional().default(''),
  /**
   * Permission to call or text the number above.
   *
   * SEPARATE FROM `phone`, which is the whole point. This form has collected a
   * number on fifteen landing pages since it shipped and asked for no permission
   * to use it, so every one of those numbers sits in `strategy_calls.phone` and
   * `leads.phone` with no `consent_records` row behind it — which the consent gate
   * reads as `no_express_consent`.
   *
   * OPTIONAL, and absent means no consent recorded rather than a revocation. A
   * booking must never fail because somebody left the tick alone: they still get
   * their call, and the number simply stays unauthorised for voice and SMS.
   *
   * The union mirrors `createFreeAccountSchema` — a checkbox reaches a handler as a
   * boolean, "true" or "on" depending on the form.
   */
  phone_consent: z.union([z.boolean(), z.literal('true'), z.literal('on')]).optional(),
  slot_start: z.string().min(1, 'Time slot is required'),
  timezone: z.string().min(1, 'Timezone is required'),
  page_origin: z.string().optional(),
  visitor_fingerprint: z.string().optional(),
  utm_source: z.string().optional(),
  utm_campaign: z.string().optional(),
});

export type BookCallInput = z.infer<typeof bookCallSchema>;
