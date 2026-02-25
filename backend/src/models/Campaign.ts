import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type CampaignType = 'warm_nurture' | 'cold_outbound' | 're_engagement';
export type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed';

interface CampaignAttributes {
  id?: string;
  name: string;
  description?: string;
  type: CampaignType;
  status?: CampaignStatus;
  sequence_id?: string;
  targeting_criteria?: Record<string, any>;
  channel_config?: Record<string, any>;
  budget_total?: number;
  budget_spent?: number;
  ai_system_prompt?: string;
  started_at?: Date;
  completed_at?: Date;
  created_by?: string;
  created_at?: Date;
  updated_at?: Date;
}

class Campaign extends Model<CampaignAttributes> implements CampaignAttributes {
  declare id: string;
  declare name: string;
  declare description: string;
  declare type: CampaignType;
  declare status: CampaignStatus;
  declare sequence_id: string;
  declare targeting_criteria: Record<string, any>;
  declare channel_config: Record<string, any>;
  declare budget_total: number;
  declare budget_spent: number;
  declare ai_system_prompt: string;
  declare started_at: Date;
  declare completed_at: Date;
  declare created_by: string;
  declare created_at: Date;
  declare updated_at: Date;
}

Campaign.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    type: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'draft',
    },
    sequence_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'follow_up_sequences', key: 'id' },
    },
    targeting_criteria: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    channel_config: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: { email: { enabled: true, daily_limit: 50 }, voice: { enabled: false }, sms: { enabled: false } },
    },
    budget_total: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    budget_spent: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },
    ai_system_prompt: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    started_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    completed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    created_by: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'admin_users', key: 'id' },
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
    tableName: 'campaigns',
    timestamps: false,
  }
);

export default Campaign;
