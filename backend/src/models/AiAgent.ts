import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type AiAgentType = 'repair' | 'content_optimization' | 'conversation_optimization';
export type AiAgentStatus = 'idle' | 'running' | 'paused' | 'error';

interface AiAgentAttributes {
  id?: string;
  agent_name: string;
  agent_type: AiAgentType;
  status?: AiAgentStatus;
  config?: Record<string, any>;
  last_run_at?: Date;
  last_result?: Record<string, any>;
  created_at?: Date;
  updated_at?: Date;
}

class AiAgent extends Model<AiAgentAttributes> implements AiAgentAttributes {
  declare id: string;
  declare agent_name: string;
  declare agent_type: AiAgentType;
  declare status: AiAgentStatus;
  declare config: Record<string, any>;
  declare last_run_at: Date;
  declare last_result: Record<string, any>;
  declare created_at: Date;
  declare updated_at: Date;
}

AiAgent.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    agent_name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
    },
    agent_type: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'idle',
    },
    config: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    last_run_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    last_result: {
      type: DataTypes.JSONB,
      allowNull: true,
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
    tableName: 'ai_agents',
    timestamps: false,
  }
);

export default AiAgent;
