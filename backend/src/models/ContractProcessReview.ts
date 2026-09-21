import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * A reviewer's decision on a contract decomposition — currently 'changes_requested'. A COMPANION
 * record to the immutable, versioned contract_process_documents (never a status PATCH on the doc),
 * mirroring DeliveryChangeRequest / InternshipDecision: the decision is recorded against the exact
 * version the reviewer looked at, with a reason and the actor. Approvals stay in factoryApproval's
 * fork-on-edit ladder; change requests live here so the CAS ladder is never entangled with a "send
 * it back" signal. Schema: db/ensureContractTrackSchema.ts.
 */
export interface ContractProcessReviewAttributes {
  id?: string;
  delivery_project_id: string;
  track_type: string;
  reviewed_version: number;
  decision: string;
  reason?: string | null;
  requested_by?: string | null;
  created_at?: Date;
}

class ContractProcessReview extends Model<ContractProcessReviewAttributes> implements ContractProcessReviewAttributes {
  declare id: string;
  declare delivery_project_id: string;
  declare track_type: string;
  declare reviewed_version: number;
  declare decision: string;
  declare reason: string | null;
  declare requested_by: string | null;
  declare created_at: Date;
}

ContractProcessReview.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    delivery_project_id: { type: DataTypes.UUID, allowNull: false },
    track_type: { type: DataTypes.TEXT, allowNull: false },
    reviewed_version: { type: DataTypes.INTEGER, allowNull: false },
    decision: { type: DataTypes.TEXT, allowNull: false },
    reason: { type: DataTypes.TEXT, allowNull: true },
    requested_by: { type: DataTypes.TEXT, allowNull: true },
  },
  { sequelize, tableName: 'contract_process_reviews', timestamps: true, updatedAt: false, underscored: true },
);

export default ContractProcessReview;
