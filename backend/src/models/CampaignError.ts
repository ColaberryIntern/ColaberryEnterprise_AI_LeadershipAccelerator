import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type ErrorSeverity = 'info' | 'warning' | 'error' | 'critical';

interface CampaignErrorAttributes {
  id?: string;
  campaign_id: string;
  component: string;
  severity?: ErrorSeverity;
  error_message: string;
  context?: Record<string, any>;
  resolved?: boolean;
  resolved_at?: Date;
  resolved_by?: string;
  // Enhanced error fields
  stack_trace?: string;
  ai_reasoning?: string;
  repair_attempt_id?: string;
  retry_count?: number;
  last_retry_at?: Date;
  created_at?: Date;
}

class CampaignError extends Model<CampaignErrorAttributes> implements CampaignErrorAttributes {
  declare id: string;
  declare campaign_id: string;
  declare component: string;
  declare severity: ErrorSeverity;
  declare error_message: string;
  declare context: Record<string, any>;
  declare resolved: boolean;
  declare resolved_at: Date;
  declare resolved_by: string;
  declare stack_trace: string;
  declare ai_reasoning: string;
  declare repair_attempt_id: string;
  declare retry_count: number;
  declare last_retry_at: Date;
  declare created_at: Date;
}

CampaignError.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    campaign_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'campaigns', key: 'id' },
    },
    component: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    severity: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'warning',
    },
    error_message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    context: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    resolved: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    resolved_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    resolved_by: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    // --- Enhanced error fields ---
    stack_trace: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    ai_reasoning: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    repair_attempt_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'ai_agent_activity_logs', key: 'id' },
    },
    retry_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    last_retry_at: {
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
    tableName: 'campaign_errors',
    timestamps: false,
    indexes: [
      { fields: ['campaign_id'] },
      { fields: ['component'] },
      { fields: ['severity'] },
      { fields: ['resolved'] },
      { fields: ['created_at'] },
      { fields: ['repair_attempt_id'] },
    ],
  }
);

export default CampaignError;
