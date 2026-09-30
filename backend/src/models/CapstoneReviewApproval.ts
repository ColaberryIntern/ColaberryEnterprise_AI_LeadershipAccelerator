import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * CapstoneReviewApproval — one review of one version of a Capstone Record.
 *
 * The row is created when a learner REQUESTS review (decision null) and stamped when a
 * human decides. One row therefore carries the whole exchange: who asked, for which
 * version, who decided, what they said, and when.
 *
 * `decision IS NULL` is the pending state, which is why "in review" can be derived rather
 * than added as a fourth value to `capstone_records.status`. Capstone's status enum stays
 * exactly as its author designed it, so nothing else reading that column has to learn a
 * new value.
 *
 * Replaces `career_publication_approvals` from the pre-convergence design. The snapshot
 * and version tables that sat alongside it were dropped: `capstone_records` and
 * `capstone_record_versions` already did that job.
 */
export type CapstoneDecision = 'approved' | 'changes_requested' | 'rejected';

class CapstoneReviewApproval extends Model {
  declare id: string;
  declare record_id: string;
  /** Denormalised from the record so the reviewer queue can scope without a join. */
  declare enrollment_id: string;
  /** The exact record version reviewed — plan §22 requires the decision name it. */
  declare version: number;
  declare requested_at: Date;
  /** NULL until a human decides. That is the pending state. */
  declare decision: CapstoneDecision | null;
  declare reviewer_id: string | null;
  declare reviewer_email: string | null;
  declare reviewer_notes: string | null;
  declare decided_at: Date | null;
  declare created_at: Date;
}

CapstoneReviewApproval.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    record_id: { type: DataTypes.UUID, allowNull: false },
    enrollment_id: { type: DataTypes.UUID, allowNull: false },
    version: { type: DataTypes.INTEGER, allowNull: false },
    requested_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    decision: { type: DataTypes.STRING(24), allowNull: true },
    reviewer_id: { type: DataTypes.STRING(255), allowNull: true },
    reviewer_email: { type: DataTypes.STRING(255), allowNull: true },
    reviewer_notes: { type: DataTypes.TEXT, allowNull: true },
    decided_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  { sequelize, tableName: 'capstone_review_approvals', underscored: true, timestamps: false },
);

export default CapstoneReviewApproval;
