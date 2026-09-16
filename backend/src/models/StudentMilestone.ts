import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * StudentMilestone — one row per program milestone a student has reached.
 * Append-only and latched: a row is written once, on first satisfaction, and
 * never updated or deleted by the platform (decision D5, 2026-09-16). The
 * promotion engine counts these rows; nothing else moves a build band.
 *
 *   milestone_type            source_ref
 *   curriculum_complete       'curriculum'          (one per enrollment)
 *   project_complete          <project id>          (one per completed project)
 *   certification_approved    <student_certifications.id>
 *
 * `evidence` records what justified the latch at the moment it was written
 * (week counts, story ids, the approving staff member), so a later tightening
 * of a definition can be audited against what was true then.
 */
export type StudentMilestoneType = 'curriculum_complete' | 'project_complete' | 'certification_approved';

export interface StudentMilestoneAttributes {
  id?: string;
  enrollment_id: string;
  milestone_type: StudentMilestoneType;
  source_ref: string;
  achieved_at: Date;
  evidence?: Record<string, unknown> | null;
  created_at?: Date;
}

class StudentMilestone extends Model<StudentMilestoneAttributes> implements StudentMilestoneAttributes {
  declare id: string;
  declare enrollment_id: string;
  declare milestone_type: StudentMilestoneType;
  declare source_ref: string;
  declare achieved_at: Date;
  declare evidence: Record<string, unknown> | null;
  declare created_at: Date;
}

StudentMilestone.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    enrollment_id: { type: DataTypes.UUID, allowNull: false },
    milestone_type: { type: DataTypes.STRING(40), allowNull: false },
    source_ref: { type: DataTypes.STRING(150), allowNull: false },
    achieved_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    evidence: { type: DataTypes.JSONB, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'student_milestones',
    timestamps: false,
    indexes: [
      { unique: true, fields: ['enrollment_id', 'milestone_type', 'source_ref'], name: 'uq_student_milestones_key' },
      { fields: ['enrollment_id'], name: 'idx_student_milestones_enrollment' },
    ],
  }
);

export default StudentMilestone;
