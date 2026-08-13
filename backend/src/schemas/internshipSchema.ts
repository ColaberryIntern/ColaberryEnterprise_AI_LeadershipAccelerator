import { z } from 'zod';

/**
 * AI Internship — request contracts. Plan §22.
 *
 * Zod v4 in this repo: validation errors expose `err.issues`, not `err.errors`.
 *
 * Everything crossing the trust boundary is validated here before it reaches
 * the service, per CLAUDE.md's Contract Enforcement Layer. This is a PUBLIC,
 * unauthenticated intake, so the schema is the only thing standing between an
 * anonymous poster and the database.
 */

/** Max lengths mirror the DDL, so a too-long field is a clean 400 and never a 500 from Postgres. */
export const applyToInternshipSchema = z.object({
  offering_slug: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(320),
  full_name: z.string().trim().min(1).max(255).optional(),
  motivation: z.string().trim().max(5000).optional(),
  portfolio_url: z.string().trim().url().max(500).optional().or(z.literal('')),
  source: z.string().trim().max(60).optional(),
  // Deliberately NOT accepted from the client: status, enrollment_id, lead_id,
  // decided_at, decision_note. A public poster must not be able to declare
  // themselves accepted, attach their application to someone else's enrollment,
  // or write a decision. The service resolves identity itself.
});

export type ApplyToInternshipInput = z.infer<typeof applyToInternshipSchema>;

export const listOfferingsQuerySchema = z.object({
  track: z.string().trim().max(60).optional(),
});
