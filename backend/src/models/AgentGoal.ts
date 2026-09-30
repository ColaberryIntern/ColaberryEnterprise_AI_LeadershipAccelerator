import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * AgentGoal — a manager-set target for a real, computable metric on an
 * agent. AI Workforce Management, Checkpoint D (2026-08-30).
 *
 * Deliberately a CLOSED set of metric keys (see AgentGoalMetricKey below),
 * not a free-text/custom metric field. This is what makes every goal in
 * this system genuinely measurable by construction — there is no
 * "UNMEASURED" fallback here because there is no way to create a goal for a
 * metric this code doesn't already know how to compute correctly from real
 * data. A free-text custom-metric goal (which WOULD need an honest
 * UNMEASURED state for anything not yet wired to a real source) is real,
 * deliberately deferred scope, not built in this slice.
 *
 * Both v1 metrics reuse existing, already-proven real queries rather than
 * re-deriving them: `monthly_cost_usd` is trustMetricsService.ts's own
 * agentCostRows() (the exact number Agent Detail's own cost_summary
 * already shows); `open_ticket_count` is liveAgentsService.ts's own
 * countOpenTicketsForAgent() (the exact number Agent Detail's own
 * open_ticket_count already shows). Never a second, drifting calculation.
 */
export type AgentGoalMetricKey = 'monthly_cost_usd' | 'open_ticket_count';
export type AgentGoalComparison = 'at_most' | 'at_least';
export type AgentGoalStatus = 'active' | 'archived';

export interface AgentGoalAttributes {
  id?: string;
  agent_id: string;
  /** Nullable for the same reason as ManagerDirective.created_by_org_member_id
   * — a platform super_admin is never resolved to an org_member by the auth
   * gate. created_by_email is always populated and is the real attribution. */
  org_member_id?: string | null;
  created_by_email: string;
  metric_key: AgentGoalMetricKey;
  comparison: AgentGoalComparison;
  target_value: number;
  status?: AgentGoalStatus;
  created_at?: Date;
  updated_at?: Date;
}

class AgentGoal extends Model<AgentGoalAttributes> implements AgentGoalAttributes {
  declare id: string;
  declare agent_id: string;
  declare org_member_id: string | null;
  declare created_by_email: string;
  declare metric_key: AgentGoalMetricKey;
  declare comparison: AgentGoalComparison;
  declare target_value: number;
  declare status: AgentGoalStatus;
  declare created_at: Date;
  declare updated_at: Date;
}

AgentGoal.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    agent_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'ai_agents', key: 'id' } },
    org_member_id: { type: DataTypes.UUID, allowNull: true, references: { model: 'org_members', key: 'id' } },
    created_by_email: { type: DataTypes.STRING(255), allowNull: false },
    metric_key: { type: DataTypes.STRING(50), allowNull: false },
    comparison: { type: DataTypes.STRING(20), allowNull: false },
    target_value: { type: DataTypes.FLOAT, allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'active' },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'agent_goals',
    timestamps: true,
    underscored: true,
    indexes: [{ fields: ['agent_id', 'status'] }],
  }
);

export default AgentGoal;
