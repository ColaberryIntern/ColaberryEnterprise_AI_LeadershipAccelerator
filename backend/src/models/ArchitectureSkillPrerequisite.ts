import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * ArchitectureSkillPrerequisite — the Architecture Skill graph (design doc §13):
 * "skill X requires at least Y placement in skill Z first." A plain CRUD config table
 * (execution-contract.md Assumption 1) — not append-only/versioned like the skill
 * ontology or evidence ledger, since it's graph configuration, not a ledger. An edge is
 * deactivated (`is_active:false`), never deleted, so changes stay reversible/auditable.
 *
 * Consumed by Phase 4's ranker (not built in this phase) and by card-level
 * "prerequisite" overrides (design doc §7, §12). Building the data contract correctly
 * now — even though nothing reads it yet — per the in-request instruction.
 */
export interface ArchitectureSkillPrerequisiteAttributes {
  id?: string;
  skill_id: string;
  prerequisite_skill_id: string;
  min_placement: number;
  is_active: boolean;
  created_by?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class ArchitectureSkillPrerequisite extends Model<ArchitectureSkillPrerequisiteAttributes>
  implements ArchitectureSkillPrerequisiteAttributes {
  declare id: string;
  declare skill_id: string;
  declare prerequisite_skill_id: string;
  declare min_placement: number;
  declare is_active: boolean;
  declare created_by: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

ArchitectureSkillPrerequisite.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    skill_id: { type: DataTypes.STRING(40), allowNull: false },
    prerequisite_skill_id: { type: DataTypes.STRING(40), allowNull: false },
    min_placement: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_by: { type: DataTypes.STRING(255), allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'architecture_skill_prerequisites',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { unique: true, fields: ['skill_id', 'prerequisite_skill_id'] },
    ],
  }
);

export default ArchitectureSkillPrerequisite;
