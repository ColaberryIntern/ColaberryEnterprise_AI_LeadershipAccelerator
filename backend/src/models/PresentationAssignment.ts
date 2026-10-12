import { DataTypes, Model } from 'sequelize';
import { AUDIENCE_MAX } from '../schemas/presentationFieldLimits';
import { sequelize } from '../config/database';

/**
 * "This student owes this presentation for this prep task."
 *
 * `story_id` is the PREP-n string, not a uuid — it matches `student_tasks.story_id`,
 * the identity the whole prep subsystem already keys on. Using the same key is what
 * lets an assignment find its task without a mapping table that could drift.
 *
 * `template_version` is a frozen VALUE, not a pointer: an instructor editing a
 * template must not retroactively change what a student was already asked to do.
 *
 * This row never implies completion. `markTaskVerifiedComplete` remains the only
 * writer that may set a task complete.
 */
export type PresentationPrepState =
  | 'not_started' | 'learning' | 'preparing' | 'building' | 'ready';

export interface PresentationAssignmentAttributes {
  id?: string;
  project_id: string;
  story_id: string;
  enrollment_id?: string | null;
  cohort_id?: string | null;
  template_slug: string;
  template_version?: number;
  audience?: string | null;
  duration_seconds?: number | null;
  due_on?: string | null;
  required?: boolean;
  prep_state?: PresentationPrepState;
  checklist_json?: Record<string, unknown>;
  created_at?: Date;
  updated_at?: Date;
}

class PresentationAssignment
  extends Model<PresentationAssignmentAttributes>
  implements PresentationAssignmentAttributes {
  declare id: string;
  declare project_id: string;
  declare story_id: string;
  declare enrollment_id: string | null;
  declare cohort_id: string | null;
  declare template_slug: string;
  declare template_version: number;
  declare audience: string | null;
  declare duration_seconds: number | null;
  declare due_on: string | null;
  declare required: boolean;
  declare prep_state: PresentationPrepState;
  declare checklist_json: Record<string, unknown>;
  declare created_at: Date;
  declare updated_at: Date;
}

PresentationAssignment.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    project_id: { type: DataTypes.UUID, allowNull: false },
    story_id: { type: DataTypes.STRING(60), allowNull: false },
    enrollment_id: { type: DataTypes.UUID, allowNull: true },
    cohort_id: { type: DataTypes.UUID, allowNull: true },
    template_slug: { type: DataTypes.STRING(80), allowNull: false },
    template_version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    audience: { type: DataTypes.STRING(AUDIENCE_MAX), allowNull: true },
    duration_seconds: { type: DataTypes.INTEGER, allowNull: true },
    due_on: { type: DataTypes.DATEONLY, allowNull: true },
    // Defaults closed: nothing is required of a student by omission.
    required: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    prep_state: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'not_started' },
    checklist_json: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  },
  {
    sequelize,
    tableName: 'presentation_assignments',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { unique: true, fields: ['project_id', 'story_id'], name: 'presentation_assignments_unique_task' },
      { fields: ['enrollment_id'], name: 'presentation_assignments_enrollment' },
      { fields: ['cohort_id'], name: 'presentation_assignments_cohort' },
    ],
  },
);

export default PresentationAssignment;
