import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

// ─── Types ──────────────────────────────────────────────────────────

export type HealingActionType = 'prompt_rewrite' | 'variable_fix' | 'flow_adjustment' | 'structure_improvement';
export type HealingActionStatus = 'pending' | 'approved' | 'applied' | 'rejected' | 'skipped';
export type HealingPlanStatus = 'draft' | 'preview' | 'approved' | 'applied' | 'rejected' | 'partial';

export interface HealingAction {
  id: string;
  action_type: HealingActionType;
  target_id: string;
  target_label: string;
  prompt_field?: string;
  description: string;
  risk_level: 'low' | 'medium' | 'high';
  blocked: boolean;
  block_reason?: string;
  status: HealingActionStatus;
  before_value?: any;
  after_value?: any;
  changes_explanation?: string;
  evidence: Record<string, any>;
}

export interface HealingPlanAttributes {
  id?: string;
  status: HealingPlanStatus;
  overall_risk_level: 'low' | 'medium' | 'high';
  source_diagnostics: Record<string, any>;
  actions: HealingAction[];
  governance_insight_id?: string | null;
  rejection_reason?: string | null;
  applied_action_ids?: string[] | null;
  created_at?: Date;
  applied_at?: Date | null;
  updated_at?: Date;
}

// ─── Model ──────────────────────────────────────────────────────────

class HealingPlan extends Model<HealingPlanAttributes> implements HealingPlanAttributes {
  declare id: string;
  declare status: HealingPlanStatus;
  declare overall_risk_level: 'low' | 'medium' | 'high';
  declare source_diagnostics: Record<string, any>;
  declare actions: HealingAction[];
  declare governance_insight_id: string | null;
  declare rejection_reason: string | null;
  declare applied_action_ids: string[] | null;
  declare created_at: Date;
  declare applied_at: Date | null;
  declare updated_at: Date;
}

HealingPlan.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'draft',
    },
    overall_risk_level: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: 'low',
    },
    source_diagnostics: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    actions: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    governance_insight_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    rejection_reason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    applied_action_ids: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    applied_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'healing_plans',
    timestamps: false,
    indexes: [
      { fields: ['status'] },
      { fields: ['created_at'] },
    ],
  }
);

export default HealingPlan;
