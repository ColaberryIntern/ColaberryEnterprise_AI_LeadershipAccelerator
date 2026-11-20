import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * CommsHubDraft: The text of a message for one channel (CH6.1), VERSIONED: a regenerate or an edit is a new row,
 * never an update. author is "ai" or the admin id; instruction records Shorter / Warmer / More detail.
 * Columns match ensureCommsHubSchema.ts exactly (modelParity test).
 */
export type CommsHubChannel = 'community_post' | 'in_app';

export interface CommsHubDraftAttributes {
  id?: string;
  message_id: string;
  channel: CommsHubChannel;
  version: number;
  title?: string | null;
  body: string;
  author: string;
  instruction?: string | null;
  created_at?: Date;
}

class CommsHubDraft extends Model<CommsHubDraftAttributes> implements CommsHubDraftAttributes {
  declare id: string;
  declare message_id: string;
  declare channel: CommsHubChannel;
  declare version: number;
  declare title: string | null;
  declare body: string;
  declare author: string;
  declare instruction: string | null;
  declare created_at: Date;
}

CommsHubDraft.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    message_id: { type: DataTypes.UUID, allowNull: false },
    channel: { type: DataTypes.STRING(24), allowNull: false },
    version: { type: DataTypes.INTEGER, allowNull: false },
    title: { type: DataTypes.TEXT, allowNull: true },
    body: { type: DataTypes.TEXT, allowNull: false },
    author: { type: DataTypes.STRING(64), allowNull: false },
    instruction: { type: DataTypes.STRING(32), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { sequelize, tableName: 'comms_hub_drafts', timestamps: true, createdAt: 'created_at', updatedAt: false },
);

export default CommsHubDraft;
