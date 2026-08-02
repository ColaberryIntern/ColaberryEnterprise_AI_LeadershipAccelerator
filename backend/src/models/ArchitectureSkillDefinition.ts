import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import { ARCHITECTURE_SKILL_IDS, ArchitectureSkillId } from '../constants/architectureSkills';

export { ARCHITECTURE_SKILL_IDS, ArchitectureSkillId };

/**
 * ArchitectureSkillDefinition — the versioned, backend-owned 10-axis CAPE skill
 * ontology (design doc §3). Only one row per `skill_id` may have `is_current=true`
 * at a time; edits INSERT a new version and flip the prior row's `is_current` to
 * false (see capeSkillDefinitionsService.ts) — never an in-place UPDATE of name/
 * description/axis_order on a row that's already been read by a learner-facing
 * response, so historical versions stay inspectable.
 *
 * `crosswalk_competencies` — string[] of existing 11 promotion-competency
 * `domain_id`s (see CompetencyDomain.ts / progression/seeders.ts
 * COMPETENCY_DOMAINS) this Architecture Skill maps to (design doc §3 crosswalk
 * table). Reference-only in Phase 0-1 — nothing here writes to EvidenceRecord or
 * StudentCompetency.
 */
export interface ArchitectureSkillDefinitionAttributes {
  id?: string;
  skill_id: ArchitectureSkillId;
  version: number;
  name: string;
  description?: string | null;
  axis_order: number;
  crosswalk_competencies: string[];
  is_current: boolean;
  is_active: boolean;
  created_by?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class ArchitectureSkillDefinition extends Model<ArchitectureSkillDefinitionAttributes>
  implements ArchitectureSkillDefinitionAttributes {
  declare id: string;
  declare skill_id: ArchitectureSkillId;
  declare version: number;
  declare name: string;
  declare description: string | null;
  declare axis_order: number;
  declare crosswalk_competencies: string[];
  declare is_current: boolean;
  declare is_active: boolean;
  declare created_by: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

ArchitectureSkillDefinition.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    skill_id: { type: DataTypes.STRING(40), allowNull: false },
    version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    name: { type: DataTypes.STRING(150), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    axis_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    crosswalk_competencies: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    is_current: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_by: { type: DataTypes.STRING(255), allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'architecture_skill_definitions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { unique: true, fields: ['skill_id', 'version'] },
      { fields: ['axis_order'] },
    ],
  }
);

export default ArchitectureSkillDefinition;
