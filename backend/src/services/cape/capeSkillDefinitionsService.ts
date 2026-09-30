/**
 * capeSkillDefinitionsService — admin CRUD over the versioned CAPE skill ontology
 * (design doc §12 "Phase 0-1 minimal settings panel"). An edit never mutates a
 * row in place: it diffs the patch against the current row, and only if the
 * patch actually changes something does it insert a NEW version row and flip the
 * prior row's `is_current` to false (same "insert-new-version" contract as
 * capeEvidenceBandWeightsService.ts). An identical-value PUT is a no-op —
 * idempotent, no phantom version bump.
 */
import { Transaction } from 'sequelize';
import { sequelize } from '../../config/database';
import ArchitectureSkillDefinition from '../../models/ArchitectureSkillDefinition';
import { UpdateSkillDefinitionInput } from '../../schemas/capeSchema';

export class SkillDefinitionNotFoundError extends Error {
  status = 404;
  constructor(skillId: string) { super(`no current skill definition for "${skillId}"`); this.name = 'SkillDefinitionNotFoundError'; }
}

export async function listCurrentSkillDefinitions(): Promise<ArchitectureSkillDefinition[]> {
  return ArchitectureSkillDefinition.findAll({ where: { is_current: true }, order: [['axis_order', 'ASC']] });
}

export async function getSkillDefinitionHistory(skillId: string): Promise<ArchitectureSkillDefinition[]> {
  return ArchitectureSkillDefinition.findAll({ where: { skill_id: skillId }, order: [['version', 'ASC']] });
}

function isUnchanged(current: ArchitectureSkillDefinition, patch: UpdateSkillDefinitionInput): boolean {
  const nameSame = patch.name === undefined || patch.name === current.name;
  const descSame = patch.description === undefined || (patch.description ?? null) === (current.description ?? null);
  const orderSame = patch.axis_order === undefined || patch.axis_order === current.axis_order;
  return nameSame && descSame && orderSame;
}

/**
 * Update one skill definition. No-op (returns the unchanged current row) if the
 * patch is identical to the current values; otherwise inserts version+1 and
 * flips the prior row's is_current, in a single transaction.
 */
export async function updateSkillDefinition(
  skillId: string,
  patch: UpdateSkillDefinitionInput,
  adminId?: string
): Promise<{ definition: ArchitectureSkillDefinition; versioned: boolean }> {
  const current = await ArchitectureSkillDefinition.findOne({ where: { skill_id: skillId, is_current: true } });
  if (!current) throw new SkillDefinitionNotFoundError(skillId);

  if (isUnchanged(current, patch)) {
    return { definition: current, versioned: false };
  }

  return sequelize.transaction(async (t: Transaction) => {
    await current.update({ is_current: false }, { transaction: t });
    const next = await ArchitectureSkillDefinition.create({
      skill_id: current.skill_id,
      version: current.version + 1,
      name: patch.name ?? current.name,
      description: patch.description !== undefined ? patch.description : current.description,
      axis_order: patch.axis_order ?? current.axis_order,
      crosswalk_competencies: current.crosswalk_competencies,
      is_current: true,
      is_active: current.is_active,
      created_by: adminId ?? null,
    }, { transaction: t });
    return { definition: next, versioned: true };
  });
}
