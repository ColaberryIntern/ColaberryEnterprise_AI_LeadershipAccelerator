import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type DecisionStatus =
  | 'proposed'
  | 'approved'
  | 'executing'
  | 'executed'
  | 'rejected'
  | 'failed'
  | 'monitoring'
  | 'completed'
  | 'rolled_back';

export type RiskTier = 'safe' | 'moderate' | 'risky' | 'dangerous';

export type ProblemType =
  | 'kpi_anomaly'
  | 'conversion_drop'
  | 'error_spike'
  | 'engagement_decline'
  | 'agent_failure'
  | 'pipeline_bottleneck';

export type SafeAction =
  | 'update_campaign_config'
  | 'adjust_lead_scoring'
  | 'launch_ab_test'
  | 'pause_campaign'
  | 'update_agent_config'
  | 'modify_agent_schedule';

interface IntelligenceDecisionAttributes {
  decision_id?: string;
  trace_id: string;
  problem_detected: string;
  analysis_summary?: string;
  recommended_action?: SafeAction;
  action_details?: Record<string, any>;
  impact_estimate?: Record<string, any>;
  risk_score?: number;
  confidence_score?: number;
  risk_tier?: RiskTier;
  execution_status: DecisionStatus;
  executed_at?: Date;
  executed_by?: string;
  before_state?: Record<string, any>;
  after_state?: Record<string, any>;
  impact_after_24h?: Record<string, any>;
  monitor_results?: Record<string, any>;
  monitor_next_at?: Date;
  reasoning?: string;
  timestamp?: Date;
}

class IntelligenceDecision extends Model<IntelligenceDecisionAttributes> implements IntelligenceDecisionAttributes {
  declare decision_id: string;
  declare trace_id: string;
  declare problem_detected: string;
  declare analysis_summary: string;
  declare recommended_action: SafeAction;
  declare action_details: Record<string, any>;
  declare impact_estimate: Record<string, any>;
  declare risk_score: number;
  declare confidence_score: number;
  declare risk_tier: RiskTier;
  declare execution_status: DecisionStatus;
  declare executed_at: Date;
  declare executed_by: string;
  declare before_state: Record<string, any>;
  declare after_state: Record<string, any>;
  declare impact_after_24h: Record<string, any>;
  declare monitor_results: Record<string, any>;
  declare monitor_next_at: Date;
  declare reasoning: string;
  declare timestamp: Date;
}

IntelligenceDecision.init(
  {
    decision_id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    trace_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    problem_detected: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    analysis_summary: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    recommended_action: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    action_details: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    impact_estimate: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    risk_score: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    confidence_score: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    risk_tier: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    execution_status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'proposed',
    },
    executed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    executed_by: {
      type: DataTypes.STRING(100),
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
    impact_after_24h: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    monitor_results: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    monitor_next_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    reasoning: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    timestamp: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'intelligence_decisions',
    timestamps: false,
    indexes: [
      { fields: ['trace_id'] },
      { fields: ['execution_status'] },
      { fields: ['risk_score'] },
      { fields: ['timestamp'] },
    ],
  }
);

export default IntelligenceDecision;
