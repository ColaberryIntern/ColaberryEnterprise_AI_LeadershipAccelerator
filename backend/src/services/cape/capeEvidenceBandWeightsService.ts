/**
 * capeEvidenceBandWeightsService — admin CRUD over the versioned evidence-band
 * weights (design doc §6, §12). Sum-to-1.0 is enforced by the Zod schema before
 * this module is ever called (Assumption 3, execution-contract.md). A change
 * NEVER updates the current row in place — it inserts a new version and flips
 * the prior row's is_current, so `student_architecture_skill.weights_version`
 * always points at a real, retained historical row (auditable, reversible: the
 * old version is still fully readable via history, never overwritten).
 */
import { Transaction } from 'sequelize';
import { sequelize } from '../../config/database';
import ArchitectureSkillEvidenceBandWeights from '../../models/ArchitectureSkillEvidenceBandWeights';
import { UpdateEvidenceBandWeightsInput } from '../../schemas/capeSchema';

export async function getCurrentWeightsRow(): Promise<ArchitectureSkillEvidenceBandWeights | null> {
  return ArchitectureSkillEvidenceBandWeights.findOne({ where: { is_current: true } });
}

export async function getWeightsHistory(): Promise<ArchitectureSkillEvidenceBandWeights[]> {
  return ArchitectureSkillEvidenceBandWeights.findAll({ order: [['version', 'ASC']] });
}

function isUnchanged(current: ArchitectureSkillEvidenceBandWeights, patch: UpdateEvidenceBandWeightsInput): boolean {
  const eq = (a: number, b: number) => Math.abs(a - b) < 1e-9;
  return eq(Number(current.claim_weight), patch.claim_weight)
    && eq(Number(current.knowledge_weight), patch.knowledge_weight)
    && eq(Number(current.application_weight), patch.application_weight)
    && eq(Number(current.judgment_weight), patch.judgment_weight);
}

/**
 * Update the evidence-band weights. No-op if identical to the current values;
 * otherwise inserts a new version row and flips the prior current row, in a
 * single transaction. Caller (route) must validate sum-to-1.0 via
 * updateEvidenceBandWeightsSchema BEFORE calling this — this function trusts its
 * input is already validated (single responsibility: this module owns
 * versioning, not arithmetic validation).
 */
export async function updateWeights(
  patch: UpdateEvidenceBandWeightsInput,
  adminId?: string
): Promise<{ weights: ArchitectureSkillEvidenceBandWeights; versioned: boolean }> {
  const current = await getCurrentWeightsRow();
  if (current && isUnchanged(current, patch)) {
    return { weights: current, versioned: false };
  }

  return sequelize.transaction(async (t: Transaction) => {
    if (current) await current.update({ is_current: false }, { transaction: t });
    const nextVersion = (current?.version ?? 0) + 1;
    const next = await ArchitectureSkillEvidenceBandWeights.create({
      version: nextVersion,
      claim_weight: patch.claim_weight,
      knowledge_weight: patch.knowledge_weight,
      application_weight: patch.application_weight,
      judgment_weight: patch.judgment_weight,
      is_current: true,
      created_by: adminId ?? null,
      reason: patch.reason ?? null,
    }, { transaction: t });
    return { weights: next, versioned: true };
  });
}
