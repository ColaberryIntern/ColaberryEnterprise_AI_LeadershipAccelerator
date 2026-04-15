import { Router, Request, Response } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  provisionStack,
  stopStack,
  bootStack,
  archiveStack,
  destroyStack,
  getStackByProject,
  listStacks,
} from '../../services/previewStackService';
import { Project, PreviewEvent } from '../../models';

const router = Router();

/**
 * GET /api/admin/preview-stacks
 * List all preview stacks with their project + status.
 */
router.get('/api/admin/preview-stacks', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const stacks = await listStacks();
    const projectIds = stacks.map((s: any) => s.project_id);
    const projects = projectIds.length
      ? await Project.findAll({ where: { id: projectIds } })
      : [];
    const projectMap = new Map(projects.map((p: any) => [p.id, p]));
    const enriched = stacks.map((s: any) => {
      const p = projectMap.get(s.project_id) as any;
      return {
        id: s.id,
        project_id: s.project_id,
        project_name: p?.organization_name || null,
        slug: s.slug,
        status: s.status,
        frontend_port: s.frontend_port,
        backend_port: s.backend_port,
        repo_url: s.repo_url,
        repo_commit_sha: s.repo_commit_sha,
        last_accessed_at: s.last_accessed_at,
        last_started_at: s.last_started_at,
        last_stopped_at: s.last_stopped_at,
        failure_reason: s.failure_reason,
        updated_at: s.updated_at,
      };
    });
    res.json({ stacks: enriched });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/preview-stacks/:project_id
 * Inspect a single project's stack + recent events.
 */
router.get('/api/admin/preview-stacks/:project_id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const stack: any = await getStackByProject(req.params.project_id as string);
    if (!stack) { res.status(404).json({ error: 'No preview stack for this project' }); return; }
    const events = await PreviewEvent.findAll({
      where: { preview_stack_id: stack.id },
      order: [['created_at', 'DESC']],
      limit: 50,
    });
    res.json({ stack, events });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/preview-stacks/:project_id/provision
 * Create a new stack for a project, or rebuild the existing one.
 */
router.post('/api/admin/preview-stacks/:project_id/provision', requireAdmin, async (req: Request, res: Response) => {
  try {
    const stack = await provisionStack({ projectId: req.params.project_id as string });
    res.json({ stack });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/admin/preview-stacks/:project_id/rebuild
 * Re-pull the repo and rebuild the stack.
 */
router.post('/api/admin/preview-stacks/:project_id/rebuild', requireAdmin, async (req: Request, res: Response) => {
  try {
    const stack = await provisionStack({ projectId: req.params.project_id as string, refreshRepo: true });
    res.json({ stack });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/admin/preview-stacks/:project_id/stop
 * Stop a running stack (preserves state).
 */
router.post('/api/admin/preview-stacks/:project_id/stop', requireAdmin, async (req: Request, res: Response) => {
  try {
    const stack = await stopStack(req.params.project_id as string);
    res.json({ stack });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/admin/preview-stacks/:project_id/boot
 * Manually boot a stopped stack.
 */
router.post('/api/admin/preview-stacks/:project_id/boot', requireAdmin, async (req: Request, res: Response) => {
  try {
    const stack = await bootStack(req.params.project_id as string);
    res.json({ stack });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/admin/preview-stacks/:project_id/archive
 * Non-destructive teardown: stop + mark archived; state retained on disk.
 */
router.post('/api/admin/preview-stacks/:project_id/archive', requireAdmin, async (req: Request, res: Response) => {
  try {
    const stack = await archiveStack(req.params.project_id as string);
    res.json({ stack });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * DELETE /api/admin/preview-stacks/:project_id
 * Destructive teardown — removes containers, volumes (DB data!), and clone.
 * Requires `?confirm=delete-data` query param to prevent accidents.
 */
router.delete('/api/admin/preview-stacks/:project_id', requireAdmin, async (req: Request, res: Response) => {
  try {
    if (req.query.confirm !== 'delete-data') {
      res.status(400).json({ error: 'Destructive teardown requires ?confirm=delete-data' });
      return;
    }
    await destroyStack(req.params.project_id as string);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
