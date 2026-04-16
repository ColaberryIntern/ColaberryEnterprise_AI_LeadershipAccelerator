import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type ReplyDraftStatus = 'pending_approval' | 'approved' | 'rejected' | 'auto_sent' | 'sent' | 'edited';

interface InboxReplyDraftAttributes {
  id?: string;
  email_id: string;
  thread_id?: string | null;
  draft_body: string;
  draft_subject?: string | null;
  reply_to_address: string;
  status?: ReplyDraftStatus;
  reply_mode?: number;
  style_profile_used?: string | null;
  approved_by?: string | null;
  edited_body?: string | null;
  sent_at?: Date | null;
  created_at?: Date;
}

class InboxReplyDraft extends Model<InboxReplyDraftAttributes> implements InboxReplyDraftAttributes {
  declare id: string;
  declare email_id: string;
  declare thread_id: string | null;
  declare draft_body: string;
  declare draft_subject: string | null;
  declare reply_to_address: string;
  declare status: ReplyDraftStatus;
  declare reply_mode: number;
  declare style_profile_used: string | null;
  declare approved_by: string | null;
  declare edited_body: string | null;
  declare sent_at: Date | null;
  declare created_at: Date;
}

InboxReplyDraft.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    email_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'inbox_emails', key: 'id' },
    },
    thread_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    draft_body: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    draft_subject: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    reply_to_address: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('pending_approval', 'approved', 'rejected', 'auto_sent', 'sent', 'edited'),
      allowNull: false,
      defaultValue: 'pending_approval',
    },
    reply_mode: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    style_profile_used: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    approved_by: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    edited_body: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    sent_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'inbox_reply_drafts',
    timestamps: false,
    indexes: [
      {
        fields: ['status'],
        name: 'idx_inbox_reply_drafts_status',
      },
      {
        fields: ['email_id'],
        name: 'idx_inbox_reply_drafts_email_id',
      },
    ],
  }
);

export default InboxReplyDraft;
