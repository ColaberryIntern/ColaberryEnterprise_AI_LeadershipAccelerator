import { z } from 'zod';
import { ARCHITECTURE_SKILL_IDS } from '../constants/architectureSkills';

/**
 * Zod contracts for CAPE (Colaberry Adaptive Path Engine) Phase 0-1 route
 * boundaries and inter-service inputs. Every route validates against one of
 * these before touching a service (backend/CLAUDE.md "Every route validates
 * input with Zod").
 */

export const architectureSkillIdSchema = z.enum(ARCHITECTURE_SKILL_IDS);

export const evidenceBandSchema = z.enum(['claim', 'knowledge', 'application', 'judgment']);

/** Input contract for capeEvidenceLedgerService.recordSkillEvidence(). */
export const skillEvidenceInputSchema = z.object({
  enrollment_id: z.string().min(1),
  skill_id: architectureSkillIdSchema,
  band: evidenceBandSchema,
  credit: z.number().positive(),
  source: z.string().min(1).max(40),
  source_ref: z.string().max(255).nullable().optional(),
  idempotency_key: z.string().min(1).max(300),
  mapping_version: z.number().int().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type SkillEvidenceInput = z.infer<typeof skillEvidenceInputSchema>;

/** Response contract for GET /api/portal/cape/skill-profile. */
export const skillProfileEntrySchema = z.object({
  skill_id: architectureSkillIdSchema,
  name: z.string(),
  axis_order: z.number().int(),
  placement: z.number(),
  claim: z.number(),
  knowledge: z.number(),
  application: z.number(),
  judgment: z.number(),
  proficiency: z.number(),
  confidence: z.number(),
  next_review_at: z.string().nullable(),
});
export const skillProfileResponseSchema = z.object({
  skills: z.array(skillProfileEntrySchema).length(10),
  overall_placement: z.number(),
  overall_proficiency: z.number(),
  weights_version: z.number().int().nullable(),
});
export type SkillProfileResponse = z.infer<typeof skillProfileResponseSchema>;

/** Admin PUT /api/admin/cape/skill-definitions/:skillId body. */
export const updateSkillDefinitionSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  description: z.string().max(4000).nullable().optional(),
  axis_order: z.number().int().min(0).max(99).optional(),
}).refine((v) => v.name !== undefined || v.description !== undefined || v.axis_order !== undefined, {
  message: 'at least one of name, description, axis_order must be provided',
});
export type UpdateSkillDefinitionInput = z.infer<typeof updateSkillDefinitionSchema>;

/**
 * CAPE Phase 2 (design doc §5, §13) — resume/LinkedIn placement + adaptive
 * diagnostic contracts.
 */

/** The 6 evidence tiers §5 asks the extractor to distinguish, ascending strength. */
export const evidenceKindSchema = z.enum([
  'keyword_list', 'job_bullet', 'built_owned',
  'measurable_outcome', 'production', 'led_architecture_decisions',
]);

export const ownershipSchema = z.enum(['built', 'owned', 'used', 'led']);
export const scopeSchema = z.enum(['personal', 'team', 'production']);

/** One raw skill claim as returned by the LLM extractor (§5 JSON shape), before
 * merge/scoring. Every field the model could omit is optional; validated
 * BEFORE any DB write (backend/CLAUDE.md: untrusted LLM output over untrusted
 * resume text gets the same "validate before it reaches a service" treatment). */
export const resumeSkillClaimSchema = z.object({
  skill_id: architectureSkillIdSchema,
  subskills: z.array(z.string().min(1).max(60)).max(10).optional(),
  evidence_text: z.string().max(2000).nullable().optional(),
  evidence_kind: evidenceKindSchema,
  recency_years: z.number().min(0).max(60).nullable().optional(),
  ownership: ownershipSchema.nullable().optional(),
  scope: scopeSchema.nullable().optional(),
  confidence: z.number().min(0).max(1),
});
export type RawSkillClaimInput = z.infer<typeof resumeSkillClaimSchema>;

/** Body contract for POST /api/portal/cape/diagnostic/:skillId/submit. */
export const diagnosticTriggerSchema = z.enum(['diagnostic_prompt', 'test_out']);
export const diagnosticAnswerSchema = z.object({
  item_id: z.string().min(1).max(60),
  selected_option: z.string().min(1).max(60),
});
export const diagnosticSubmitSchema = z.object({
  attempt_id: z.string().min(1).max(100),
  answers: z.array(diagnosticAnswerSchema).min(1).max(5),
  trigger: diagnosticTriggerSchema.optional(),
});
export type DiagnosticSubmitInput = z.infer<typeof diagnosticSubmitSchema>;

/**
 * CAPE Phase 3 (design doc §7, §13) — curriculum-to-skill mapping contracts. These are
 * the real, exported Zod counterparts of the `ArchitectureSkillImpact` /
 * `LearningPlacementContract` TypeScript interfaces defined in
 * `backend/src/models/CurriculumSkillMap.ts` — keep both definitions in sync by hand
 * (Zod schemas can't be derived from a plain `interface`).
 */

export const evidenceBandNameSchema = z.enum(['claim', 'knowledge', 'application', 'judgment']);
export const creditStrengthSchema = z.enum(['none', 'low', 'medium', 'high', 'capstone']);

/** One entry of an `ArchitectureSkillImpact[]` array. `max_credit` may be 0 only when
 * `credit_strength:'none'` (an explicit zero-credit declaration, design doc §17 AC 4) —
 * enforced by the array-level refine below rather than per-item, since "0 is valid" is
 * conditional on the sibling field. */
export const architectureSkillImpactSchema = z.object({
  skill_id: architectureSkillIdSchema,
  weight: z.number().min(0).max(1),
  bands: z.array(evidenceBandNameSchema).min(1),
  credit_strength: creditStrengthSchema,
  evidence_required: z.boolean(),
  max_credit: z.number().min(0),
});

/** An empty array is a valid, explicit zero-credit declaration (§17 AC 4) — a
 * non-empty array's weights must sum to 1.0 so no single skill can be silently
 * over- or under-credited relative to the others it's split across (§6). */
export const architectureSkillImpactListSchema = z.array(architectureSkillImpactSchema).refine((impacts) => {
  if (impacts.length === 0) return true;
  const sum = impacts.reduce((s, i) => s + i.weight, 0);
  return Math.abs(sum - 1) < 0.001;
}, { message: 'skill_impacts weights must sum to 1.0 (or the array must be empty for an explicit zero-credit declaration)' });

export const prerequisiteSkillRefSchema = z.object({
  skill_id: architectureSkillIdSchema,
  min_placement: z.number().min(0).max(100),
});

export const recommendedRangeSchema = z.object({
  min: z.number().min(0).max(100),
  max: z.number().min(0).max(100),
}).refine((v) => v.min <= v.max, { message: 'recommended_range.min must be <= max' });

/** design doc §7 `LearningPlacementContract`. */
export const learningPlacementContractSchema = z.object({
  skill_impacts: architectureSkillImpactListSchema,
  prerequisite_skills: z.array(prerequisiteSkillRefSchema).default([]),
  recommended_range: recommendedRangeSchema,
  freshness_days: z.number().int().positive().nullable().optional(),
  reviewable: z.boolean().default(true),
});
export type LearningPlacementContractInput = z.infer<typeof learningPlacementContractSchema>;

export const curriculumSkillMapScopeSchema = z.enum(['type', 'week', 'card']);
export const curriculumSkillMapSourceSchema = z.enum(['human', 'ai_suggested']);

/** Input contract for capeCurriculumSkillMapService.createOrVersionMapping(). Exactly
 * one scope key must be set, matching `scope_type` (never two, never zero — a mapping
 * always resolves to a single, unambiguous scope). */
export const curriculumSkillMapCreateSchema = z.object({
  scope_type: curriculumSkillMapScopeSchema,
  type_slug: z.string().min(1).max(100).nullable().optional(),
  week_number: z.number().int().min(0).max(52).nullable().optional(),
  card_id: z.string().uuid().nullable().optional(),
  skill_impacts: architectureSkillImpactListSchema,
  prerequisite_skills: z.array(prerequisiteSkillRefSchema).default([]),
  recommended_range: recommendedRangeSchema,
  freshness_days: z.number().int().positive().nullable().optional(),
  reviewable: z.boolean().default(true),
  source: curriculumSkillMapSourceSchema.default('human'),
  created_by: z.string().max(255).nullable().optional(),
}).refine((v) => {
  const keys = [v.type_slug, v.week_number, v.card_id].filter((k) => k !== null && k !== undefined);
  if (v.scope_type === 'type') return v.type_slug != null && v.week_number == null && v.card_id == null;
  if (v.scope_type === 'week') return v.week_number != null && v.type_slug == null && v.card_id == null;
  if (v.scope_type === 'card') return v.card_id != null && v.type_slug == null && v.week_number == null;
  return keys.length === 1;
}, { message: 'exactly one of type_slug/week_number/card_id must be set, matching scope_type' });
export type CurriculumSkillMapCreateInput = z.infer<typeof curriculumSkillMapCreateSchema>;

/** Input contract for capeSkillPrerequisiteService.upsert(). A skill cannot be its own
 * prerequisite (a self-referencing edge would create a trivial cycle). */
export const architectureSkillPrerequisiteInputSchema = z.object({
  skill_id: architectureSkillIdSchema,
  prerequisite_skill_id: architectureSkillIdSchema,
  min_placement: z.number().min(0).max(100).default(0),
  created_by: z.string().max(255).nullable().optional(),
}).refine((v) => v.skill_id !== v.prerequisite_skill_id, {
  message: 'skill_id and prerequisite_skill_id must differ (no self-referencing edge)',
});
export type ArchitectureSkillPrerequisiteInput = z.infer<typeof architectureSkillPrerequisiteInputSchema>;

/** Admin PUT /api/admin/cape/evidence-band-weights body — must sum to 1.0 (±0.001). */
export const updateEvidenceBandWeightsSchema = z.object({
  claim_weight: z.number().min(0).max(1),
  knowledge_weight: z.number().min(0).max(1),
  application_weight: z.number().min(0).max(1),
  judgment_weight: z.number().min(0).max(1),
  reason: z.string().max(500).nullable().optional(),
}).refine((v) => {
  const sum = v.claim_weight + v.knowledge_weight + v.application_weight + v.judgment_weight;
  return Math.abs(sum - 1) < 0.001;
}, { message: 'claim_weight + knowledge_weight + application_weight + judgment_weight must sum to 1.0' });
export type UpdateEvidenceBandWeightsInput = z.infer<typeof updateEvidenceBandWeightsSchema>;

/**
 * CAPE Phase 5 (design doc §10, §11, §16 Phase 5) — Today Plan + learner
 * controls contracts.
 */

/** Response contract for GET /api/portal/cape/today-plan. Loosely typed
 * (passthrough-friendly) on the TodayFeedItem-derived fields — this schema's
 * job is to validate the Phase 5 ADDITIONS (slot, chips), not to re-declare
 * the entire TodayFeedItem shape a second time (that type already lives in
 * todayFeedComposer.ts and is not duplicated here per DRY). */
export const todayPlanSlotSchema = z.enum(['next_best', 'foundation', 'practice', 'ai_pulse', 'review']);
export const cardLevelSchema = z.enum(['Foundation', 'Working', 'Stretch', 'Architect']);
export const cardProofSchema = z.enum(['Learn', 'Check', 'Build', 'Decide']);
export const cardChipsSchema = z.object({
  why_this: z.string().min(1),
  level: cardLevelSchema,
  proof: cardProofSchema,
});
export const todayPlanItemSchema = z.object({
  slot: todayPlanSlotSchema,
  chips: cardChipsSchema,
}).passthrough();
export const lifecycleModeSchema = z.enum([
  'foundation', 'experienced_cold_start', 'active_builder', 'architect_track', 'returning_after_absence',
]);
export const todayPlanResponseSchema = z.object({
  mode: lifecycleModeSchema,
  items: z.array(todayPlanItemSchema).max(5),
  estimated_total_minutes: z.number().min(0),
});
export type TodayPlanResponse = z.infer<typeof todayPlanResponseSchema>;

/** Body contract for POST /api/portal/cape/today-plan/feedback. */
export const todayPlanFeedbackActionSchema = z.enum([
  'more_like_this', 'less_like_this', 'already_know', 'too_easy', 'too_advanced', 'not_interested',
]);
export const todayPlanFeedbackInputSchema = z.object({
  ref: z.string().min(1).max(255),
  action: todayPlanFeedbackActionSchema,
});
export type TodayPlanFeedbackInput = z.infer<typeof todayPlanFeedbackInputSchema>;

/** Body contract for POST /api/portal/cape/today-plan/test-out. */
export const todayPlanTestOutInputSchema = z.object({
  ref: z.string().min(1).max(255),
});
export type TodayPlanTestOutInput = z.infer<typeof todayPlanTestOutInputSchema>;

/** Response contract for GET /api/portal/cape/skill-profile/:skillId/evidence. */
export const skillEvidenceRowSchema = z.object({
  band: evidenceBandSchema,
  credit: z.number(),
  source: z.string(),
  created_at: z.string(),
});
export const skillEvidenceHistoryResponseSchema = z.object({
  skill_id: architectureSkillIdSchema,
  placement: z.number(),
  verified: z.number(),
  evidence: z.array(skillEvidenceRowSchema).max(50),
  next_review_at: z.string().nullable(),
  next_recommended_proof: z.string().nullable(),
});
export type SkillEvidenceHistoryResponse = z.infer<typeof skillEvidenceHistoryResponseSchema>;

/**
 * CAPE Phase 6 (design doc §12 "Pacing controls", §16 Phase 6) — the governance
 * policy covering Stage 4 rerank caps (previously hardcoded constants in
 * capeLearningValuePolicy.ts) and Today Plan pacing knobs (previously implicit
 * in capeTodayPlanService.ts). Body contract for PUT /api/admin/cape/governance/policy.
 * All fields optional (partial patch, same convention as updateSkillDefinitionSchema)
 * but at least one must be present.
 */
export const updateGovernancePolicySchema = z.object({
  same_type_max_streak: z.number().int().min(1).max(10).optional(),
  passive_max_streak: z.number().int().min(1).max(10).optional(),
  crowd_out_max_per_skill: z.number().int().min(1).max(10).optional(),
  crowd_out_window: z.number().int().min(1).max(20).optional(),
  stretch_cap_first_five: z.number().int().min(0).max(5).optional(),
  daily_plan_target_minutes: z.number().int().min(1).max(999).optional(),
  review_slot_share: z.number().min(0).max(1).optional(),
  ai_pulse_slot_share: z.number().min(0).max(1).optional(),
  reason: z.string().max(500).nullable().optional(),
}).refine(
  (v) => Object.entries(v).some(([k, val]) => k !== 'reason' && val !== undefined),
  { message: 'at least one policy field must be provided' },
);
export type UpdateGovernancePolicyInput = z.infer<typeof updateGovernancePolicySchema>;

/**
 * CAPE Phase 6 (design doc §10 "Lifecycle mixes", §12 "Learner-stage policies") —
 * PUT /api/admin/cape/governance/lifecycle-modes/:mode body contract. `mix` is a
 * free-form category->percentage map (each mode's category set differs per §10's
 * table) that must sum to ~1.0 (±0.001, same tolerance as
 * updateEvidenceBandWeightsSchema above). Reuses `lifecycleModeSchema` (already
 * defined above for the Phase 5 Today Plan contract) as the single source of
 * truth for the 5 valid mode values — not redefined here.
 */
export const updateLifecycleModeMixSchema = z.object({
  mix: z.record(z.string().min(1).max(60), z.number().min(0).max(1))
    .refine((m) => Object.keys(m).length >= 1, { message: 'mix must have at least one category' })
    .refine((m) => Math.abs(Object.values(m).reduce((s, v) => s + v, 0) - 1) < 0.001, {
      message: 'mix percentages must sum to 1.0',
    }),
  reason: z.string().max(500).nullable().optional(),
});
export type UpdateLifecycleModeMixInput = z.infer<typeof updateLifecycleModeMixSchema>;
