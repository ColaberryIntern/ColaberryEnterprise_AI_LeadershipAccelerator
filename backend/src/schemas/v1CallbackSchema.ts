import { z } from 'zod';

// Contract for POST /api/v1/request-callback — training.colaberry.com fires this
// when a visitor asks to "be called right away". Same service-token auth as
// /api/v1/leads (ENTERPRISE_CRM_TOKEN).
//
// Deliberately mirrors the identity fields of v1LeadSchema so the payload can be
// forwarded straight into ingestExternalLead(), with two differences:
//   - `phone` is REQUIRED here (you cannot place a callback without a number).
//   - No `prompt` field is accepted. The agent's prompt + knowledge base stay
//     server-controlled in Synthflow; letting a public caller inject a raw prompt
//     into an outbound AI phone call is a prompt-injection / brand-safety hole.
//     Per-call dynamism is expressed through the structured fields below, which
//     the backend maps to Synthflow custom_variables.
export const v1CallbackSchema = z.object({
  // Identity — required for a callback
  name: z.string().min(1, 'Name is required').max(255),
  email: z.string().email('Invalid email').max(255),
  phone: z.string().min(7, 'A valid phone number is required').max(50),
  source: z.string().min(1, 'Source is required').max(100),

  // Optional context — forwarded to the lead record and to the agent as variables
  company: z.string().max(255).optional(),
  role: z.string().max(100).optional(),
  title: z.string().max(255).optional(),
  industry: z.string().max(100).optional(),
  company_size: z.string().max(50).optional(),
  interest_area: z.string().max(255).optional(),
  message: z.string().max(5000).optional(),
  consent_contact: z.boolean().optional(),

  // Idempotency + attribution (same shape as v1LeadSchema)
  strapi_lead_id: z.string().max(100).optional(),
  utm_source: z.string().max(200).optional(),
  utm_medium: z.string().max(200).optional(),
  utm_campaign: z.string().max(200).optional(),
  utm_term: z.string().max(200).optional(),
  utm_content: z.string().max(200).optional(),
  referrer: z.string().max(500).optional(),
  landing_page: z.string().max(500).optional(),
  first_touch_at: z.string().datetime({ offset: true }).optional(),
  last_touch_at: z.string().datetime({ offset: true }).optional(),
  last_touch_page: z.string().max(500).optional(),
  device: z.enum(['mobile', 'tablet', 'desktop']).optional(),
});

export type V1CallbackInput = z.infer<typeof v1CallbackSchema>;
