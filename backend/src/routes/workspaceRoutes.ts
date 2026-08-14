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
  if (err?.error_class === 'QueueFull') return 503;
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
    // FR-040: provisioning goes through the bounded queue, so a cohort starting
    // together cannot exhaust the platform token's secondary rate limit.
    const { getProvisionQueue } = await import('../services/sbp/boundedQueue');
    const view = await getProvisionQueue().run(
      () => svc.provisionWorkspaceRepo(req.participant!.sub, body.project_id, body.github_login),
      body.project_id,
    );
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
//
// Sync is also the TRIGGER for the completion-verification loop: pulling the
// repo is exactly the moment we have fresh commits and a fresh
// `.colaberry/progress.json`, so re-deriving what is done costs one extra read
// and no new button for the student to learn.
//
// A webhook is the better trigger and is deliberately NOT built. See
// docs/BUILD_VERIFICATION_CONTRACT.md — the pieces it needs (a public endpoint,
// signature verification, the bot-commit filter that stops our own writes
// re-triggering a sync) are a workstream of their own, and half of it would be
// worse than none.
router.post('/api/portal/workspace/repo/sync', requireParticipant, async (req, res) => {
  try {
    const projectId = projectIdSchema.parse(req.body?.project_id);
    const correlationId = (req.headers['x-correlation-id'] as string) || randomUUID();
    const svc = await import('../services/studentWorkspaceService');
    const view = await svc.syncWorkspaceRepo(req.participant!.sub, projectId);

    // Ownership was already proven by syncWorkspaceRepo above; reaching here
    // means this project is the caller's. Verification NEVER fails the sync: the
    // repo pull is the thing the student asked for, and a rate-limited or
    // unreadable verification pass must not turn a successful pull into an
    // error. It returns its own classified reason instead.
    let verification: unknown = null;
    try {
      const { verifyBuildFromRepo } = await import('../services/sbp/verification/buildVerificationService');
      verification = await verifyBuildFromRepo(projectId, { correlationId });
    } catch (verifyErr: any) {
      // Only an UNEXPECTED failure reaches here — every expected state
      // (no plan, no repo, rate limit, malformed file) comes back as a
      // classified result. So this is logged loudly as a defect, not swallowed,
      // and the sync still succeeds because the pull did.
      logError('workspace_verification_failed', req, verifyErr);
      verification = {
        ok: false,
        error_class: 'VerificationUnavailable',
        reason: 'Your repo synced, but the platform could not re-check your stories just now. Try Sync again shortly.',
      };
    }

    res.json({ ...view, verification });
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
