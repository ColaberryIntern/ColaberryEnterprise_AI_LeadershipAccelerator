import { z } from 'zod';

/**
 * Zod contracts for the Growth Journey admin read routes (T207).
 *
 * Every input validated at the boundary, matching the twelve adjacent Explorer
 * read endpoints in `explorerGrowthSchema.ts`. Malformed input is a 400 before
 * any business logic runs.
 */

export const participationParamsSchema = z.object({
  id: z.string().uuid(),
});

/**
 * `tenant_id` and `brand_id` are a SCOPE REQUEST, not a filter the caller controls.
 * They are handed to `buildRequestContext`, which grants them only against a real
 * membership. A brand the caller does not hold is refused at the route, never
 * quietly widened — see `growthJourneyController.ts`.
 */
export const participationsQuerySchema = z.object({
  tenant_id: z.string().uuid().optional(),
  brand_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ParticipationParams = z.infer<typeof participationParamsSchema>;
export type ParticipationsQuery = z.infer<typeof participationsQuerySchema>;

/**
 * The classification queue, its Why, and the human override (Phase 2, T229).
 * `.strict()` on the override body: an unknown key is a 400, not ignored.
 */
export const CLASSIFICATION_STATUSES = ['proposed', 'needs_review', 'confirmed', 'rejected'] as const;

export const classificationParamsSchema = z.object({
  id: z.string().uuid(),
});

export const classificationsQuerySchema = z.object({
  tenant_id: z.string().uuid().optional(),
  brand_id: z.string().uuid().optional(),
  /** Defaults to the review queue. `all` lists every status. */
  status: z.enum([...CLASSIFICATION_STATUSES, 'all']).default('needs_review'),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

export const classificationOverrideBodySchema = z
  .object({
    primary_path: z.string().min(1).max(64).nullable().optional(),
    journey_program: z.string().min(1).max(64).nullable().optional(),
    /** The brand the caller believes the row belongs to; refused when it does not match the row. */
    brand_id: z.string().uuid().optional(),
    lock: z.boolean(),
    reason: z.string().min(8).max(500),
  })
  .strict();

export type ClassificationParams = z.infer<typeof classificationParamsSchema>;
export type ClassificationsQuery = z.infer<typeof classificationsQuerySchema>;
export type ClassificationOverrideBody = z.infer<typeof classificationOverrideBodySchema>;
