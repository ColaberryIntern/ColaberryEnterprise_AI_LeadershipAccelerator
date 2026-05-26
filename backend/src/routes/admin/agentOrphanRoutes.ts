/**
 * agentOrphanRoutes — admin endpoints powering the orphan-adoption UI.
 *
 * GET  /api/admin/agent-orphans?projectId=<uuid>             list untagged-and-unmapped
 *                                                            agents with D3 suggestions
 * GET  /api/admin/agent-orphans/capabilities?projectId=...   list all caps in the project
 *                                                            (for the "Different cap" dropdown)
 * POST /api/admin/agent-orphans/adopt                        upsert a capability_agent_maps
 *                                                            row for one (cap, agent) pair
 *
 * Path style matches the codebase convention (coryRoutes.ts uses absolute
 * paths under the router). Gated by `requireAdmin` —
 * adoption writes to capability_agent_maps and is admin-only.
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { listOrphanAgents, adoptOrphan } from '../../services/agentOrphanService';
import { sequelize } from '../../config/database';
import { QueryTypes } from 'sequelize';

const router = Router();
router.use(requireAdmin);

const ProjectIdQuery = z.object({ projectId: z.string().uuid() });

router.get('/api/admin/agent-orphans', async (req: Request, res: Response) => {
  const parsed = ProjectIdQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'projectId query param required (uuid)' });
    return;
  }
  try {
    const result = await listOrphanAgents(parsed.data.projectId);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'list_failed' });
  }
});

router.get('/api/admin/agent-orphans/capabilities', async (req: Request, res: Response) => {
  const parsed = ProjectIdQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'projectId query param required (uuid)' });
    return;
  }
  try {
    const caps = await sequelize.query<{ id: string; name: string }>(
      'SELECT id, name FROM capabilities WHERE project_id = :pid ORDER BY name',
      { replacements: { pid: parsed.data.projectId }, type: QueryTypes.SELECT },
    );
    res.json({ capabilities: caps });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'cap_list_failed' });
  }
});

const AdoptBody = z.object({
  projectId: z.string().uuid(),
  agentName: z.string().min(1).max(255),
  capabilityId: z.string().uuid(),
  role: z.enum(['executor', 'monitor', 'classifier', 'orchestrator']).nullable().optional(),
});

router.post('/api/admin/agent-orphans/adopt', async (req: Request, res: Response) => {
  const parsed = AdoptBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid body', issues: parsed.error.flatten() });
    return;
  }
  try {
    const adoptedBy = req.admin?.email || 'unknown';
    const result = await adoptOrphan({ ...parsed.data, adoptedBy });
    res.json(result);
  } catch (e: any) {
    const msg = e?.message || 'adopt_failed';
    // Capability-not-in-project is a 404, not a 500
    if (msg.includes('not found')) res.status(404).json({ error: msg });
    else res.status(500).json({ error: msg });
  }
});

export default router;
