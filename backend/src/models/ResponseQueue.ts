import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type ResponseQueueType = 'reply' | 'follow_up' | 'dm_suggestion';
export type ResponseQueueStatus = 'draft' | 'approved' | 'posted' | 'rejected' | 'expired';

interface ResponseQueueAttributes {
  id?: string;
  engagement_id: string;
  response_type?: ResponseQueueType;
  response_text: string;
  platform: string;
  status?: ResponseQueueStatus;
  post_url?: string;
  posted_at?: Date;
  expires_at?: Date;
  details?: Record<string, any>;
  created_at?: Date;
  updated_at?: Date;
}

class ResponseQueue extends Model<ResponseQueueAttributes> implements ResponseQueueAttributes {
  declare id: string;
  declare engagement_id: string;
  declare response_type: ResponseQueueType;
  declare response_text: string;
  declare platform: string;
  declare status: ResponseQueueStatus;
  declare post_url: string;
  declare posted_at: Date;
  declare expires_at: Date;
  declare details: Record<string, any>;
  declare created_at: Date;
  declare updated_at: Date;
}

ResponseQueue.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    engagement_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'openclaw_engagement_events', key: 'id' },
    },
    response_type: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'reply',
    },
    response_text: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    platform: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'draft',
    },
    post_url: {
      type: DataTypes.STRING(1000),
      allowNull: true,
    },
    posted_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: true,
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
    tableName: 'openclaw_response_queue',
    timestamps: false,
    indexes: [
      { fields: ['engagement_id'] },
      { fields: ['status'] },
      { fields: ['platform'] },
      { fields: ['created_at'] },
    ],
  }
);

export default ResponseQueue;
