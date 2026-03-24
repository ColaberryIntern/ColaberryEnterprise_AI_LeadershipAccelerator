import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type LinkedInActionType = 'comment' | 'connection_request' | 'dm_followup' | 'post_engagement';
export type LinkedInActionStatus = 'pending' | 'completed' | 'skipped' | 'expired';

interface LinkedInActionQueueAttributes {
  id?: string;
  action_type: LinkedInActionType;
  target_post_url?: string;
  target_user_name?: string;
  target_user_title?: string;
  suggested_text: string;
  context?: string;
  priority?: number;
  status?: LinkedInActionStatus;
  completed_at?: Date;
  source_signal_id?: string;
  source_engagement_id?: string;
  details?: Record<string, any>;
  created_at?: Date;
  updated_at?: Date;
}

class LinkedInActionQueue extends Model<LinkedInActionQueueAttributes> implements LinkedInActionQueueAttributes {
  declare id: string;
  declare action_type: LinkedInActionType;
  declare target_post_url: string;
  declare target_user_name: string;
  declare target_user_title: string;
  declare suggested_text: string;
  declare context: string;
  declare priority: number;
  declare status: LinkedInActionStatus;
  declare completed_at: Date;
  declare source_signal_id: string;
  declare source_engagement_id: string;
  declare details: Record<string, any>;
  declare created_at: Date;
  declare updated_at: Date;
}

LinkedInActionQueue.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    action_type: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },
    target_post_url: {
      type: DataTypes.STRING(1000),
      allowNull: true,
    },
    target_user_name: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },
    target_user_title: {
      type: DataTypes.STRING(300),
      allowNull: true,
    },
    suggested_text: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    context: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    priority: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 5,
    },
    status: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'pending',
    },
    completed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    source_signal_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'openclaw_signals', key: 'id' },
    },
    source_engagement_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'openclaw_engagement_events', key: 'id' },
    },
    details: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'openclaw_linkedin_actions',
    timestamps: false,
    indexes: [
      { fields: ['status'] },
      { fields: ['priority'] },
      { fields: ['action_type'] },
      { fields: ['created_at'] },
    ],
  }
);

export default LinkedInActionQueue;
