import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type OpenclawPlatform = 'reddit' | 'linkedin' | 'hackernews' | 'quora' | 'devto' | 'medium' | 'hashnode' | 'discourse' | 'twitter' | 'bluesky' | 'youtube' | 'producthunt' | 'facebook_groups' | 'linkedin_comments';
export type OpenclawSignalStatus = 'discovered' | 'scored' | 'queued' | 'responded' | 'skipped' | 'expired';

interface OpenclawSignalAttributes {
  id?: string;
  platform: OpenclawPlatform;
  source_url: string;
  author?: string;
  title?: string;
  content_excerpt?: string;
  topic_tags?: any;
  relevance_score?: number;
  engagement_score?: number;
  risk_score?: number;
  status: OpenclawSignalStatus;
  discovered_at?: Date;
  scored_at?: Date;
  responded_at?: Date;
  response_id?: string;
  details?: Record<string, any>;
  created_at?: Date;
  updated_at?: Date;
}

class OpenclawSignal extends Model<OpenclawSignalAttributes> implements OpenclawSignalAttributes {
  declare id: string;
  declare platform: OpenclawPlatform;
  declare source_url: string;
  declare author: string;
  declare title: string;
  declare content_excerpt: string;
  declare topic_tags: any;
  declare relevance_score: number;
  declare engagement_score: number;
  declare risk_score: number;
  declare status: OpenclawSignalStatus;
  declare discovered_at: Date;
  declare scored_at: Date;
  declare responded_at: Date;
  declare response_id: string;
  declare details: Record<string, any>;
  declare created_at: Date;
  declare updated_at: Date;
}

OpenclawSignal.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    platform: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    source_url: {
      type: DataTypes.STRING(1000),
      allowNull: false,
    },
    author: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },
    title: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    content_excerpt: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    topic_tags: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
    relevance_score: {
      type: DataTypes.DECIMAL(3, 2),
      allowNull: true,
    },
    engagement_score: {
      type: DataTypes.DECIMAL(3, 2),
      allowNull: true,
    },
    risk_score: {
      type: DataTypes.DECIMAL(3, 2),
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'discovered',
    },
    discovered_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    scored_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    responded_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    response_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'openclaw_responses', key: 'id' },
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
    tableName: 'openclaw_signals',
    timestamps: false,
    indexes: [
      { fields: ['platform'] },
      { fields: ['status'] },
      { fields: ['relevance_score'] },
      { fields: ['created_at'] },
    ],
  }
);

export default OpenclawSignal;
