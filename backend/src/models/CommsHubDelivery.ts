import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * CommsHubDelivery: One send of one message to one destination (CH6.1). idempotency_key is UNIQUE, so a retried send
 * reuses its row and can never post twice; CH7.2 claims due rows with FOR UPDATE SKIP LOCKED.
 * Columns match ensureCommsHubSchema.ts exactly (modelParity test).
 */
export type CommsHubDeliveryStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'cancelled' | 'skipped';

export interface CommsHubDeliveryAttributes {
  id?: string;
  message_id: string;
  destination_id: string;
  channel: 'community_post' | 'in_app';
  idempotency_key: string;
  status?: CommsHubDeliveryStatus;
  attempt_count?: number;
  next_attempt_at?: Date | null;
  provider_message_id?: string | null;
  error?: string | null;
  sent_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

class CommsHubDelivery extends Model<CommsHubDeliveryAttributes> implements CommsHubDeliveryAttributes {
  declare id: string;
  declare message_id: string;
  declare destination_id: string;
  declare channel: 'community_post' | 'in_app';
  declare idempotency_key: string;
  declare status: CommsHubDeliveryStatus;
  declare attempt_count: number;
  declare next_attempt_at: Date | null;
  declare provider_message_id: string | null;
  declare error: string | null;
  declare sent_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

CommsHubDelivery.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    message_id: { type: DataTypes.UUID, allowNull: false },
    destination_id: { type: DataTypes.UUID, allowNull: false },
    channel: { type: DataTypes.STRING(24), allowNull: false },
    idempotency_key: { type: DataTypes.STRING(128), allowNull: false, unique: true },
    status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'pending' },
    attempt_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    next_attempt_at: { type: DataTypes.DATE, allowNull: true },
    provider_message_id: { type: DataTypes.STRING(255), allowNull: true },
    error: { type: DataTypes.TEXT, allowNull: true },
    sent_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { sequelize, tableName: 'comms_hub_deliveries', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' },
);

export default CommsHubDelivery;
