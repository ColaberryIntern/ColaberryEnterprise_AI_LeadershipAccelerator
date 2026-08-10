import { Router } from 'express';
import { randomUUID } from 'crypto';
import { requireParticipant } from '../middlewares/participantAuth';
import { z } from 'zod';

// Per-student workspace repo routes (Part B). Every route is participant-authed
// and the enrollmentId is taken from the verified JWT (req.participant!.sub),
// never from the body — a student can only touch their own repo. The service is
// dynamic-imported so route wiring stays cheap and matches the projectRoutes /
// github-integration pattern in participantRoutes.ts.
//
// Mounted next to projectRoutes via `router.use(workspaceRoutes)`.

const router = Router();

// Every route is project-scoped now (FR-037). The enrollment still comes from the
// verified JWT and never from the request — a student can only reach their own
// project, and the service re-checks ownership before any GitHub call.
const projectIdSchema = z.string().uuid('A valid projectId is required');
const provisionSchema = z.object({
  project_id: z.string().uuid(),
  github_login: z.string().min(1),
});

/** A failed ownership check surfaces as 404, never 403 — see requireOwnedProject. */
function statusFor(err: any): number {
  if (typeof err?.status === 'number') return err.status;
  if (/GITHUB_TOKEN is not configured/.test(err?.message || '')) return 503;
  if (/No workspace repo provisioned/.test(err?.message || '')) return 409;
  return 500;
}

function logError(event: string, req: any, err: any): void {
  const correlationId = (req.headers['x-correlation-id'] as string) || randomUUID();
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'backend',
      event,
      correlation_id: correlationId,
      outcome: 'failure',
      error_class: err?.constructor?.name ?? 'Error',
      context: { message: err?.message },
    }),
  );
}

// GET the current workspace repo state.
router.get('/api/portal/workspace/repo', requireParticipant, async (req, res) => {
  try {
    const projectId = projectIdSchema.parse(req.query.project_id);
    const svc = await import('../services/studentWorkspaceService');
    const view = await svc.getWorkspaceRepo(req.participant!.sub, projectId);
    res.json(view);
  } catch (err: any) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Invalid input', issues: err.issues }); return; }
    logError('workspace_repo_get_failed', req, err);
    const status = statusFor(err);
    res.status(status).json({ error: status === 404 ? 'Project not found' : 'Failed to load workspace repo' });
  }
});

// POST provision — { github_login }. Idempotent; validates the login up front.
router.post('/api/portal/workspace/repo/provision', requireParticipant, async (req, res) => {
  try {
    const body = provisionSchema.parse(req.body ?? {});
    const svc = await import('../services/studentWorkspaceService');
    if (!svc.isValidGithubLogin(body.github_login)) {
      res.status(400).json({ error: 'A valid GitHub username is required' });
      return;
    }
    const view = await svc.provisionWorkspaceRepo(req.participant!.sub, body.project_id, body.github_login);
    res.status(201).json(view);
  } catch (err: any) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Invalid input', issues: err.issues }); return; }
    logError('workspace_repo_provision_failed', req, err);
    const status = statusFor(err);
    res.status(status).json({
      error: status === 503 ? err.message : status === 404 ? 'Project not found' : 'Failed to provision workspace repo',
    });
  }
});

// POST sync — pull the repo (no commit). No body.
router.post('/api/portal/workspace/repo/sync', requireParticipant, async (req, res) => {
  try {
    const projectId = projectIdSchema.parse(req.body?.project_id);
    const svc = await import('../services/studentWorkspaceService');
    const view = await svc.syncWorkspaceRepo(req.participant!.sub, projectId);
    res.json(view);
  } catch (err: any) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Invalid input', issues: err.issues }); return; }
    logError('workspace_repo_sync_failed', req, err);
    const status = statusFor(err);
    const msg = err?.message || '';
    res.status(status).json({
      error: status === 503 || status === 409 ? msg : status === 404 ? 'Project not found' : 'Failed to sync workspace repo',
    });
  }
});

export default router;
