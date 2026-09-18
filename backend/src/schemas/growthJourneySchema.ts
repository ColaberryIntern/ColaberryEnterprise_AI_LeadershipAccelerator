import { z } from 'zod';
import type { GrowthJourneyHandoffDisposition, GrowthJourneyHandoffStatus, GrowthJourneyOwnerQueue } from '../models/GrowthJourneyHandoff';

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

/**
 * The shadow decision queue and its Why (Phase 3, T312). Two reads, no body.
 * `mode` defaults to the shadow queue; `all` lists live rows too (none exist in
 * Phase 3). `subject_ref` narrows to one subject, exactly as stored.
 */
export const DECISION_MODES = ['shadow', 'live'] as const;

export const decisionParamsSchema = z.object({
  id: z.string().uuid(),
});

export const decisionsQuerySchema = z.object({
  tenant_id: z.string().uuid().optional(),
  brand_id: z.string().uuid().optional(),
  mode: z.enum([...DECISION_MODES, 'all']).default('shadow'),
  subject_ref: z.string().min(1).max(128).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

export type DecisionParams = z.infer<typeof decisionParamsSchema>;
export type DecisionsQuery = z.infer<typeof decisionsQuerySchema>;

/**
 * The human's handoff queue and their three moves (Phase 4, T405). Two reads
 * and three writes. The vocabularies are the model's, pinned with `satisfies`
 * so a status the model gains and this file does not is a compile error.
 * `.strict()` on every body: an unknown key is a 400, not ignored; `accept`
 * and `release` take an empty object (release may carry a reason).
 */
export const HANDOFF_STATUSES = ['queued', 'assigned', 'accepted', 'dispositioned', 'returned_to_ai', 'expired', 'cancelled'] as const satisfies readonly GrowthJourneyHandoffStatus[];
export const HANDOFF_DISPOSITIONS = ['qualified', 'not_ready', 'nurture', 'no_contact', 'disqualified', 'converted'] as const satisfies readonly GrowthJourneyHandoffDisposition[];
export const HANDOFF_OWNER_QUEUES = ['admissions', 'sales', 'solution_architect', 'support', 'ali', 'human_review'] as const satisfies readonly GrowthJourneyOwnerQueue[];
/** The queue's default filter - the model's `OPEN_HANDOFF_STATUSES`, restated here so the controller needs no runtime import of the model file. */
export const HANDOFF_OPEN_STATUSES = ['queued', 'assigned', 'accepted'] as const satisfies readonly GrowthJourneyHandoffStatus[];

export const handoffParamsSchema = z.object({
  id: z.string().uuid(),
});

export const handoffsQuerySchema = z.object({
  tenant_id: z.string().uuid().optional(),
  brand_id: z.string().uuid().optional(),
  /** Defaults to the open queue (queued, assigned, accepted). `all` lists every status. */
  status: z.enum([...HANDOFF_STATUSES, 'open', 'all']).default('open'),
  owner_queue: z.enum(HANDOFF_OWNER_QUEUES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

export const handoffAcceptBodySchema = z.object({}).strict();

export const handoffDispositionBodySchema = z
  .object({
    disposition: z.enum(HANDOFF_DISPOSITIONS),
    reason: z.string().min(8).max(500),
    /** `not_ready` / `nurture` only: the cooldown in days; else the brand's cooldown policy, else 14. */
    cooldown_days: z.number().int().min(1).max(90).optional(),
  })
  .strict();

export const handoffReleaseBodySchema = z
  .object({
    reason: z.string().min(1).max(500).default('released'),
  })
  .strict();

export type HandoffParams = z.infer<typeof handoffParamsSchema>;
export type HandoffsQuery = z.infer<typeof handoffsQuerySchema>;
export type HandoffDispositionBody = z.infer<typeof handoffDispositionBodySchema>;
export type HandoffReleaseBody = z.infer<typeof handoffReleaseBodySchema>;

/* ── Person 360 (T410) ──────────────────────────────────────────────────────── */

export const personParamsSchema = z.object({
  leadId: z.coerce.number().int().positive(),
});

export const personQuerySchema = z.object({
  tenant_id: z.string().uuid().optional(),
  brand_id: z.string().uuid().optional(),
  /** Rows per collection (classifications, decisions, transitions, handoffs, outcomes), newest first. */
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export type PersonParams = z.infer<typeof personParamsSchema>;
export type PersonQuery = z.infer<typeof personQuerySchema>;
