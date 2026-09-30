import { Request, Response } from 'express';
import { getAgentExplainability } from '../services/agentExplainabilityService';

// AI Workforce Management, Checkpoint F — requireAgentManagerOrAdmin-gated
// (route layer), same 500-on-unexpected-failure / never-a-raw-stack-trace
// posture as agentGoalController.ts / agentDetailController.ts.

function agentIdParam(req: Request): string | null {
  const idParam = req.params.id;
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  return id || null;
}

export async function handleGetAgentExplainability(req: Request, res: Response) {
  try {
    const id = agentIdParam(req);
    if (!id) {
      res.status(400).json({ error: 'Agent id is required' });
      return;
    }
    const result = await getAgentExplainability(id);
    if (!result) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    res.json(result);
  } catch (err: any) {
    console.error('[AgentExplainability] Error:', err.message);
    res.status(500).json({ error: 'Failed to load agent explainability' });
  }
}
