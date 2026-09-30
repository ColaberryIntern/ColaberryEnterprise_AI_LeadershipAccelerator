import { Request, Response } from 'express';
import { z } from 'zod';
import { createOneOnOneInputSchema, completeOneOnOneInputSchema } from '../schemas/agentOneOnOneSchema';
import {
  createOneOnOne,
  listOneOnOnes,
  completeOneOnOne,
  AgentNotFoundError,
  OneOnOneNotFoundError,
  OneOnOneAlreadyCompletedError,
} from '../services/agentOneOnOneService';

// AI Workforce Management, Checkpoint D — requireAgentManagerOrAdmin-gated
// (route layer), same 500-on-unexpected-failure / never-a-raw-stack-trace
// posture as agentDetailController.ts.

function agentIdParam(req: Request): string | null {
  const idParam = req.params.id;
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  return id || null;
}

export async function handleListOneOnOnes(req: Request, res: Response) {
  try {
    const id = agentIdParam(req);
    if (!id) {
      res.status(400).json({ error: 'Agent id is required' });
      return;
    }
    const items = await listOneOnOnes(id);
    if (!items) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    res.json({ agentId: id, oneOnOnes: items });
  } catch (err: any) {
    console.error('[AgentOneOnOne] Error:', err.message);
    res.status(500).json({ error: 'Failed to load one-on-ones' });
  }
}

export async function handleCreateOneOnOne(req: Request, res: Response) {
  try {
    const id = agentIdParam(req);
    if (!id) {
      res.status(400).json({ error: 'Agent id is required' });
      return;
    }
    const input = createOneOnOneInputSchema.parse(req.body || {});
    const view = await createOneOnOne(id, req.agentManagerOrgMemberId ?? null, req.admin!.email, input.agenda);
    res.status(201).json(view);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', issues: err.issues });
      return;
    }
    if (err instanceof AgentNotFoundError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error('[AgentOneOnOne] Error:', err.message);
    res.status(500).json({ error: 'Failed to create one-on-one' });
  }
}

export async function handleCompleteOneOnOne(req: Request, res: Response) {
  try {
    const oneOnOneIdParam = req.params.oneOnOneId;
    const oneOnOneId = Array.isArray(oneOnOneIdParam) ? oneOnOneIdParam[0] : oneOnOneIdParam;
    if (!oneOnOneId) {
      res.status(400).json({ error: 'One-on-one id is required' });
      return;
    }
    const input = completeOneOnOneInputSchema.parse(req.body || {});
    const view = await completeOneOnOne(oneOnOneId, input.outcomeNotes);
    res.json(view);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', issues: err.issues });
      return;
    }
    if (err instanceof OneOnOneNotFoundError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    if (err instanceof OneOnOneAlreadyCompletedError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error('[AgentOneOnOne] Error:', err.message);
    res.status(500).json({ error: 'Failed to complete one-on-one' });
  }
}
