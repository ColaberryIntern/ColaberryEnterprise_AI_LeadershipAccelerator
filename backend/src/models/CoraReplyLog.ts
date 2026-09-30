import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface CoraReplyLogAttributes {
  id?: string;
  thread_key: string;
  email_id: string;
  replied_at?: Date;
}

// Idempotency key for Cora's auto-reply (2026-07-14 mail-loop incident, BC
// #10095332194 fix). Reserved via findOrCreate BEFORE generating/sending a
// reply — `created: false` means this thread already got a Cora reply, so
// the second (or 1,800th) attempt is skipped rather than sent. thread_key is
// the provider_thread_id, falling back to provider_message_id when a
// provider doesn't give threads.
class CoraReplyLog extends Model<CoraReplyLogAttributes> implements CoraReplyLogAttributes {
  declare id: string;
  declare thread_key: string;
  declare email_id: string;
  declare replied_at: Date;
}

CoraReplyLog.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    thread_key: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    email_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'cora_reply_logs',
    timestamps: true,
    underscored: true,
    createdAt: 'replied_at',
    updatedAt: false,
    indexes: [{ unique: true, fields: ['thread_key'], name: 'uq_cora_reply_logs_thread_key' }],
  }
);

export default CoraReplyLog;
