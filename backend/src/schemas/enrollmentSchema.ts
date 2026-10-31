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

  /**
   * Permission to call or text, asked for SEPARATELY from the email box above.
   *
   * The email wording reads "Email me about Colaberry courses, events and AI
   * resources", and no reading of that authorises a telephone call — which is why
   * this is its own field rather than a second use of `marketing_opt_in`. Optional,
   * and absent records nothing rather than a revocation.
   * See services/consent/capturePhoneConsent.ts.
   */
  phone_consent: z.union([z.boolean(), z.literal('true'), z.literal('on')]).optional(),

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
 *
 * WHAT CHANGES FOR EXISTING CALLERS, stated exactly, because the first draft of this
 * change claimed "existing clients see no change" and that was false.
 *
 * The two legacy error STRINGS are preserved, and so is every body the old code
 * rejected — `{}`, a missing name, a missing or non-string email, an empty name, a
 * falsy numeric name, a malformed address — each still 400s with the same message it
 * did before. A numeric name still works, because the old code coerced it.
 *
 * But the endpoint is NARROWER, in these six classes. Each is a deliberate tightening
 * of an unauthenticated route rather than an accident:
 *   1. `full_name` over 255 chars now 400s (the column is STRING(255), so it was
 *      previously accepted here and then truncated or rejected downstream).
 *   2. `email` over 255 chars now 400s (the column width, not the RFC's 320).
 *   3. An unexpected key now 400s instead of being ignored — see `.strict()` below.
 *   4. `full_name` as a boolean, object or array now 400s. The old code accepted
 *      `{}` and stored the name "[object Object]".
 *   5. **THE BIGGEST ONE, and the one I first omitted.** The email rule is now Zod's
 *      `.email()`, not the old loose `/^[^@\s]+@[^@\s]+\.[^@\s]+$/`. Zod is
 *      substantially stricter, so these all 400 where they used to pass: RFC-legal
 *      local-part specials (`user%x@`, `user=x@`), a leading or trailing dot in the
 *      local part, IP-literal domains (`a@127.0.0.1`), non-punycode unicode domains,
 *      trailing-dot FQDNs (`a@b.co.`), and single-character or all-digit TLDs
 *      (`a@b.c`, `a@b.12`). Measured: 7 of 9 probe addresses flipped from accepted to
 *      rejected, while 9 of 9 realistic addresses (punycode, `+`-tagging, `.co.uk`,
 *      `.museum`, apostrophes) still pass — which is why this is judged acceptable
 *      rather than reverted, not why it is unremarkable.
 *   6. A whitespace-only, `Infinity`, or `Date` `full_name` now 400s. Those passed
 *      `!full_name` and then threw inside `resolveFreeAccount`, so the old response
 *      was a 500 — this class is a 500 becoming a 400.
 *
 * Classes 5 and 6 are here because a verifier found them AFTER I had written "NARROWER
 * in four named ways … so the list cannot quietly grow" in this very docblock. The list
 * had already grown; what could not grow was my count of it. Classes 1-4, 5 and 6 are
 * each asserted in `freeSignupAcquisition.test.ts` now, which is what makes the sentence
 * true rather than merely confident.
 */
const LEGACY_REQUIRED = 'full_name and email are required';

export const portalFreeSignupSchema = z.object({
  // A union with an explicit error, because the old hand-rolled check accepted a
  // NUMBER for `full_name` (it called `String(full_name)`) and returned the legacy
  // message for anything falsy. Both of THOSE behaviours are preserved; the four
  // narrowings listed above are the deliberate exceptions. 255 matches
  // `Enrollment.full_name` and `Lead.name`, both `STRING(255)`.
  full_name: z.union([
    z.string(),
    // A NUMBER is accepted because the old code called `String(full_name)`, and a
    // FALSY number is rejected because the old check was `!full_name` — so `0` was
    // a 400 before and must stay one, rather than becoming the name "0". Getting
    // this wrong would have WIDENED a public endpoint while the commit body claimed
    // nothing changed.
    z.number().refine((n) => Boolean(n), LEGACY_REQUIRED),
  ], { error: LEGACY_REQUIRED })
    .transform((v) => String(v).trim())
    .refine((s) => s.length > 0, LEGACY_REQUIRED)
    .refine((s) => s.length <= 255, 'full_name must be 255 characters or fewer'),
  // 255, NOT the RFC's 320. `Lead.email` and `Enrollment.email` are both
  // `STRING(255)`, and this is the same defect as the acquisition fields: a schema
  // wider than its column accepts a value the write then cannot store. I missed it on
  // the first pass of this fix precisely because I was only checking the NEW fields,
  // which is why the test derives this width from the model rather than trusting me.
  email: z.string({ error: LEGACY_REQUIRED })
    .trim()
    .min(1, LEGACY_REQUIRED)
    .email('A valid email is required')
    .max(255),

  // Acquisition evidence, kept SEPARATE from journey ownership: these describe
  // where the person came from, which is a different question from which
  // programme they joined. Origin brand is DERIVED from `source_id` →
  // `LeadSource.brand_id`, so it is never stored twice and cannot disagree with
  // itself.
  //
  // EVERY LIMIT HERE MATCHES `models/Lead.ts`, and the first draft of this schema
  // did not — it disagreed on six of nine fields, which is the most serious defect
  // of this phase. `source_id` and `entry_point_id` are `DataTypes.UUID`, and the
  // draft coerced them to positive integers: so the endpoint accepted exactly the
  // values that can never join to a `LeadSource` row and rejected the only values
  // that could, making the origin-brand derivation unachievable. And because
  // `captureGuestAsLead` swallows its errors, a caller supplying `source_id` would
  // have **lost the whole lead row** — a silent regression on a live public path
  // where a lead was previously always created. A schema is only as good as its
  // agreement with the column it writes.
  source: z.string().trim().max(50).optional(),            // Lead.source      STRING(50)
  form_type: z.string().trim().max(100).optional(),        // Lead.form_type   STRING(100)
  source_id: z.string().trim().uuid().optional(),          // Lead.source_id   UUID
  entry_point_id: z.string().trim().uuid().optional(),     // Lead.entry_point_id UUID
  utm_source: z.string().trim().max(255).optional(),       // Lead.utm_source  STRING(255)
  utm_campaign: z.string().trim().max(255).optional(),     // Lead.utm_campaign STRING(255)
  utm_content: z.string().trim().max(255).optional(),      // Lead.utm_content STRING(255), C94: which ad
  utm_term: z.string().trim().max(255).optional(),         // Lead.utm_term    STRING(255), C94: which placement
  // URLs validated as URLs **and restricted to http/https**.
  //
  // `.url()` alone is not enough, and a test written for this task found it the
  // hard way: Zod accepts `javascript:alert(1)` as a valid URL, because it is one.
  // These values are stored, rendered in admin surfaces and pushed to the CRM, so a
  // `javascript:` or `data:` scheme arriving on an unauthenticated endpoint is a
  // stored-XSS vector waiting for somewhere that renders it as a link.
  // 500, matching `Lead.page_url` STRING(500). The draft allowed 2048, so a long
  // but legal URL would have been accepted here and then rejected by the column.
  page_url: z.string().trim().url('page_url must be a URL').max(500)
    .refine((u) => /^https?:\/\//i.test(u), 'page_url must be a URL')
    .optional(),

  // `referrer` IS NOT ACCEPTED, and that is deliberate rather than an omission.
  // `Lead` has no `referrer` column — zero matches for `refer` in `models/Lead.ts`
  // — so the draft's write was dead: Sequelize silently dropped the key and the
  // test that claimed to assert it was reading the service's own argument object.
  // The repo's convention for this fact is `referrer_url` on `VisitorSession` —
  // `models/VisitorSession.ts` is the only model in the tree that carries it. **Preserving a referrer needs a column, and adding one is
  // T205's mechanism** (the `ALTER TABLE … ADD COLUMN IF NOT EXISTS` drift-guard
  // list in `server.ts`), so it moves there rather than being half-shipped here.

  // `Lead.visitor_id` is `DataTypes.UUID`, so this is a UUID — not an arbitrary
  // bounded string, which is what the draft allowed.
  visitor_id: z.string().trim().uuid().optional(),

  // Marketing consent, as an affirmative act.
  //
  // A STRICT BOOLEAN, deliberately narrower than `captureSignupConsent` accepts.
  // That function takes `boolean | string | undefined | null` because a value
  // arriving from another service could be anything, and it has one narrow gate
  // (`isAffirmative`) that decides what COUNTS. This is a first-party form posting
  // JSON, so there is no reason to accept "on" or "true" here, and accepting them
  // would mean two places deciding what consent is.
  //
  // OPTIONAL, and absent means NO consent recorded rather than a revocation. It
  // must also stay optional for a second reason: this object is `.strict()`, so the
  // field cannot be sent until this schema is deployed, and it cannot be required
  // until every caller sends it. The frontend and this change ship together.
  marketing_opt_in: z.boolean().optional(),

  /**
   * Phone, OPTIONAL, and 50 to match `Lead.phone` STRING(50) rather than any opinion about how
   * long a phone number is.
   *
   * Measured 2026-10-26: of 270 landing-page signups in thirty days, ZERO had a phone, because
   * the form never asked. Open House, which does ask, collected 48 of 53. Nobody can be called
   * without this, so it is the field that unblocks every phone-based follow-up.
   *
   * It stays optional on purpose. Requiring it would cost signups on a page converting at 41.6%,
   * and the whole value of this entry point is how little it asks for.
   */
  phone: z.string().trim().max(50).optional(),

  /**
   * Permission to CALL OR TEXT, which is a different permission from `marketing_opt_in`.
   *
   * The existing checkbox says "Email me about Colaberry courses, events and AI resources" - that
   * is email consent and cannot be read as agreement to a phone call, least of all one placed by
   * an AI agent. Conflating them would mean inferring phone consent from an email checkbox, which
   * is the kind of inference this field exists to make unnecessary.
   *
   * Absent means no consent recorded, never a revocation, and the same `.strict()` deploy-order
   * caveat as `marketing_opt_in` applies: the frontend and this ship together.
   */
  phone_consent: z.boolean().optional(),
}).strict();

export type PortalFreeSignupInput = z.infer<typeof portalFreeSignupSchema>;
