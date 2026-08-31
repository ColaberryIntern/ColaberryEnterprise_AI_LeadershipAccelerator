import { z } from 'zod';

// Runtime validation for AgentGoal writes (AI Workforce Management,
// Checkpoint D). metricKey is a closed enum, not free text — see
// AgentGoal.ts's own header comment for why that's the point, not a
// limitation to work around later.

export const AGENT_GOAL_METRIC_KEYS = ['monthly_cost_usd', 'open_ticket_count'] as const;
export const AGENT_GOAL_COMPARISONS = ['at_most', 'at_least'] as const;

export const createGoalInputSchema = z.object({
  metricKey: z.enum(AGENT_GOAL_METRIC_KEYS),
  comparison: z.enum(AGENT_GOAL_COMPARISONS),
  targetValue: z.number().finite().min(0),
});
export type CreateGoalInput = z.infer<typeof createGoalInputSchema>;
