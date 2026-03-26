import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type EngagementEventType = 'reply' | 'comment' | 'mention' | 'reaction' | 'share';
export type EngagementEventStatus = 'new' | 'responded' | 'following_up' | 'converted' | 'closed';
export type RoleSeniority = 'unknown' | 'ic' | 'manager' | 'director' | 'vp' | 'c_level';

interface EngagementEventAttributes {
  id?: string;
  response_id?: string;
  authority_content_id?: string;
  platform: string;
  source_url?: string;
  engagement_type: EngagementEventType;
  user_name?: string;
  user_title?: string;
  user_company?: string;
  content?: string;
  intent_score?: number;
  influence_score?: number;
  role_seniority?: RoleSeniority;
  company_detected?: string;
  status?: EngagementEventStatus;
  lead_id?: number;
  conversation_id?: string;
  details?: Record<string, any>;
  created_at?: Date;
  updated_at?: Date;
}

class EngagementEvent extends Model<EngagementEventAttributes> implements EngagementEventAttributes {
  declare id: string;
  declare response_id: string;
  declare authority_content_id: string;
  declare platform: string;
  declare source_url: string;
  declare engagement_type: EngagementEventType;
  declare user_name: string;
  declare user_title: string;
  declare user_company: string;
  declare content: string;
  declare intent_score: number;
  declare influence_score: number;
  declare role_seniority: RoleSeniority;
  declare company_detected: string;
  declare status: EngagementEventStatus;
  declare lead_id: number;
  declare conversation_id: string;
  declare details: Record<string, any>;
  declare created_at: Date;
  declare updated_at: Date;
}

EngagementEvent.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    response_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'openclaw_responses', key: 'id' },
    },
    authority_content_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'openclaw_authority_content', key: 'id' },
    },
    platform: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    source_url: {
      type: DataTypes.STRING(1000),
      allowNull: true,
    },
    engagement_type: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },
    user_name: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },
    user_title: {
      type: DataTypes.STRING(300),
      allowNull: true,
    },
    user_company: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    intent_score: {
      type: DataTypes.DECIMAL(3, 2),
      allowNull: true,
    },
    influence_score: {
      type: DataTypes.DECIMAL(3, 2),
      allowNull: true,
    },
    role_seniority: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'unknown',
    },
    company_detected: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'new',
    },
    lead_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'leads', key: 'id' },
    },
    conversation_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'openclaw_conversations', key: 'id' },
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
    tableName: 'openclaw_engagement_events',
    timestamps: false,
    indexes: [
      { fields: ['response_id'] },
      { fields: ['authority_content_id'] },
      { fields: ['platform'] },
      { fields: ['status'] },
      { fields: ['intent_score'] },
      { fields: ['lead_id'] },
      { fields: ['conversation_id'] },
      { fields: ['created_at'] },
    ],
  }
);

export default EngagementEvent;
