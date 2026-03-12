import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type ExperimentType = 'ab_test' | 'feature_flag' | 'process_change' | 'strategy_shift';
export type ExperimentStatus = 'proposed' | 'approved' | 'running' | 'completed' | 'rejected';
export type ExperimentPriority = 'low' | 'medium' | 'high' | 'critical';

interface ExperimentProposalAttributes {
  id?: string;
  title: string;
  hypothesis?: string;
  proposed_by_agent: string;
  department?: string;
  entity_type?: string;
  entity_id?: string;
  experiment_type: ExperimentType;
  status?: ExperimentStatus;
  expected_impact?: Record<string, any>;
  success_criteria?: Record<string, any>;
  results?: Record<string, any>;
  confidence?: number;
  priority?: ExperimentPriority;
  estimated_duration_days?: number;
  ticket_id?: string;
  created_at?: Date;
  updated_at?: Date;
}

class ExperimentProposal extends Model<ExperimentProposalAttributes> implements ExperimentProposalAttributes {
  declare id: string;
  declare title: string;
  declare hypothesis: string;
  declare proposed_by_agent: string;
  declare department: string;
  declare entity_type: string;
  declare entity_id: string;
  declare experiment_type: ExperimentType;
  declare status: ExperimentStatus;
  declare expected_impact: Record<string, any>;
  declare success_criteria: Record<string, any>;
  declare results: Record<string, any>;
  declare confidence: number;
  declare priority: ExperimentPriority;
  declare estimated_duration_days: number;
  declare ticket_id: string;
  declare created_at: Date;
  declare updated_at: Date;
}

ExperimentProposal.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    title: {
      type: DataTypes.STRING(300),
      allowNull: false,
    },
    hypothesis: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    proposed_by_agent: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    department: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    entity_type: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    entity_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    experiment_type: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'proposed',
    },
    expected_impact: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    success_criteria: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    results: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    confidence: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    priority: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'medium',
    },
    estimated_duration_days: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    ticket_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'experiment_proposals',
    timestamps: false,
    indexes: [
      { fields: ['status'] },
      { fields: ['department'] },
      { fields: ['proposed_by_agent'] },
      { fields: ['priority'] },
    ],
  }
);

export default ExperimentProposal;
