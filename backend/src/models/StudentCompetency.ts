import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * StudentCompetency — a student's current confidence in one domain,
 * recomputed (not incremented) from their evidence, so recompute is
 * inherently idempotent. One row per (enrollment, domain).
 */
export interface StudentCompetencyAttributes {
  id?: string;
  enrollment_id: string;
  domain_id: string;
  confidence: number;        // 0..1
  evidence_count?: number;
  last_evidence_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

class StudentCompetency extends Model<StudentCompetencyAttributes> implements StudentCompetencyAttributes {
  declare id: string;
  declare enrollment_id: string;
  declare domain_id: string;
  declare confidence: number;
  declare evidence_count: number;
  declare last_evidence_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

StudentCompetency.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    enrollment_id: { type: DataTypes.UUID, allowNull: false },
    domain_id: { type: DataTypes.STRING(60), allowNull: false },
    confidence: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
    evidence_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    last_evidence_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'student_competency',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [{ unique: true, fields: ['enrollment_id', 'domain_id'] }, { fields: ['enrollment_id'] }],
  }
);

export default StudentCompetency;
