import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * CommsHubApproval: An approval (CH6.1): who, when, and the SHA-256 of the exact drafts, destinations and send time
 * approved (CH6.2 computes it). A later change voids it (voided_at + voided_reason); never deleted.
 * Columns match ensureCommsHubSchema.ts exactly (modelParity test).
 */

export interface CommsHubApprovalAttributes {
  id?: string;
  message_id: string;
  approved_by: string;
  approved_at?: Date;
  content_hash: string;
  voided_at?: Date | null;
  voided_reason?: string | null;
  created_at?: Date;
}

class CommsHubApproval extends Model<CommsHubApprovalAttributes> implements CommsHubApprovalAttributes {
  declare id: string;
  declare message_id: string;
  declare approved_by: string;
  declare approved_at: Date;
  declare content_hash: string;
  declare voided_at: Date | null;
  declare voided_reason: string | null;
  declare created_at: Date;
}

CommsHubApproval.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    message_id: { type: DataTypes.UUID, allowNull: false },
    approved_by: { type: DataTypes.STRING(64), allowNull: false },
    approved_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    content_hash: { type: DataTypes.CHAR(64), allowNull: false },
    voided_at: { type: DataTypes.DATE, allowNull: true },
    voided_reason: { type: DataTypes.STRING(64), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { sequelize, tableName: 'comms_hub_approvals', timestamps: true, createdAt: 'created_at', updatedAt: false },
);

export default CommsHubApproval;
