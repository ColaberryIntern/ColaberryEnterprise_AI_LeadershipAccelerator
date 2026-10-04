import { z } from 'zod';
import type { GrowthJourneyHandoffDisposition, GrowthJourneyHandoffStatus, GrowthJourneyOwnerQueue } from '../models/GrowthJourneyHandoff';
import type { AgentActivityResult } from '../models/AiAgentActivityLog';
import type { PolicyDecision, PolicyStatus } from '../models/BrandOfferPolicy';
import type { GrowthJourneyPolicyType } from '../models/GrowthJourneyPolicy';
import type { OfferFamilySlug } from '../models/OfferFamily';

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

/* ── Execution controls (Phase 5 T518) ─────────────────────────────────────── */

/** The channels a rollout may raise. Ali's own outreach is REVIEW-only by construction and has no rollout route here. */
export const ROLLOUT_CHANNELS = ['email', 'in_app'] as const;
export const ROLLOUT_MODES = ['review', 'limited'] as const;
/** A pause may name any executable channel, or none. */
export const PAUSE_CHANNELS = ['email', 'in_app', 'ali_outreach'] as const;
export const COHORT_MAX = 50;
export const DAILY_LIMIT_MAX = 25;

export const controlParamsSchema = z.object({
  id: z.string().uuid(),
});

export const controlsQuerySchema = z.object({
  tenant_id: z.string().uuid().optional(),
  brand_id: z.string().uuid().optional(),
  /** Cleared rows are history; they are listed only when asked for. */
  include_cleared: z.enum(['true', 'false', '1', '0']).default('false').transform((v) => v === 'true' || v === '1'),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

/**
 * A pause lowers a scope to `off`. At least one dimension must be named - the
 * all-wildcard pause is refused by `pauseScopeKey` (it would be a second global
 * kill switch) and by this schema before it. A pause with no brand needs the
 * tenant named, and is a super-admin write.
 */
export const pauseBodySchema = z
  .object({
    tenant_id: z.string().uuid().optional(),
    brand_id: z.string().uuid().optional(),
    program_id: z.string().uuid().optional(),
    channel: z.enum(PAUSE_CHANNELS).optional(),
    subject_ref: z.string().min(3).max(128).regex(/^(lead|enrollment):[^|\s]+$/).optional(),
    reason: z.string().min(1).max(500),
  })
  .strict()
  .refine((b) => b.brand_id || b.program_id || b.channel || b.subject_ref, { message: 'a pause must name a brand, a programme, a channel or a subject' })
  .refine((b) => b.brand_id || b.tenant_id, { message: 'a pause with no brand must name the tenant' });

/**
 * A rollout raises ONE brand x programme x channel to `review` or `limited`.
 * `limited` needs its cohort (1-50 existing lead ids) and a daily limit (1-25);
 * `review` carries neither.
 */
export const rolloutBodySchema = z
  .object({
    brand_id: z.string().uuid(),
    program_id: z.string().uuid(),
    channel: z.enum(ROLLOUT_CHANNELS),
    mode: z.enum(ROLLOUT_MODES),
    cohort_lead_ids: z.array(z.number().int().positive()).min(1).max(COHORT_MAX).optional(),
    daily_limit: z.number().int().min(1).max(DAILY_LIMIT_MAX).optional(),
    reason: z.string().min(1).max(500),
  })
  .strict()
  .refine((b) => b.mode !== 'limited' || (b.cohort_lead_ids !== undefined && b.daily_limit !== undefined), { message: 'a limited rollout needs cohort_lead_ids and daily_limit' })
  .refine((b) => b.mode !== 'review' || (b.cohort_lead_ids === undefined && b.daily_limit === undefined), { message: 'a review rollout carries no cohort or daily limit' });

/** A clear carries nothing: the row has no cleared-reason column, so a body field would be a dead input on a public contract. */
export const clearControlBodySchema = z.object({}).strict();

export type ControlParams = z.infer<typeof controlParamsSchema>;
export type ControlsQuery = z.infer<typeof controlsQuerySchema>;
export type PauseBody = z.infer<typeof pauseBodySchema>;
export type RolloutBody = z.infer<typeof rolloutBodySchema>;
export type ClearControlBody = z.infer<typeof clearControlBodySchema>;

/* ── Phase 6 (T605, T606): the performance reads ─────────────────────────────────────────────── */

/**
 * Every list read is BOUNDED at the boundary: `limit` at most 100, `offset` a whole number,
 * `window_days` at most a year. The clamp exists in the service too (a caller is not the only way
 * in), and these schemas make a bad request a 400 before any query runs rather than a silently
 * truncated page.
 *
 * `tenant_id` / `brand_id` are a SCOPE REQUEST, not a filter - the same rule as the read schemas
 * above: `scopedContext` grants them only against a real membership and refuses anything else with
 * a 403, so a caller cannot widen their own scope through a query string.
 */

export const PERFORMANCE_MAX_LIMIT = 100;
export const PERFORMANCE_MAX_WINDOW_DAYS = 365;

const performanceScope = {
  tenant_id: z.string().uuid().optional(),
  brand_id: z.string().uuid().optional(),
  program_id: z.string().uuid().optional(),
};

const performancePaging = {
  limit: z.coerce.number().int().min(1).max(PERFORMANCE_MAX_LIMIT).default(25),
  offset: z.coerce.number().int().min(0).default(0),
};

export const metricsQuerySchema = z.object({
  ...performanceScope,
  window_days: z.coerce.number().int().min(1).max(PERFORMANCE_MAX_WINDOW_DAYS).optional(),
});

export const ratesQuerySchema = z.object({
  ...performanceScope,
  window_days: z.coerce.number().int().min(1).max(PERFORMANCE_MAX_WINDOW_DAYS).default(30),
});

/** The statuses and channels a receipt can carry - the model's own vocabulary, not a free string. */
export const RECEIPT_STATUSES = [
  'pending_review', 'approved', 'enrolling', 'enrolled', 'in_progress',
  'completed', 'blocked', 'failed', 'cancelled', 'expired', 'rejected',
] as const;
export const RECEIPT_CHANNELS = ['email', 'in_app', 'ali_outreach'] as const;

export const receiptsQuerySchema = z.object({
  ...performanceScope,
  ...performancePaging,
  status: z.enum(RECEIPT_STATUSES).optional(),
  channel: z.enum(RECEIPT_CHANNELS).optional(),
});

/** The outcome vocabulary, likewise the model's: an unknown type is a 400, never an empty list. */
export const OUTCOME_TYPES = [
  'reply', 'meeting_booked', 'meeting_completed', 'meeting_no_show', 'declined',
  'opportunity_stage', 'enrolled_paid', 'subscription_active', 'project_started',
  'handoff_accepted', 'handoff_dispositioned',
  'contact_sent', 'contact_blocked', 'contact_failed', 'contact_replied',
] as const;
export const OUTCOME_SOURCES = [
  'interaction_outcomes', 'appointments', 'strategy_calls', 'leads.pipeline_stage',
  'enrollments', 'subscriptions', 'delivery_engagements', 'growth_journey_handoffs',
  'growth_journey_executions',
] as const;

/**
 * No `program_id`: `growth_journey_outcomes` has no such column, so the parameter cannot be honoured
 * and is not accepted. The handler echoes `program_id: null` to say so in the answer.
 */
export const outcomesQuerySchema = z.object({
  tenant_id: performanceScope.tenant_id,
  brand_id: performanceScope.brand_id,
  ...performancePaging,
  outcome_type: z.enum(OUTCOME_TYPES).optional(),
  source: z.enum(OUTCOME_SOURCES).optional(),
});

/** The by-journey roll-up takes a date range, like the Marketing Ops route it re-exposes. */
export const byJourneyQuerySchema = z.object({
  ...performanceScope,
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/* ── T607: the inspect reads - decisions, shadow runs, content, handoff policy ── */

/**
 * The vocabularies below are the models' own, pinned with `satisfies` exactly as
 * `HANDOFF_STATUSES` above is. They are re-declared here rather than imported at runtime on
 * purpose: this file's model imports are all `import type`, so it pulls in no model file and
 * therefore no Sequelize instance - which is what lets every route suite load it. `satisfies`
 * catches a wrong member and the `Covers` guard at the bottom catches a missing one, so the
 * duplication cannot drift silently in either direction.
 */
export const OFFER_FAMILY_SLUGS = [
  'learner_free_training', 'learner_paid_training', 'learner_community_subscription',
  'learner_certification', 'learner_internship', 'business_training', 'ai_consulting',
  'workflow_automation', 'application_build', 'ai_project', 'paid_discovery',
] as const satisfies readonly OfferFamilySlug[];
export const POLICY_DECISIONS = ['allow', 'deny'] as const satisfies readonly PolicyDecision[];
export const POLICY_STATUSES = ['active', 'paused', 'retired'] as const satisfies readonly PolicyStatus[];
export const JOURNEY_POLICY_TYPES = ['queue_capacity', 'queue_assignee', 'cooldown', 'holdout_experiment'] as const satisfies readonly GrowthJourneyPolicyType[];
export const RUN_RESULTS = ['success', 'failed', 'skipped', 'pending'] as const satisfies readonly AgentActivityResult[];

/**
 * The three journey cron identities. There is no union to `satisfy` - they are DATA, declared by
 * `agentRegistry/growthJourneyAgents.ts` - so a cell asserts this list equals the one the read
 * service derives from that registry, which is the only thing that would catch a fourth agent
 * being registered without this filter learning about it.
 */
export const SHADOW_AGENTS = ['GrowthJourneyShadowDecisions', 'GrowthJourneyExecutor', 'GrowthJourneyHandoffDigest'] as const;

/**
 * A subject is a POINTER, and this is the one place that can say so before a query runs:
 * `lead:123`, `enrollment:<uuid>`, `org_member:<uuid>`, `visitor:<id>`. The charset excludes `@`,
 * so a filter carrying an address is a 400 rather than a lookup that quietly finds nothing.
 */
const subjectRefField = z.string().min(3).max(128).regex(/^(lead|enrollment|org_member|visitor):[A-Za-z0-9_-]+$/);

/** Snapshots carry no `program_id` column, so the schema does not accept one (see T606's `/outcomes`). */
export const snapshotsQuerySchema = z.object({
  tenant_id: performanceScope.tenant_id,
  brand_id: performanceScope.brand_id,
  ...performancePaging,
  subject_ref: subjectRefField.optional(),
});

export const transitionsQuerySchema = z.object({
  ...performanceScope,
  ...performancePaging,
  subject_ref: subjectRefField.optional(),
});

/**
 * No `brand_id`: `ai_agent_activity_logs` has no brand column, a cron run is one process across
 * every brand, and accepting a scope parameter this read cannot apply would label the answer with
 * a filter that never ran.
 */
export const shadowRunsQuerySchema = z.object({
  tenant_id: performanceScope.tenant_id,
  ...performancePaging,
  window_days: z.coerce.number().int().min(1).max(PERFORMANCE_MAX_WINDOW_DAYS).default(7),
  agent: z.enum(SHADOW_AGENTS).optional(),
  result: z.enum(RUN_RESULTS).optional(),
});

export const offerPoliciesQuerySchema = z.object({
  tenant_id: performanceScope.tenant_id,
  brand_id: performanceScope.brand_id,
  ...performancePaging,
  offer_family: z.enum(OFFER_FAMILY_SLUGS).optional(),
  decision: z.enum(POLICY_DECISIONS).optional(),
  status: z.enum(POLICY_STATUSES).optional(),
});

/**
 * `approval_status` is a bounded string, not an enum, and deliberately so: the column is a bare
 * `STRING(16)` with no CHECK and no exported union, so a closed list here would be a contract this
 * repo does not have - and would answer 400 for a value the table can legitimately hold. The one
 * documented value is the default, `'draft'`. The answer echoes the filter it applied.
 */
export const contentRulesQuerySchema = z.object({
  tenant_id: performanceScope.tenant_id,
  brand_id: performanceScope.brand_id,
  ...performancePaging,
  offer_family: z.enum(OFFER_FAMILY_SLUGS).optional(),
  approval_status: z.string().min(1).max(16).optional(),
});

export const queuePoliciesQuerySchema = z.object({
  tenant_id: performanceScope.tenant_id,
  brand_id: performanceScope.brand_id,
  ...performancePaging,
  policy_type: z.enum(JOURNEY_POLICY_TYPES).optional(),
  owner_queue: z.enum(HANDOFF_OWNER_QUEUES).optional(),
});

/**
 * T608's holdout lift. `window_days` defaults to 90 rather than the reads' 30: an experiment needs
 * 100 decisions per arm before `computeLift` will answer at all, and a month of a dark journey has
 * none. The cap is the same 365 as every other window on this surface.
 */
export const experimentsQuerySchema = z.object({
  tenant_id: performanceScope.tenant_id,
  brand_id: performanceScope.brand_id,
  window_days: z.coerce.number().int().min(1).max(PERFORMANCE_MAX_WINDOW_DAYS).default(90),
});

export const ownershipQuerySchema = z.object({
  tenant_id: performanceScope.tenant_id,
  brand_id: performanceScope.brand_id,
  ...performancePaging,
});

/**
 * A compile error the day a model union gains a member one of the lists above does not carry:
 * `Covers` resolves to `never`, and `never` cannot be assigned `true`. The scoped `tsc` is what
 * enforces it - `ts-jest` transpiles without typechecking, so no suite would ever notice.
 */
type Covers<U, L extends readonly unknown[]> = [Exclude<U, L[number]>] extends [never] ? true : never;
const _vocabulariesAreExhaustive: [
  Covers<OfferFamilySlug, typeof OFFER_FAMILY_SLUGS>,
  Covers<PolicyDecision, typeof POLICY_DECISIONS>,
  Covers<PolicyStatus, typeof POLICY_STATUSES>,
  Covers<GrowthJourneyPolicyType, typeof JOURNEY_POLICY_TYPES>,
  Covers<AgentActivityResult, typeof RUN_RESULTS>,
] = [true, true, true, true, true];
void _vocabulariesAreExhaustive;

export type MetricsQuery = z.infer<typeof metricsQuerySchema>;
export type RatesQuery = z.infer<typeof ratesQuerySchema>;
export type ReceiptsQuery = z.infer<typeof receiptsQuerySchema>;
export type OutcomesQuery = z.infer<typeof outcomesQuerySchema>;
export type ByJourneyQuery = z.infer<typeof byJourneyQuerySchema>;
export type SnapshotsQuery = z.infer<typeof snapshotsQuerySchema>;
export type TransitionsQuery = z.infer<typeof transitionsQuerySchema>;
export type ShadowRunsQuery = z.infer<typeof shadowRunsQuerySchema>;
export type OfferPoliciesQuery = z.infer<typeof offerPoliciesQuerySchema>;
export type ContentRulesQuery = z.infer<typeof contentRulesQuerySchema>;
export type QueuePoliciesQuery = z.infer<typeof queuePoliciesQuerySchema>;
export type OwnershipQuery = z.infer<typeof ownershipQuerySchema>;
export type ExperimentsQuery = z.infer<typeof experimentsQuerySchema>;
