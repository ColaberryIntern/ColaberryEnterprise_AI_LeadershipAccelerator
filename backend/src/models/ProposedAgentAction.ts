import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'applied';

interface ProposedAgentActionAttributes {
  id?: string;
  agent_id: string;
  agent_name: string;
  action_type: string;
  target_table: string;
  target_id: string;
  proposed_changes: Record<string, any>;
  before_state: Record<string, any>;
  reason: string;
  confidence: number;
  campaign_id?: string | null;
  status?: ProposalStatus;
  reviewed_by?: string | null;
  reviewed_at?: Date | null;
  review_notes?: string | null;
  applied_at?: Date | null;
  expires_at?: Date | null;
  // Prioritization scores
  impact_score?: number | null;
  risk_score?: number | null;
  priority_score?: number | null;
  created_at?: Date;
}

class ProposedAgentAction extends Model<ProposedAgentActionAttributes> implements ProposedAgentActionAttributes {
  declare id: string;
  declare agent_id: string;
  declare agent_name: string;
  declare action_type: string;
  declare target_table: string;
  declare target_id: string;
  declare proposed_changes: Record<string, any>;
  declare before_state: Record<string, any>;
  declare reason: string;
  declare confidence: number;
  declare campaign_id: string | null;
  declare status: ProposalStatus;
  declare reviewed_by: string | null;
  declare reviewed_at: Date | null;
  declare review_notes: string | null;
  declare applied_at: Date | null;
  declare expires_at: Date | null;
  declare impact_score: number | null;
  declare risk_score: number | null;
  declare priority_score: number | null;
  declare created_at: Date;
}

ProposedAgentAction.init(
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
    action_type: {
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
    proposed_changes: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    before_state: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    confidence: {
      type: DataTypes.DECIMAL(3, 2),
      allowNull: false,
    },
    campaign_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'campaigns', key: 'id' },
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'pending',
    },
    reviewed_by: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },
    reviewed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    review_notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    applied_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    // Prioritization scores (0.0–1.0)
    impact_score: {
      type: DataTypes.DECIMAL(3, 2),
      allowNull: true,
    },
    risk_score: {
      type: DataTypes.DECIMAL(3, 2),
      allowNull: true,
    },
    priority_score: {
      type: DataTypes.DECIMAL(3, 2),
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'proposed_agent_actions',
    timestamps: false,
    indexes: [
      { fields: ['agent_id'] },
      { fields: ['status'] },
      { fields: ['campaign_id'] },
      { fields: ['created_at'] },
      { fields: ['target_table', 'target_id'] },
      { fields: ['expires_at'] },
    ],
  },
);

export default ProposedAgentAction;
