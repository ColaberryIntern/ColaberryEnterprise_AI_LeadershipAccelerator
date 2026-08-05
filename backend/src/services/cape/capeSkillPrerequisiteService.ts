/**
 * capeSkillPrerequisiteService — minimal CRUD over `architecture_skill_prerequisites`
 * (design doc §13, the Architecture Skill graph). Plain config-table semantics
 * (execution-contract.md Assumption 1) — `upsert` updates `min_placement` in place for
 * an existing active edge rather than duplicating it; `deactivate` sets
 * `is_active:false` rather than deleting, so changes stay reversible/auditable without
 * the append-only ledger machinery a true evidence stream needs.
 *
 * Consumed by Phase 4's ranker (not built in this phase) and by card-level
 * "prerequisite" overrides (design doc §7, §12).
 */
import ArchitectureSkillPrerequisite from '../../models/ArchitectureSkillPrerequisite';
import { architectureSkillPrerequisiteInputSchema, ArchitectureSkillPrerequisiteInput } from '../../schemas/capeSchema';

export class CapeSkillPrerequisiteValidationError extends Error {
  error_class = 'ValidationError';
  status = 400;
  constructor(message: string) { super(message); this.name = 'CapeSkillPrerequisiteValidationError'; }
}

/** All active prerequisite edges, optionally filtered to one target skill. */
export async function list(skillId?: string): Promise<ArchitectureSkillPrerequisite[]> {
  const where: any = { is_active: true };
  if (skillId) where.skill_id = skillId;
  return ArchitectureSkillPrerequisite.findAll({ where, order: [['skill_id', 'ASC'], ['prerequisite_skill_id', 'ASC']] });
}

/**
 * Create the edge if it doesn't exist (active or not); if an ACTIVE edge for the same
 * pair already exists, update its `min_placement` in place rather than inserting a
 * duplicate row. If an inactive edge exists for the pair, reactivate it with the new
 * `min_placement` (reversible — matches `deactivate`'s own non-destructive contract).
 */
export async function upsert(input: ArchitectureSkillPrerequisiteInput): Promise<ArchitectureSkillPrerequisite> {
  const parsed = architectureSkillPrerequisiteInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new CapeSkillPrerequisiteValidationError(parsed.error.issues.map((i) => i.message).join('; '));
  }
  const v = parsed.data;

  const existing = await ArchitectureSkillPrerequisite.findOne({
    where: { skill_id: v.skill_id, prerequisite_skill_id: v.prerequisite_skill_id },
  });
  if (existing) {
    await existing.update({ min_placement: v.min_placement, is_active: true, created_by: v.created_by ?? existing.created_by });
    return existing;
  }
  return ArchitectureSkillPrerequisite.create({
    skill_id: v.skill_id,
    prerequisite_skill_id: v.prerequisite_skill_id,
    min_placement: v.min_placement,
    is_active: true,
    created_by: v.created_by ?? null,
  } as any);
}

/** Deactivates (never deletes) an edge. A no-op — not an error — if the edge doesn't exist. */
export async function deactivate(skillId: string, prerequisiteSkillId: string): Promise<{ deactivated: boolean }> {
  const existing = await ArchitectureSkillPrerequisite.findOne({
    where: { skill_id: skillId, prerequisite_skill_id: prerequisiteSkillId },
  });
  if (!existing) return { deactivated: false };
  await existing.update({ is_active: false });
  return { deactivated: true };
}
