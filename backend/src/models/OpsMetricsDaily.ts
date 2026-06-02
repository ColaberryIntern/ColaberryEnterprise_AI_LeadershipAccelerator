/**
 * OpsMetricsDaily — pre-aggregated daily metrics for the dashboard.
 *
 * Computed by an end-of-day cron + on-demand when the dashboard renders. We
 * pre-aggregate so the dashboard does not run expensive queries on every
 * pageview.
 */
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface OpsMetricsDailyAttributes {
  date: string; // YYYY-MM-DD, primary key
  approvals_completed: number;
  approvals_open_at_end: number;
  approvals_avg_seconds: number | null;
  approvals_p95_seconds: number | null;
  downstream_unblocked: number;
  hours_saved_estimated: number;
  hours_blocked_estimated: number;
  revenue_at_risk_estimated: number | null;
  revenue_protected_estimated: number | null;
  meetings_eliminated: number;
  skills_created: number;
  skills_used: number;
  automations_fired: number;
  agent_calls_count: number;
  agent_total_cost_usd: number;
  created_at?: Date;
  updated_at?: Date;
}

class OpsMetricsDaily extends Model<OpsMetricsDailyAttributes> implements OpsMetricsDailyAttributes {
  declare date: string;
  declare approvals_completed: number;
  declare approvals_open_at_end: number;
  declare approvals_avg_seconds: number | null;
  declare approvals_p95_seconds: number | null;
  declare downstream_unblocked: number;
  declare hours_saved_estimated: number;
  declare hours_blocked_estimated: number;
  declare revenue_at_risk_estimated: number | null;
  declare revenue_protected_estimated: number | null;
  declare meetings_eliminated: number;
  declare skills_created: number;
  declare skills_used: number;
  declare automations_fired: number;
  declare agent_calls_count: number;
  declare agent_total_cost_usd: number;
  declare created_at: Date;
  declare updated_at: Date;
}

OpsMetricsDaily.init(
  {
    date: { type: DataTypes.DATEONLY, primaryKey: true, allowNull: false },
    approvals_completed: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    approvals_open_at_end: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    approvals_avg_seconds: { type: DataTypes.INTEGER, allowNull: true },
    approvals_p95_seconds: { type: DataTypes.INTEGER, allowNull: true },
    downstream_unblocked: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    hours_saved_estimated: { type: DataTypes.DECIMAL(8, 2), allowNull: false, defaultValue: 0 },
    hours_blocked_estimated: { type: DataTypes.DECIMAL(8, 2), allowNull: false, defaultValue: 0 },
    revenue_at_risk_estimated: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    revenue_protected_estimated: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    meetings_eliminated: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    skills_created: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    skills_used: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    automations_fired: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    agent_calls_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    agent_total_cost_usd: { type: DataTypes.DECIMAL(10, 4), allowNull: false, defaultValue: 0 },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    modelName: 'OpsMetricsDaily',
    tableName: 'ops_metrics_daily',
    timestamps: true,
    underscored: true,
  },
);

export default OpsMetricsDaily;
