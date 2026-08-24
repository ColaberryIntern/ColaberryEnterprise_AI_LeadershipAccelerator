import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * CareerPublicationApproval — one human decision about one snapshot.
 *
 * Build plan §22 requires persisting the reviewer, decision, comments, timestamp AND
 * the exact snapshot reviewed. Keeping it here rather than on the snapshot row is what
 * lets the snapshot stay genuinely append-only.
 *
 * UNIQUE on snapshot_id: a reviewer double-clicking "Approve" is an explicitly listed
 * failure case (plan §63), and the second write must lose at the database rather than
 * rely on the service remembering to check first.
 */
export type ReviewDecision = 'approved' | 'changes_requested' | 'rejected';

class CareerPublicationApproval extends Model {
  declare id: string;
  declare snapshot_id: string;
  declare publication_id: string;
  declare decision: ReviewDecision;
  declare reviewer_id: string;
  declare reviewer_email: string | null;
  declare reviewer_notes: string | null;
  declare decided_at: Date;
  declare created_at: Date;
}

CareerPublicationApproval.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    snapshot_id: { type: DataTypes.UUID, allowNull: false, unique: true },
    publication_id: { type: DataTypes.UUID, allowNull: false },
    decision: { type: DataTypes.STRING(24), allowNull: false },
    reviewer_id: { type: DataTypes.STRING(255), allowNull: false },
    reviewer_email: { type: DataTypes.STRING(255), allowNull: true },
    reviewer_notes: { type: DataTypes.TEXT, allowNull: true },
    decided_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  { sequelize, tableName: 'career_publication_approvals', underscored: true, timestamps: false },
);

export default CareerPublicationApproval;
