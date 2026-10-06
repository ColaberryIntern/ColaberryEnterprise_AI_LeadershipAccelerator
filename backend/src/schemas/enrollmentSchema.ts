import { z } from 'zod';

export const createInvoiceSchema = z.object({
  /**
   * Marketing consent checkbox. OPTIONAL and defaulting to absent: an unticked
   * box must not fail validation, and it records nothing rather than a
   * revocation. See services/consent/captureSignupConsent.ts.
   */
  marketing_opt_in: z.union([z.boolean(), z.literal('true'), z.literal('on')]).optional(),

  full_name: z.string().min(1, 'Full name is required').max(255),
  email: z.string().email('Invalid email address').max(255),
  company: z.string().min(1, 'Company is required').max(255),
  title: z.string().max(255).optional().default(''),
  phone: z.string().max(50).optional().default(''),
  company_size: z.string().max(50).optional().default(''),
  cohort_id: z.string().uuid('Invalid cohort ID'),
});

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;

export const createInvoiceRequestSchema = createInvoiceSchema;
export type CreateInvoiceRequestInput = CreateInvoiceInput;

// POST /api/create-free-account — the public /enroll page's free-signup path.
// No cohort_id: free accounts are auto-placed in the Explorer cohort
// (createExplorerEnrollment), and company is optional since a personal free
// trial shouldn't require B2B lead-qual fields to complete.
export const createFreeAccountSchema = z.object({
  /**
   * Marketing consent checkbox. OPTIONAL and defaulting to absent: an unticked
   * box must not fail validation, and it records nothing rather than a
   * revocation. See services/consent/captureSignupConsent.ts.
   */
  marketing_opt_in: z.union([z.boolean(), z.literal('true'), z.literal('on')]).optional(),

  full_name: z.string().min(1, 'Full name is required').max(255),
  email: z.string().email('Invalid email address').max(255),
  company: z.string().max(255).optional().default(''),
  title: z.string().max(255).optional().default(''),
  phone: z.string().max(50).optional().default(''),
  company_size: z.string().max(50).optional().default(''),
});

export type CreateFreeAccountInput = z.infer<typeof createFreeAccountSchema>;

/**
 * POST /api/portal/free-signup — the PORTAL free-signup path, Phase 2 T204.
 *
 * WHY THIS EXISTS. That route is **unauthenticated** and validated with hand-rolled
 * `if` checks, and T204 adds caller-supplied strings to it: a page URL, a referrer,
 * UTM values, a visitor fingerprint. CLAUDE.md's Contract Enforcement Layer
 * requires a runtime schema at every inbound route, and new untrusted input on a
 * public endpoint is exactly when that applies rather than being a formality.
 *
 * `.strict()` is deliberate: an unexpected key on a public signup is either a client
 * bug or someone probing, and either is worth a 400 over a silent ignore. NOTE for
 * deploys — a `.strict()` route rejects bodies a newer frontend sends, so frontend
 * and backend must ship together. This repo has been bitten by a frontend-only
 * deploy against strict routes before.
 *
 * Every acquisition field is OPTIONAL. The portal page does not send them today and
 * a signup must never fail because a tracking value was missing: absent means "not
 * known", recorded as null, never a default that would invent attribution.
 */
export const portalFreeSignupSchema = z.object({
  full_name: z.string().trim().min(1, 'full_name and email are required').max(255),
  email: z.string().trim().email('A valid email is required').max(320),

  // Acquisition evidence, kept SEPARATE from journey ownership: these describe
  // where the person came from, which is a different question from which
  // programme they joined. Origin brand is DERIVED from `source_id` →
  // `LeadSource.brand_id`, so it is never stored twice and cannot disagree with
  // itself.
  source: z.string().trim().max(120).optional(),
  form_type: z.string().trim().max(120).optional(),
  source_id: z.coerce.number().int().positive().optional(),
  entry_point_id: z.coerce.number().int().positive().optional(),
  utm_source: z.string().trim().max(255).optional(),
  utm_campaign: z.string().trim().max(255).optional(),
  // URLs validated as URLs **and restricted to http/https**.
  //
  // `.url()` alone is not enough, and a test written for this task found it the
  // hard way: Zod accepts `javascript:alert(1)` as a valid URL, because it is one.
  // These values are stored, rendered in admin surfaces and pushed to the CRM, so a
  // `javascript:` or `data:` scheme arriving on an unauthenticated endpoint is a
  // stored-XSS vector waiting for somewhere that renders it as a link.
  page_url: z.string().trim().url('page_url must be a URL').max(2048)
    .refine((u) => /^https?:\/\//i.test(u), 'page_url must be a URL')
    .optional(),
  referrer: z.string().trim().url('referrer must be a URL').max(2048)
    .refine((u) => /^https?:\/\//i.test(u), 'referrer must be a URL')
    .optional(),
  // Opaque client-generated id: bounded, not parsed.
  visitor_id: z.string().trim().max(128).optional(),
}).strict();

export type PortalFreeSignupInput = z.infer<typeof portalFreeSignupSchema>;
