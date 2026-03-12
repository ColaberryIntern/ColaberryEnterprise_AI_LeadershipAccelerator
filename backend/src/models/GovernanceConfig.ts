import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type AutonomyMode = 'full' | 'safe' | 'manual';

interface GovernanceConfigAttributes {
  id: string;
  scope: string;
  version: number;
  autonomy_mode: AutonomyMode;
  max_dynamic_agents: number;
  max_agents_total: number;
  max_auto_executions_per_hour: number;
  max_risk_budget_per_hour: number;
  max_proposed_pending: number;
  auto_execute_risk_threshold: number;
  auto_execute_confidence_threshold: number;
  max_experiments_per_agent: number;
  max_system_experiments: number;
  approval_required_for_critical: boolean;
  autonomy_rules: any;
  updated_by: string | null;
  created_at: Date;
  updated_at: Date;
}

class GovernanceConfig extends Model<GovernanceConfigAttributes> implements GovernanceConfigAttributes {
  declare id: string;
  declare scope: string;
  declare version: number;
  declare autonomy_mode: AutonomyMode;
  declare max_dynamic_agents: number;
  declare max_agents_total: number;
  declare max_auto_executions_per_hour: number;
  declare max_risk_budget_per_hour: number;
  declare max_proposed_pending: number;
  declare auto_execute_risk_threshold: number;
  declare auto_execute_confidence_threshold: number;
  declare max_experiments_per_agent: number;
  declare max_system_experiments: number;
  declare approval_required_for_critical: boolean;
  declare autonomy_rules: any;
  declare updated_by: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

GovernanceConfig.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    scope: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'global',
      unique: true,
    },
    version: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    autonomy_mode: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'full',
    },
    max_dynamic_agents: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 50,
    },
    max_agents_total: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 100,
    },
    max_auto_executions_per_hour: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 10,
    },
    max_risk_budget_per_hour: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 200,
    },
    max_proposed_pending: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 50,
    },
    auto_execute_risk_threshold: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 40,
    },
    auto_execute_confidence_threshold: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 70,
    },
    max_experiments_per_agent: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    max_system_experiments: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 3,
    },
    approval_required_for_critical: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    autonomy_rules: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    updated_by: {
      type: DataTypes.STRING(255),
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
    tableName: 'governance_configs',
    timestamps: false,
  }
);

export default GovernanceConfig;
