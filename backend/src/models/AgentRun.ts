import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

// ProofDesk Work Ledger (Milestone 1 - Foundation). An AgentRun is one invocation of
// an agent against a ticket (today: one per dispatchTicketToAgent() call). Shadow
// mode only - existing dispatch behavior/return values are unaffected by writes here.

export type AgentRunStatus = 'running' | 'success' | 'failed' | 'skipped';

interface AgentRunAttributes {
  id?: string;
  work_context_id?: string | null;
  ticket_id?: string | null;
  agent_name: string;
  agent_version?: string | null;
  trace_id: string;
  status?: AgentRunStatus;
  started_at?: Date;
  ended_at?: Date | null;
  duration_ms?: number | null;
  result?: string | null;
  retry_of_run_id?: string | null;
  metadata?: Record<string, any> | null;
  created_at?: Date;
}

class AgentRun extends Model<AgentRunAttributes> implements AgentRunAttributes {
  declare id: string;
  declare work_context_id: string | null;
  declare ticket_id: string | null;
  declare agent_name: string;
  declare agent_version: string | null;
  declare trace_id: string;
  declare status: AgentRunStatus;
  declare started_at: Date;
  declare ended_at: Date | null;
  declare duration_ms: number | null;
  declare result: string | null;
  declare retry_of_run_id: string | null;
  declare metadata: Record<string, any> | null;
  declare created_at: Date;
}

AgentRun.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    work_context_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'work_contexts', key: 'id' },
    },
    ticket_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'tickets', key: 'id' },
    },
    agent_name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    agent_version: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    trace_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'running',
    },
    started_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    ended_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    duration_ms: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    result: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    retry_of_run_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'agent_runs', key: 'id' },
    },
    metadata: {
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
    tableName: 'agent_runs',
    timestamps: false,
    indexes: [
      { fields: ['ticket_id'] },
      { fields: ['work_context_id'] },
      { fields: ['trace_id'] },
      { fields: ['status'] },
    ],
  }
);

export default AgentRun;
