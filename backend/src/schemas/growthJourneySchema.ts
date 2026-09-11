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
