import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * ArchitectureSkillEvidenceBandWeights — the versioned weighting of the 4 evidence
 * bands (claim/knowledge/application/judgment) that combine into a skill's public
 * proficiency (design doc §6): `proficiency = claim_weight*claim +
 * knowledge_weight*knowledge + application_weight*application +
 * judgment_weight*judgment`. Default/seeded version 1 is 0.20/0.25/0.35/0.20.
 *
 * Only one row may have `is_current=true`. A weight change always INSERTs a new
 * version row (never UPDATEs an existing one) — see
 * capeEvidenceBandWeightsService.ts. Every `student_architecture_skill` row stamps
 * the `weights_version` that produced its `proficiency` number, so a weight change
 * is auditable without silently rewriting historical computed proficiency.
 */
export interface ArchitectureSkillEvidenceBandWeightsAttributes {
  id?: string;
  version: number;
  claim_weight: number;
  knowledge_weight: number;
  application_weight: number;
  judgment_weight: number;
  is_current: boolean;
  created_by?: string | null;
  reason?: string | null;
  created_at?: Date;
}

class ArchitectureSkillEvidenceBandWeights extends Model<ArchitectureSkillEvidenceBandWeightsAttributes>
  implements ArchitectureSkillEvidenceBandWeightsAttributes {
  declare id: string;
  declare version: number;
  declare claim_weight: number;
  declare knowledge_weight: number;
  declare application_weight: number;
  declare judgment_weight: number;
  declare is_current: boolean;
  declare created_by: string | null;
  declare reason: string | null;
  declare created_at: Date;
}

ArchitectureSkillEvidenceBandWeights.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    version: { type: DataTypes.INTEGER, allowNull: false },
    claim_weight: { type: DataTypes.DECIMAL(4, 3), allowNull: false },
    knowledge_weight: { type: DataTypes.DECIMAL(4, 3), allowNull: false },
    application_weight: { type: DataTypes.DECIMAL(4, 3), allowNull: false },
    judgment_weight: { type: DataTypes.DECIMAL(4, 3), allowNull: false },
    is_current: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_by: { type: DataTypes.STRING(255), allowNull: true },
    reason: { type: DataTypes.TEXT, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'architecture_skill_evidence_band_weights',
    timestamps: false,
    indexes: [
      { unique: true, fields: ['version'] },
    ],
  }
);

export default ArchitectureSkillEvidenceBandWeights;
