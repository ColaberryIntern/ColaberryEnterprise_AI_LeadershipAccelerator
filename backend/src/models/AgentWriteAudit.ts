import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface AgentWriteAuditAttributes {
  id?: string;
  agent_id: string;
  agent_name: string;
  operation: string;
  target_table: string;
  target_id: string;
  before_state?: Record<string, any> | null;
  after_state?: Record<string, any> | null;
  permission_tier: string;
  was_allowed: boolean;
  blocked_reason?: string | null;
  trace_id?: string | null;
  execution_id?: string | null;
  duration_ms?: number | null;
  created_at?: Date;
}

class AgentWriteAudit extends Model<AgentWriteAuditAttributes> implements AgentWriteAuditAttributes {
  declare id: string;
  declare agent_id: string;
  declare agent_name: string;
  declare operation: string;
  declare target_table: string;
  declare target_id: string;
  declare before_state: Record<string, any> | null;
  declare after_state: Record<string, any> | null;
  declare permission_tier: string;
  declare was_allowed: boolean;
  declare blocked_reason: string | null;
  declare trace_id: string | null;
  declare execution_id: string | null;
  declare duration_ms: number | null;
  declare created_at: Date;
}

AgentWriteAudit.init(
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
    agent_name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    operation: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    target_table: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    target_id: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    before_state: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    after_state: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    permission_tier: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    was_allowed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
    },
    blocked_reason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    trace_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    execution_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    duration_ms: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'agent_write_audits',
    timestamps: false,
    indexes: [
      { fields: ['agent_id'] },
      { fields: ['agent_name'] },
      { fields: ['target_table'] },
      { fields: ['was_allowed'] },
      { fields: ['created_at'] },
      { fields: ['trace_id'] },
      { fields: ['execution_id'] },
      { fields: ['permission_tier'] },
    ],
  },
);

export default AgentWriteAudit;
