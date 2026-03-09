import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type AgentActivityResult = 'success' | 'failed' | 'skipped' | 'pending';

interface AiAgentActivityLogAttributes {
  id?: string;
  agent_id: string;
  campaign_id?: string;
  action: string;
  reason?: string;
  confidence?: number;
  before_state?: Record<string, any>;
  after_state?: Record<string, any>;
  result?: AgentActivityResult;
  details?: Record<string, any>;
  created_at?: Date;
}

class AiAgentActivityLog extends Model<AiAgentActivityLogAttributes> implements AiAgentActivityLogAttributes {
  declare id: string;
  declare agent_id: string;
  declare campaign_id: string;
  declare action: string;
  declare reason: string;
  declare confidence: number;
  declare before_state: Record<string, any>;
  declare after_state: Record<string, any>;
  declare result: AgentActivityResult;
  declare details: Record<string, any>;
  declare created_at: Date;
}

AiAgentActivityLog.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    agent_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'ai_agents', key: 'id' },
    },
    campaign_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'campaigns', key: 'id' },
    },
    action: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    confidence: {
      type: DataTypes.DECIMAL(3, 2),
      allowNull: true,
    },
    before_state: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    after_state: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    result: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'pending',
    },
    details: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'ai_agent_activity_logs',
    timestamps: false,
    indexes: [
      { fields: ['agent_id'] },
      { fields: ['campaign_id'] },
      { fields: ['action'] },
      { fields: ['result'] },
      { fields: ['created_at'] },
    ],
  }
);

export default AiAgentActivityLog;
