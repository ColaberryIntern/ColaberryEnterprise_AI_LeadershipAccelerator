import { Router } from 'express';
import { randomUUID } from 'crypto';
import { requireParticipant } from '../middlewares/participantAuth';

// Per-student workspace repo routes (Part B). Every route is participant-authed
// and the enrollmentId is taken from the verified JWT (req.participant!.sub),
// never from the body — a student can only touch their own repo. The service is
// dynamic-imported so route wiring stays cheap and matches the projectRoutes /
// github-integration pattern in participantRoutes.ts.
//
// Mounted next to projectRoutes via `router.use(workspaceRoutes)`.

const router = Router();

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
    const svc = await import('../services/studentWorkspaceService');
    const view = await svc.getWorkspaceRepo(req.participant!.sub);
    res.json(view);
  } catch (err: any) {
    logError('workspace_repo_get_failed', req, err);
    res.status(500).json({ error: 'Failed to load workspace repo' });
  }
});

// POST provision — { github_login }. Idempotent; validates the login up front.
router.post('/api/portal/workspace/repo/provision', requireParticipant, async (req, res) => {
  try {
    const svc = await import('../services/studentWorkspaceService');
    const githubLogin = req.body?.github_login;
    if (!svc.isValidGithubLogin(githubLogin)) {
      res.status(400).json({ error: 'A valid GitHub username is required' });
      return;
    }
    const view = await svc.provisionWorkspaceRepo(req.participant!.sub, githubLogin);
    res.status(201).json(view);
  } catch (err: any) {
    logError('workspace_repo_provision_failed', req, err);
    // A missing platform token is an operator misconfig, not a client error.
    const status = /GITHUB_TOKEN is not configured/.test(err?.message || '') ? 503 : 500;
    res.status(status).json({ error: status === 503 ? err.message : 'Failed to provision workspace repo' });
  }
});

// POST sync — pull the repo (no commit). No body.
router.post('/api/portal/workspace/repo/sync', requireParticipant, async (req, res) => {
  try {
    const svc = await import('../services/studentWorkspaceService');
    const view = await svc.syncWorkspaceRepo(req.participant!.sub);
    res.json(view);
  } catch (err: any) {
    logError('workspace_repo_sync_failed', req, err);
    const msg = err?.message || '';
    if (/No workspace repo provisioned/.test(msg)) {
      res.status(409).json({ error: msg });
      return;
    }
    const status = /GITHUB_TOKEN is not configured/.test(msg) ? 503 : 500;
    res.status(status).json({ error: status === 503 ? msg : 'Failed to sync workspace repo' });
  }
});

export default router;
