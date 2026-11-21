import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * CommsHubAlert: one failure alert for one recipient (an email address, or 'dashboard' for the admin
 * alerts list) about one failure state change of one message (CH7.5). UNIQUE (state_event_id,
 * recipient) is the idempotency key, so an alert goes out once per state change.
 * Columns match ensureCommsHubSchema.ts exactly (modelParity test).
 */
export type CommsHubAlertStatus = 'pending' | 'sending' | 'sent' | 'failed';

export interface CommsHubAlertAttributes {
  id?: string;
  state_event_id: string;
  message_id: string;
  failure_state: 'failed' | 'partially_failed';
  recipient: string;
  status?: CommsHubAlertStatus;
  attempt_count?: number;
  next_attempt_at?: Date | null;
  claimed_at?: Date | null;
  error?: string | null;
  sent_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

class CommsHubAlert extends Model<CommsHubAlertAttributes> implements CommsHubAlertAttributes {
  declare id: string;
  declare state_event_id: string;
  declare message_id: string;
  declare failure_state: 'failed' | 'partially_failed';
  declare recipient: string;
  declare status: CommsHubAlertStatus;
  declare attempt_count: number;
  declare next_attempt_at: Date | null;
  declare claimed_at: Date | null;
  declare error: string | null;
  declare sent_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

CommsHubAlert.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    state_event_id: { type: DataTypes.UUID, allowNull: false },
    message_id: { type: DataTypes.UUID, allowNull: false },
    failure_state: { type: DataTypes.STRING(24), allowNull: false },
    recipient: { type: DataTypes.STRING(254), allowNull: false },
    status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'pending' },
    attempt_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    next_attempt_at: { type: DataTypes.DATE, allowNull: true },
    claimed_at: { type: DataTypes.DATE, allowNull: true },
    error: { type: DataTypes.TEXT, allowNull: true },
    sent_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { sequelize, tableName: 'comms_hub_alerts', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' },
);

export default CommsHubAlert;
