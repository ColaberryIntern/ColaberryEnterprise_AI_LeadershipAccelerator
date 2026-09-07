import { Request, Response } from 'express';
import { z } from 'zod';
import { checklistBypassInputSchema } from '../schemas/checklistBypassSchema';
import { bypassChecklistInstance, ChecklistInstanceNotFoundError } from '../services/checklist/checklistBypassService';
import ChecklistInstance from '../models/ChecklistInstance';

// Reese Agentic AI Employee mission, Capability 6 — requireAdmin-gated
// (route layer), same 500-on-unexpected-failure / never-a-raw-stack-trace
// posture as agentGoalController.ts.

function idParam(req: Request): string | null {
  const raw = req.params.id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  return id || null;
}

export async function handleGetChecklistInstance(req: Request, res: Response) {
  try {
    const id = idParam(req);
    if (!id) {
      res.status(400).json({ error: 'Checklist instance id is required' });
      return;
    }
    const instance = await ChecklistInstance.findByPk(id);
    if (!instance) {
      res.status(404).json({ error: 'Checklist instance not found' });
      return;
    }
    res.json(instance);
  } catch (err: any) {
    console.error('[Checklist] Error:', err.message);
    res.status(500).json({ error: 'Failed to load checklist instance' });
  }
}

export async function handleBypassChecklistInstance(req: Request, res: Response) {
  try {
    const id = idParam(req);
    if (!id) {
      res.status(400).json({ error: 'Checklist instance id is required' });
      return;
    }
    const input = checklistBypassInputSchema.parse(req.body || {});
    const result = await bypassChecklistInstance(id, req.admin!.email, input.reason);
    if (!result.granted) {
      res.status(400).json({ error: 'Bypass refused', refusals: result.refusals });
      return;
    }
    res.json(result.instance);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', issues: err.issues });
      return;
    }
    if (err instanceof ChecklistInstanceNotFoundError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error('[Checklist] Error:', err.message);
    res.status(500).json({ error: 'Failed to bypass checklist instance' });
  }
}
