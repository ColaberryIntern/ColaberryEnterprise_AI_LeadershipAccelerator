import AiAgent from '../models/AiAgent';
import AdminUser from '../models/AdminUser';
import AgentGoal, { AgentGoalMetricKey, AgentGoalComparison } from '../models/AgentGoal';
import { agentCostRows } from './trustMetricsService';
import { countOpenTicketsForAgent } from './workforce/liveAgentsService';

// AI Workforce Management, Checkpoint D. Generic by construction — works
// off AiAgent.id, not hardcoded to any one agent.

export class AgentNotFoundError extends Error {
  readonly error_class = 'AgentNotFoundError' as const;
  readonly status = 404;

  constructor(agentId: string) {
    super(`Agent "${agentId}" does not exist.`);
    this.name = 'AgentNotFoundError';
  }
}

export class GoalNotFoundError extends Error {
  readonly error_class = 'GoalNotFoundError' as const;
  readonly status = 404;

  constructor(id: string) {
    super(`Goal "${id}" does not exist.`);
    this.name = 'GoalNotFoundError';
  }
}

export interface AgentGoalView {
  id: string;
  metricKey: AgentGoalMetricKey;
  comparison: AgentGoalComparison;
  targetValue: number;
  /** The real, live-computed current value for this metric — never stored,
   * never stale, computed the same way every time this is read. */
  currentValue: number;
  met: boolean;
  status: 'active' | 'archived';
  createdByEmail: string;
  createdAt: Date;
}

/**
 * Computes the real current value for a goal's metric, reusing the exact
 * same functions Agent Detail's own cost_summary/open_ticket_count already
 * use — never a second, drifting calculation.
 */
async function computeMetricValue(metricKey: AgentGoalMetricKey, agent: AiAgent): Promise<number> {
  if (metricKey === 'monthly_cost_usd') {
    const rows = await agentCostRows(30, agent.id);
    return rows[0]?.costUsd ?? 0;
  }
  // open_ticket_count
  const adminUser = await AdminUser.findOne({ where: { agent_id: agent.id } });
  return adminUser ? countOpenTicketsForAgent(adminUser.id, agent) : 0;
}

function isMet(comparison: AgentGoalComparison, targetValue: number, currentValue: number): boolean {
  return comparison === 'at_most' ? currentValue <= targetValue : currentValue >= targetValue;
}

async function toView(row: AgentGoal, agent: AiAgent): Promise<AgentGoalView> {
  const currentValue = await computeMetricValue(row.metric_key, agent);
  return {
    id: row.id,
    metricKey: row.metric_key,
    comparison: row.comparison,
    targetValue: row.target_value,
    currentValue,
    met: isMet(row.comparison, row.target_value, currentValue),
    status: row.status,
    createdByEmail: row.created_by_email,
    createdAt: row.created_at,
  };
}

/** Authorization is the route layer's job (requireAgentManagerOrAdmin) —
 * same convention as every other service in this mission. Trusts it
 * already happened. */
export async function createGoal(
  agentId: string,
  orgMemberId: string | null,
  createdByEmail: string,
  metricKey: AgentGoalMetricKey,
  comparison: AgentGoalComparison,
  targetValue: number,
): Promise<AgentGoalView> {
  const agent = await AiAgent.findByPk(agentId);
  if (!agent) throw new AgentNotFoundError(agentId);

  const row = await AgentGoal.create({
    agent_id: agentId,
    org_member_id: orgMemberId,
    created_by_email: createdByEmail,
    metric_key: metricKey,
    comparison,
    target_value: targetValue,
    status: 'active',
  });
  return toView(row, agent);
}

/** `null` return means the agent itself doesn't exist. A real agent with
 * zero goals returns an empty array — the honest "no goals set yet" state,
 * not an error. Only active goals are returned — archived goals are a real,
 * deliberately deferred history view (matching ManagerDirective's own
 * full-history GET, which this could grow into later). */
export async function listActiveGoals(agentId: string): Promise<AgentGoalView[] | null> {
  const agent = await AiAgent.findByPk(agentId);
  if (!agent) return null;

  const rows = await AgentGoal.findAll({ where: { agent_id: agentId, status: 'active' } });
  return Promise.all(rows.map((row) => toView(row, agent)));
}

/** Idempotent: archiving an already-archived goal is a no-op, not an error
 * and not a second archival event — matches ManagerDirective's own revoke
 * semantics. */
export async function archiveGoal(id: string): Promise<AgentGoalView> {
  const row = await AgentGoal.findByPk(id);
  if (!row) throw new GoalNotFoundError(id);

  const agent = await AiAgent.findByPk(row.agent_id);
  if (!agent) throw new AgentNotFoundError(row.agent_id);

  if (row.status === 'active') {
    await row.update({ status: 'archived' });
  }
  return toView(row, agent);
}
