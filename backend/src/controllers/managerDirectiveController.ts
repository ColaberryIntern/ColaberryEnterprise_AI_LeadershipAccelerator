import { Request, Response } from 'express';
import { z } from 'zod';
import { managerDirectiveInputSchema } from '../schemas/managerDirectiveSchema';
import {
  listDirectives,
  createDirective,
  revokeDirective,
  AgentNotFoundError,
  DirectiveNotFoundError,
} from '../services/managerDirectiveService';

// AI Workforce Management, Checkpoint C — requireAgentManagerOrAdmin-gated
// (route layer), same 500-on-unexpected-failure / never-a-raw-stack-trace
// posture as agentDetailController.ts / agentRoleCharterController.ts.

function agentIdParam(req: Request): string | null {
  const idParam = req.params.id;
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  return id || null;
}

export async function handleListDirectives(req: Request, res: Response) {
  try {
    const id = agentIdParam(req);
    if (!id) {
      res.status(400).json({ error: 'Agent id is required' });
      return;
    }
    const directives = await listDirectives(id);
    if (!directives) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    res.json({ agentId: id, directives });
  } catch (err: any) {
    console.error('[ManagerDirective] Error:', err.message);
    res.status(500).json({ error: 'Failed to load directives' });
  }
}

export async function handleCreateDirective(req: Request, res: Response) {
  try {
    const id = agentIdParam(req);
    if (!id) {
      res.status(400).json({ error: 'Agent id is required' });
      return;
    }
    const input = managerDirectiveInputSchema.parse(req.body || {});
    // req.admin is guaranteed set here — requireAgentManagerOrAdmin never
    // calls next() without it. req.agentManagerOrgMemberId is only set for a
    // non-superadmin manager (see ManagerDirective.ts's column comment).
    const directive = await createDirective(id, req.agentManagerOrgMemberId ?? null, req.admin!.email, input.directiveText);
    res.status(201).json(directive);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', issues: err.issues });
      return;
    }
    if (err instanceof AgentNotFoundError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error('[ManagerDirective] Error:', err.message);
    res.status(500).json({ error: 'Failed to create directive' });
  }
}

export async function handleRevokeDirective(req: Request, res: Response) {
  try {
    const directiveIdParam = req.params.directiveId;
    const directiveId = Array.isArray(directiveIdParam) ? directiveIdParam[0] : directiveIdParam;
    if (!directiveId) {
      res.status(400).json({ error: 'Directive id is required' });
      return;
    }
    const directive = await revokeDirective(directiveId, req.admin!.email);
    res.json(directive);
  } catch (err: any) {
    if (err instanceof DirectiveNotFoundError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error('[ManagerDirective] Error:', err.message);
    res.status(500).json({ error: 'Failed to revoke directive' });
  }
}
