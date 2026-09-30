import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * BuilderLevel — the promotion ladder config (Builder .. Architect). Each
 * level declares the gate a student must clear to reach it. Promotion is
 * NEVER by XP alone: it requires competency + evidence + artifacts + GitHub +
 * evaluations + implementation + attendance + AI approval. Edited as data.
 */
export interface BuilderLevelAttributes {
  id?: string;
  slug: string;                 // 'builder', 'junior_builder', ... 'architect'
  rank: number;                 // 0..8
  label: string;
  required_competencies?: any;  // [{domain_id, min_confidence}]
  min_evidence?: number;
  min_artifacts?: number;
  min_github?: number;
  min_evaluations?: number;
  min_implementation?: number;
  min_attendance?: number;
  requires_ai_approval?: boolean;
  is_active?: boolean;
  created_at?: Date;
  updated_at?: Date;
}

class BuilderLevel extends Model<BuilderLevelAttributes> implements BuilderLevelAttributes {
  declare id: string;
  declare slug: string;
  declare rank: number;
  declare label: string;
  declare required_competencies: any;
  declare min_evidence: number;
  declare min_artifacts: number;
  declare min_github: number;
  declare min_evaluations: number;
  declare min_implementation: number;
  declare min_attendance: number;
  declare requires_ai_approval: boolean;
  declare is_active: boolean;
  declare created_at: Date;
  declare updated_at: Date;
}

BuilderLevel.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    slug: { type: DataTypes.STRING(40), allowNull: false, unique: true },
    rank: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    label: { type: DataTypes.STRING(80), allowNull: false },
    required_competencies: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    min_evidence: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    min_artifacts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    min_github: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    min_evaluations: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    min_implementation: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    min_attendance: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    requires_ai_approval: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'builder_levels',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [{ unique: true, fields: ['slug'] }, { fields: ['rank'] }],
  }
);

export default BuilderLevel;
