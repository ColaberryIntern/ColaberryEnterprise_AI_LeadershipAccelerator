import { Request, Response } from 'express';
import { z } from 'zod';
import { createGoalInputSchema } from '../schemas/agentGoalSchema';
import { createGoal, listActiveGoals, archiveGoal, AgentNotFoundError, GoalNotFoundError } from '../services/agentGoalService';

// AI Workforce Management, Checkpoint D — requireAgentManagerOrAdmin-gated
// (route layer), same 500-on-unexpected-failure / never-a-raw-stack-trace
// posture as agentDetailController.ts.

function agentIdParam(req: Request): string | null {
  const idParam = req.params.id;
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  return id || null;
}

export async function handleListGoals(req: Request, res: Response) {
  try {
    const id = agentIdParam(req);
    if (!id) {
      res.status(400).json({ error: 'Agent id is required' });
      return;
    }
    const goals = await listActiveGoals(id);
    if (!goals) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    res.json({ agentId: id, goals });
  } catch (err: any) {
    console.error('[AgentGoal] Error:', err.message);
    res.status(500).json({ error: 'Failed to load goals' });
  }
}

export async function handleCreateGoal(req: Request, res: Response) {
  try {
    const id = agentIdParam(req);
    if (!id) {
      res.status(400).json({ error: 'Agent id is required' });
      return;
    }
    const input = createGoalInputSchema.parse(req.body || {});
    const goal = await createGoal(id, req.agentManagerOrgMemberId ?? null, req.admin!.email, input.metricKey, input.comparison, input.targetValue);
    res.status(201).json(goal);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', issues: err.issues });
      return;
    }
    if (err instanceof AgentNotFoundError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error('[AgentGoal] Error:', err.message);
    res.status(500).json({ error: 'Failed to create goal' });
  }
}

export async function handleArchiveGoal(req: Request, res: Response) {
  try {
    const goalIdParam = req.params.goalId;
    const goalId = Array.isArray(goalIdParam) ? goalIdParam[0] : goalIdParam;
    if (!goalId) {
      res.status(400).json({ error: 'Goal id is required' });
      return;
    }
    const goal = await archiveGoal(goalId);
    res.json(goal);
  } catch (err: any) {
    if (err instanceof GoalNotFoundError || err instanceof AgentNotFoundError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error('[AgentGoal] Error:', err.message);
    res.status(500).json({ error: 'Failed to archive goal' });
  }
}
