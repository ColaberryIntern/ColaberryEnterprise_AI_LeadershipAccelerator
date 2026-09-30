import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import type { ExplorerExperimentVariant } from '../types/explorerGrowth';

/**
 * explorer_experiment_assignments — APPEND-ONLY holdout record.
 * Plan: docs/EXPLORER_GROWTH_OS_PLAN.md §5.4 T4, §25.
 *
 * Assignment is a DETERMINISTIC HASH of (experiment_key, enrollment_id), so this
 * row is a RECORD of what the hash produced, not the source of truth. That
 * distinction matters: a lost or un-written row cannot flip anyone's arm, and
 * two services computing assignment independently cannot disagree.
 *
 * `assignment_hash` is stored so an assignment can be audited later without
 * re-deriving it from a hash function that may have changed.
 *
 * UNIQUE (experiment_key, enrollment_id).
 */


interface ExplorerExperimentAssignmentAttributes {
  id?: string;
  experiment_key: string;
  enrollment_id: string;
  variant: ExplorerExperimentVariant;
  assignment_hash: string;
  assigned_at?: Date;
}

class ExplorerExperimentAssignment
  extends Model<ExplorerExperimentAssignmentAttributes>
  implements ExplorerExperimentAssignmentAttributes
{
  declare id: string;
  declare experiment_key: string;
  declare enrollment_id: string;
  declare variant: ExplorerExperimentVariant;
  declare assignment_hash: string;
  declare assigned_at: Date;
}

ExplorerExperimentAssignment.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    experiment_key: { type: DataTypes.STRING(64), allowNull: false },
    enrollment_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'enrollments', key: 'id' },
    },
    variant: { type: DataTypes.STRING(24), allowNull: false },
    assignment_hash: {
      type: DataTypes.STRING(64),
      allowNull: false,
      comment: 'The hash that produced this arm, kept so the assignment stays auditable.',
    },
    assigned_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'explorer_experiment_assignments',
    timestamps: false,
  },
);

export default ExplorerExperimentAssignment;
