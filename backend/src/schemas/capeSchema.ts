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
