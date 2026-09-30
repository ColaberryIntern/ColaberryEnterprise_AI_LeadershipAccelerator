import api from '../utils/api';

// AI Agent Dashboard redesign, Checkpoint D, Performance slice (2026-09-02)
// — first frontend caller of the real, already-live AgentGoal CRUD
// (agentGoalService.ts). `currentValue`/`met` are `null` (UNMEASURED) when
// there's no real underlying data to compute the metric from — this
// backend was fixed in this same checkpoint to stop defaulting an absent
// value to `0`, which used to make every `at_most` goal read as vacuously
// "met" for an agent with no linked AdminUser or no cost-tracked events.
// The UI must render UNMEASURED distinctly from both met and not-met.

export type GoalMetricKey = 'monthly_cost_usd' | 'open_ticket_count';
export type GoalComparison = 'at_most' | 'at_least';

export interface AgentGoal {
  id: string;
  metricKey: GoalMetricKey;
  comparison: GoalComparison;
  targetValue: number;
  currentValue: number | null;
  met: boolean | null;
  status: 'active' | 'archived';
  createdByEmail: string;
  createdAt: string;
}

interface GoalsResponse {
  agentId: string;
  goals: AgentGoal[];
}

export async function listGoals(agentId: string): Promise<AgentGoal[]> {
  const res = await api.get<GoalsResponse>(`/api/admin/agents/${agentId}/goals`);
  return res.data.goals;
}

export async function createGoal(agentId: string, input: { metricKey: GoalMetricKey; comparison: GoalComparison; targetValue: number }): Promise<AgentGoal> {
  const res = await api.post<AgentGoal>(`/api/admin/agents/${agentId}/goals`, input);
  return res.data;
}

export async function archiveGoal(agentId: string, goalId: string): Promise<AgentGoal> {
  const res = await api.post<AgentGoal>(`/api/admin/agents/${agentId}/goals/${goalId}/archive`);
  return res.data;
}
