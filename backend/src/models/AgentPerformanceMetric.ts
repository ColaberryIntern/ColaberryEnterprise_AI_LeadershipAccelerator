import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface AgentPerformanceMetricAttributes {
  id?: string;
  agent_id: string;
  agent_name: string;
  period_start: Date;
  period_end: Date;
  execution_count: number;
  success_count: number;
  failure_count: number;
  skip_count: number;
  avg_duration_ms: number;
  p95_duration_ms?: number;
  success_rate: number;
  avg_confidence?: number;
  total_actions: number;
  total_errors: number;
  impact_score?: number;
  improvement_proposals?: Record<string, any>[];
  active_experiments?: Record<string, any>[];
  created_at?: Date;
}

class AgentPerformanceMetric extends Model<AgentPerformanceMetricAttributes> implements AgentPerformanceMetricAttributes {
  declare id: string;
  declare agent_id: string;
  declare agent_name: string;
  declare period_start: Date;
  declare period_end: Date;
  declare execution_count: number;
  declare success_count: number;
  declare failure_count: number;
  declare skip_count: number;
  declare avg_duration_ms: number;
  declare p95_duration_ms: number;
  declare success_rate: number;
  declare avg_confidence: number;
  declare total_actions: number;
  declare total_errors: number;
  declare impact_score: number;
  declare improvement_proposals: Record<string, any>[];
  declare active_experiments: Record<string, any>[];
  declare created_at: Date;
}

AgentPerformanceMetric.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    agent_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    agent_name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    period_start: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    period_end: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    execution_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    success_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    failure_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    skip_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    avg_duration_ms: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    p95_duration_ms: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    success_rate: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },
    avg_confidence: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    total_actions: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    total_errors: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    impact_score: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    improvement_proposals: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
    active_experiments: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'agent_performance_metrics',
    timestamps: false,
    indexes: [
      { fields: ['agent_id', 'period_start'] },
      { fields: ['agent_name'] },
      { fields: ['impact_score'] },
    ],
  }
);

export default AgentPerformanceMetric;
