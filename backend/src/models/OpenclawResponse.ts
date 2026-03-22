import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type OpenclawPostStatus = 'draft' | 'approved' | 'ready_to_post' | 'posted' | 'failed' | 'removed';
export type OpenclawTone = 'educational' | 'conversational' | 'technical';

interface OpenclawResponseAttributes {
  id?: string;
  signal_id: string;
  session_id?: string;
  platform: string;
  content: string;
  content_version?: number;
  tone?: OpenclawTone;
  short_id?: string;
  tracked_url?: string;
  utm_params?: Record<string, string>;
  campaign_id?: string;
  post_status?: OpenclawPostStatus;
  post_url?: string;
  posted_at?: Date;
  engagement_metrics?: Record<string, any>;
  moderation_flag?: boolean;
  created_at?: Date;
  updated_at?: Date;
}

class OpenclawResponse extends Model<OpenclawResponseAttributes> implements OpenclawResponseAttributes {
  declare id: string;
  declare signal_id: string;
  declare session_id: string;
  declare platform: string;
  declare content: string;
  declare content_version: number;
  declare tone: OpenclawTone;
  declare short_id: string;
  declare tracked_url: string;
  declare utm_params: Record<string, string>;
  declare campaign_id: string;
  declare post_status: OpenclawPostStatus;
  declare post_url: string;
  declare posted_at: Date;
  declare engagement_metrics: Record<string, any>;
  declare moderation_flag: boolean;
  declare created_at: Date;
  declare updated_at: Date;
}

OpenclawResponse.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    signal_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'openclaw_signals', key: 'id' },
    },
    session_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'openclaw_sessions', key: 'id' },
    },
    platform: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    content_version: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    tone: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: 'educational',
    },
    short_id: {
      type: DataTypes.STRING(20),
      allowNull: true,
      unique: true,
    },
    tracked_url: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    utm_params: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    campaign_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'campaigns', key: 'id' },
    },
    post_status: {
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
    engagement_metrics: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    moderation_flag: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
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
    tableName: 'openclaw_responses',
    timestamps: false,
    indexes: [
      { fields: ['signal_id'] },
      { fields: ['platform'] },
      { fields: ['post_status'] },
      { fields: ['campaign_id'] },
      { fields: ['created_at'] },
      { fields: ['short_id'], unique: true, name: 'idx_openclaw_responses_short_id' },
    ],
  }
);

export default OpenclawResponse;
