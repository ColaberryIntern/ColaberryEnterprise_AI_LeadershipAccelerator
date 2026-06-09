import { z } from 'zod';

// Matches docs/enterprise-crm-lead-contract.md from training.colaberry.com.
// All attribution fields are top-level (server-derived on Sai's side before POST).
export const v1LeadSchema = z.object({
  // Lead identity — required
  name: z.string().min(1, 'Name is required').max(255),
  email: z.string().email('Invalid email').max(255),

  // Lead identity — optional
  company: z.string().max(255).optional(),
  role: z.string().max(100).optional(),
  phone: z.string().max(50).optional(),
  title: z.string().max(255).optional(),
  industry: z.string().max(100).optional(),
  company_size: z.string().max(50).optional(),
  message: z.string().max(5000).optional(),
  consent_contact: z.boolean().optional(),

  // Source + idempotency key
  source: z.string().min(1, 'Source is required').max(100),
  strapi_lead_id: z.string().max(100).optional(),

  // Attribution block (all capped per Sai's validation — 200/500 chars)
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

export type V1LeadInput = z.infer<typeof v1LeadSchema>;
