import { Request, Response } from 'express';
import { z } from 'zod';
import { agentRoleCharterInputSchema } from '../schemas/agentRoleCharterSchema';
import { getRoleCharter, upsertRoleCharter, AgentNotFoundError } from '../services/agentRoleCharterService';

// AI Workforce Management, Checkpoint B — requireAgentManagerOrAdmin-gated
// (route layer), same 500-on-unexpected-failure / never-a-raw-stack-trace
// posture as agentDetailController.ts.

export async function handleGetRoleCharter(req: Request, res: Response) {
  try {
    const idParam = req.params.id;
    const id = Array.isArray(idParam) ? idParam[0] : idParam;
    if (!id) {
      res.status(400).json({ error: 'Agent id is required' });
      return;
    }
    const view = await getRoleCharter(id);
    if (!view) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    res.json(view);
  } catch (err: any) {
    console.error('[AgentRoleCharter] Error:', err.message);
    res.status(500).json({ error: 'Failed to load agent role charter' });
  }
}

export async function handleUpsertRoleCharter(req: Request, res: Response) {
  try {
    const idParam = req.params.id;
    const id = Array.isArray(idParam) ? idParam[0] : idParam;
    if (!id) {
      res.status(400).json({ error: 'Agent id is required' });
      return;
    }

    const input = agentRoleCharterInputSchema.parse(req.body || {});
    // req.admin is guaranteed set here — requireAgentManagerOrAdmin (the
    // route's own middleware) never calls next() without it.
    const view = await upsertRoleCharter(id, input, req.admin!.email);
    res.json(view);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', issues: err.issues });
      return;
    }
    if (err instanceof AgentNotFoundError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error('[AgentRoleCharter] Error:', err.message);
    res.status(500).json({ error: 'Failed to save agent role charter' });
  }
}
