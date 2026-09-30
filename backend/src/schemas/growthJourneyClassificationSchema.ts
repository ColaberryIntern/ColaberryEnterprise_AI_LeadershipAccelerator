import { z } from 'zod';

/**
 * The shape a model must return for §7.1 step 7 (Phase 2, T224) — the spec's
 * JSON, and nothing else. `.strict()`: an extra key is a contract violation,
 * because a model that starts returning fields nobody asked for is a model
 * whose output nobody is reading carefully.
 *
 * Values are NOT validated against the offer/brand/programme vocabularies
 * here; the AI module does that against the exact sets the prompt showed
 * ("never trust an id the model wasn't shown"), and the ladder re-checks the
 * family against `brand_offer_policies` afterwards. This schema only says the
 * JSON is well-formed.
 */
export const aiProposalSchema = z
  .object({
    brand_relationship: z.string().max(64).nullable(),
    journey_program: z.string().max(64).nullable(),
    primary_path: z.string().max(64).nullable(),
    secondary_paths: z.array(z.string().max(64)).max(5),
    intent: z.string().max(120).nullable(),
    confidence: z.number().min(0).max(1),
    evidence: z.array(z.string().max(160)).max(8),
    requires_human_review: z.boolean(),
  })
  .strict();

export type AiProposalJson = z.infer<typeof aiProposalSchema>;

/** The `ClassificationResult` as a dry-run script prints it (T225). */
export const classificationResultSchema = z
  .object({
    brand_relationship: z.string().nullable(),
    journey_program: z.string().nullable(),
    primary_path: z.string().nullable(),
    secondary_paths: z.array(z.string()),
    intent: z.string().nullable(),
    confidence: z.number().min(0).max(1),
    evidence: z.array(z.string()),
    requires_human_review: z.boolean(),
    source_step: z.number().int().min(1).max(8),
    source_step_name: z.string(),
    ruleset_version: z.string(),
    ai_involved: z.boolean(),
    model_version: z.string().nullable(),
    referral_target_brand_id: z.string().nullable(),
    steps_considered: z.array(
      z.object({
        step: z.number().int().min(1).max(8),
        name: z.string(),
        outcome: z.enum(['answered', 'abstained', 'skipped', 'unavailable']),
        note: z.string(),
      }),
    ),
  })
  .passthrough();
