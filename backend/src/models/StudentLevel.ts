import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * StudentLevel — a student's current Builder level + the evidence snapshot
 * that justified the last promotion. One row per enrollment.
 */
export interface StudentLevelAttributes {
  id?: string;
  enrollment_id: string;
  level_slug: string;
  rank: number;
  architect_readiness?: number;   // hidden composite score at last eval
  promotion_evidence?: any;
  ai_approval?: any;
  promoted_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

class StudentLevel extends Model<StudentLevelAttributes> implements StudentLevelAttributes {
  declare id: string;
  declare enrollment_id: string;
  declare level_slug: string;
  declare rank: number;
  declare architect_readiness: number;
  declare promotion_evidence: any;
  declare ai_approval: any;
  declare promoted_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

StudentLevel.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    enrollment_id: { type: DataTypes.UUID, allowNull: false, unique: true },
    level_slug: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'builder' },
    rank: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    architect_readiness: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
    promotion_evidence: { type: DataTypes.JSONB, allowNull: true },
    ai_approval: { type: DataTypes.JSONB, allowNull: true },
    promoted_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'student_level',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [{ unique: true, fields: ['enrollment_id'] }],
  }
);

export default StudentLevel;
