import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type AiAgentType =
  // Existing operational agents
  | 'repair'
  | 'content_optimization'
  | 'conversation_optimization'
  | 'health_scanner'
  | 'scheduled_processor'
  | 'signal_detector'
  | 'intent_scorer'
  | 'trigger_evaluator'
  | 'insight_computer'
  | 'opportunity_scorer'
  | 'session_manager'
  | 'maintenance'
  | 'digest'
  | 'reminder'
  | 'orchestration_health'
  | 'student_monitor'
  | 'prompt_monitor'
  | 'orchestration_repair'
  | 'campaign_qa'
  | 'self_healing'
  // Intelligence layer agents
  | 'planner'
  | 'critic'
  | 'memory'
  // Autonomous operations agents
  | 'problem_discovery'
  | 'root_cause'
  | 'action_planner'
  | 'impact_estimator'
  | 'risk_evaluator'
  | 'execution'
  | 'monitor'
  | 'audit'
  // Strategic agents
  | 'strategic_intelligence'
  | 'revenue_optimization'
  | 'cost_optimization'
  | 'growth_experiment'
  | 'resource_allocator'
  | 'governance'
  // Meta-agents
  | 'architecture_analyzer'
  | 'prompt_optimizer'
  | 'performance_tracker'
  | 'experiment_runner'
  // Dynamic (created by AI COO)
  | 'dynamic';

export type AiAgentStatus = 'idle' | 'running' | 'paused' | 'error';
export type AiAgentTriggerType = 'cron' | 'on_demand' | 'event_driven';
export type AiAgentCategory = 'outbound' | 'behavioral' | 'maintenance' | 'ai_ops' | 'accelerator' | 'autonomous' | 'strategic' | 'memory' | 'meta' | 'security';

interface AiAgentAttributes {
  id?: string;
  agent_name: string;
  agent_type: AiAgentType;
  status?: AiAgentStatus;
  config?: Record<string, any>;
  last_run_at?: Date;
  last_result?: Record<string, any>;
  // Registry fields
  module?: string;
  source_file?: string;
  trigger_type?: AiAgentTriggerType;
  schedule?: string;
  category?: AiAgentCategory;
  description?: string;
  enabled?: boolean;
  run_count?: number;
  avg_duration_ms?: number;
  error_count?: number;
  last_error?: string;
  last_error_at?: Date;
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
  declare module: string;
  declare source_file: string;
  declare trigger_type: AiAgentTriggerType;
  declare schedule: string;
  declare category: AiAgentCategory;
  declare description: string;
  declare enabled: boolean;
  declare run_count: number;
  declare avg_duration_ms: number;
  declare error_count: number;
  declare last_error: string;
  declare last_error_at: Date;
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
      type: DataTypes.STRING(50),
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
    // --- Registry fields ---
    module: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },
    source_file: {
      type: DataTypes.STRING(300),
      allowNull: true,
    },
    trigger_type: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    schedule: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    category: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    run_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    avg_duration_ms: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    error_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    last_error: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    last_error_at: {
      type: DataTypes.DATE,
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
    indexes: [
      { fields: ['category'] },
      { fields: ['enabled'] },
      { fields: ['trigger_type'] },
    ],
  }
);

export default AiAgent;
