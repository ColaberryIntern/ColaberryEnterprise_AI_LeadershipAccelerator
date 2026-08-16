import { Router } from 'express';
import { randomUUID } from 'crypto';
import { requireParticipant } from '../middlewares/participantAuth';
import { z } from 'zod';

// Per-student workspace repo routes. Every route is participant-authed and the
// enrollmentId is taken from the verified JWT (req.participant!.sub), never from
// the body — a student can only touch their own repo. The service is
// dynamic-imported so route wiring stays cheap and matches the projectRoutes /
// github-integration pattern in participantRoutes.ts.
//
// Mounted next to projectRoutes via `router.use(workspaceRoutes)`.
//
// CONNECT is the primary surface here now. Student build repos are
// STUDENT-OWNED (Ali Muwwakkil, 2026-08-14): the platform stores a pointer and
// the evidence, never the code. `/connect` and `/connect/confirm` bind a repo
// the student already has; `/provision` stays as the fallback for a student who
// has no repo yet; `/docs/bundle` serves the same documents as a download for a
// student with no repo at all. See docs/REPO_CONNECT_CONTRACT.md.

const router = Router();

// Every route is project-scoped (FR-037). The enrollment still comes from the
// verified JWT and never from the request — a student can only reach their own
// project, and the service re-checks ownership before any GitHub call.
const projectIdSchema = z.string().uuid('A valid projectId is required');
// Story ids are plan-authored (`STORY-001`), not UUIDs, and the column is
// VARCHAR(60). Bounded here so an oversized query string is rejected at the
// boundary rather than becoming a wide LIKE-free equality scan downstream.
const storyIdSchema = z.string().min(1, 'A story id is required').max(60);
const provisionSchema = z.object({
  project_id: z.string().uuid(),
  github_login: z.string().min(1),
});

/**
 * Connect a repo the student already has.
 *
 * `repo` is intentionally a loose string at this boundary: parsing a GitHub
 * reference is a domain concern with five accepted shapes and a specific,
 * actionable rejection message for each failure. Zod's job here is to reject
 * absent, oversized or non-string input; `parseRepoReference` produces the
 * message a student can act on.
 */
const connectSchema = z.object({
  project_id: z.string().uuid(),
  repo: z.string().min(1, 'Paste the GitHub address of your repo').max(500),
  /**
   * Explicit consent to move a build off a repo that already has commits in it.
   * The refusal exists so a rebind cannot happen by ACCIDENT; this is how a
   * student says they meant it.
   */
  confirm_replace: z.boolean().optional(),
});
const confirmSchema = z.object({ project_id: z.string().uuid() });

/** A failed ownership check surfaces as 404, never 403 — see requireOwnedProject. */
function statusFor(err: any): number {
  // A classified connect error decided its own status when it was constructed.
  if (typeof err?.http_status === 'number') return err.http_status;
  if (typeof err?.status === 'number') return err.status;
  if (err?.error_class === 'QueueFull') return 503;
  if (/GITHUB_TOKEN is not configured/.test(err?.message || '')) return 503;
  if (/No workspace repo provisioned/.test(err?.message || '')) return 409;
  return 500;
}

/**
 * The sentence the student reads.
 *
 * Every failure in the connect flow carries one, because "Invalid input" for a
 * repo that is private, or claimed, or simply not pushed yet sends a student to
 * Slack instead of to their terminal. A generic message is only used for
 * classes that genuinely are our side.
 */
function messageFor(err: any, fallback: string): string {
  if (typeof err?.student_message === 'string') return err.student_message;
  const status = statusFor(err);
  if (status === 404) return 'Project not found';
  if (status === 409 || status === 503 || status === 429) return err?.message || fallback;
  return fallback;
}

function errorBody(err: any, fallback: string): Record<string, unknown> {
  return {
    error: messageFor(err, fallback),
    error_class: err?.error_class ?? null,
    ...(err?.details && typeof err.details === 'object' ? { details: err.details } : {}),
  };
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
      error_class: err?.error_class ?? err?.constructor?.name ?? 'Error',
      // The message only — never the error object, which could carry a request
      // init and therefore an Authorization header.
      context: { message: err?.message },
    }),
  );
}

const correlationOf = (req: any): string =>
  (req.headers['x-correlation-id'] as string) || randomUUID();

// GET the current workspace repo state (including where the connect flow is up to).
router.get('/api/portal/workspace/repo', requireParticipant, async (req, res) => {
  try {
    const projectId = projectIdSchema.parse(req.query.project_id);
    const svc = await import('../services/studentWorkspaceService');
    const view = await svc.getWorkspaceRepo(req.participant!.sub, projectId);
    res.json(view);
  } catch (err: any) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Invalid input', issues: err.issues }); return; }
    logError('workspace_repo_get_failed', req, err);
    res.status(statusFor(err)).json(errorBody(err, 'Failed to load workspace repo'));
  }
});

/**
 * GET the verification state of ONE story. The workspace page polls this while
 * a student has the story open, so the boxes and the completion gate can follow
 * what the repo actually says without a manual refresh.
 *
 * READ-ONLY BY DESIGN. It reports the verdict the last sync wrote; it does not
 * run one. A student holding the page open therefore cannot drive GitHub calls
 * or move their own state no matter how long they leave it there — which is the
 * property that makes a poll safe to ship. The write path stays exactly where it
 * was: `/repo/sync` and the push webhook, both rate-limited by GitHub itself.
 *
 * 404 covers "not yours", "no such project" and "no such story" alike, so this
 * cannot be used to probe for somebody else's build.
 */
router.get('/api/portal/workspace/story-verification', requireParticipant, async (req, res) => {
  try {
    const projectId = projectIdSchema.parse(req.query.project_id);
    const storyId = storyIdSchema.parse(req.query.story_id);
    const { readStoryVerification } = await import('../services/sbp/verification/storyVerificationRead');
    const view = await readStoryVerification(req.participant!.sub, projectId, storyId);
    if (!view) { res.status(404).json({ error: 'Story not found' }); return; }
    res.json(view);
  } catch (err: any) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Invalid input', issues: err.issues }); return; }
    logError('workspace_story_verification_get_failed', req, err);
    res.status(statusFor(err)).json(errorBody(err, 'Failed to load story verification'));
  }
});

/**
 * GET what the student needs to register their own push webhook.
 *
 * CARRIES A SECRET, so: participant-authed, project-scoped, ownership proven
 * before anything is assembled, and deliberately a route of its own rather than
 * folded into `/repo`. The general repo view is fetched on every workspace load
 * and passed around the page; the signing secret should be requested explicitly,
 * by the one panel that has a reason to show it, and nowhere else.
 *
 * Never logged. `logError` below records the event name and the error class, and
 * the view itself never reaches a log line.
 */
router.get('/api/portal/workspace/webhook-setup', requireParticipant, async (req, res) => {
  try {
    const projectId = projectIdSchema.parse(req.query.project_id);
    const { getWebhookSetup } = await import('../services/sbp/repoConnect/webhookSetupService');
    // Ownership is proven inside, before a secret is read or minted. 404 covers
    // "not yours" and "no such project" alike.
    const view = await getWebhookSetup(req.participant!.sub, projectId);
    if (!view) { res.status(404).json({ error: 'Project not found' }); return; }
    res.json(view);
  } catch (err: any) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Invalid input', issues: err.issues }); return; }
    logError('workspace_webhook_setup_failed', req, err);
    res.status(statusFor(err)).json(errorBody(err, 'Failed to load webhook setup'));
  }
});

// ── door A: bring your own repo ──────────────────────────────────────────────

// POST connect — { repo } → validates the repo and issues the push proof.
//
// Two steps rather than one because the platform has no student OAuth: every
// question it can ask GitHub answers "can WE reach this repo", never "can THEY
// push to it". The only act that proves push access is a push, so the student
// commits a per-project token and `/connect/confirm` reads it back.
router.post('/api/portal/workspace/repo/connect', requireParticipant, async (req, res) => {
  try {
    const body = connectSchema.parse(req.body ?? {});
    const { startConnect } = await import('../services/sbp/repoConnect/repoConnectService');
    const view = await startConnect(req.participant!.sub, body.project_id, body.repo, {
      confirmReplace: body.confirm_replace,
      correlationId: correlationOf(req),
    });
    res.status(200).json(view);
  } catch (err: any) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Invalid input', issues: err.issues }); return; }
    logError('workspace_repo_connect_failed', req, err);
    res.status(statusFor(err)).json(errorBody(err, 'Could not connect that repo'));
  }
});

// POST connect/confirm — read the proof file and bind the repo. Idempotent:
// confirming an already-connected project succeeds without doing anything.
router.post('/api/portal/workspace/repo/connect/confirm', requireParticipant, async (req, res) => {
  try {
    const body = confirmSchema.parse(req.body ?? {});
    const { confirmConnect } = await import('../services/sbp/repoConnect/repoConnectService');
    const view = await confirmConnect(req.participant!.sub, body.project_id, {
      correlationId: correlationOf(req),
    });
    res.status(200).json(view);
  } catch (err: any) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Invalid input', issues: err.issues }); return; }
    logError('workspace_repo_connect_confirm_failed', req, err);
    res.status(statusFor(err)).json(errorBody(err, 'Could not confirm that repo'));
  }
});

// ── door B: provision an empty repo, then adopt the existing folder ──────────

// POST provision — { github_login }. Idempotent; validates the login up front.
//
// Creates the repo EMPTY so the student's existing folder pushes into it as a
// plain fast-forward and their history arrives intact. The response carries the
// exact `git remote add` / `push -u` commands.
router.post('/api/portal/workspace/repo/provision', requireParticipant, async (req, res) => {
  try {
    const body = provisionSchema.parse(req.body ?? {});
    const svc = await import('../services/studentWorkspaceService');
    if (!svc.isValidGithubLogin(body.github_login)) {
      res.status(400).json({
        error: 'That does not look like a GitHub username. It is the name in your profile URL — github.com/<username>.',
        error_class: 'InvalidGithubLogin',
      });
      return;
    }
    // FR-040: provisioning goes through the bounded queue, so a cohort starting
    // together cannot exhaust the platform token's secondary rate limit.
    const { getProvisionQueue } = await import('../services/sbp/boundedQueue');
    const { adoptProvisionedRepo } = await import('../services/sbp/repoConnect/repoConnectService');
    const view = await getProvisionQueue().run(
      () => adoptProvisionedRepo(req.participant!.sub, body.project_id, body.github_login),
      body.project_id,
    );
    res.status(201).json(view);
  } catch (err: any) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Invalid input', issues: err.issues }); return; }
    logError('workspace_repo_provision_failed', req, err);
    res.status(statusFor(err)).json(errorBody(err, 'Failed to create your workspace repo'));
  }
});

// ── sync ────────────────────────────────────────────────────────────────────

// POST sync — pull the repo (no commit).
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
    const correlationId = correlationOf(req);
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

    // Hosting check, detached. Sync is the other natural "something changed, go
    // and look again" moment, and covering it matters: a student who enables
    // Pages and never pushes again would otherwise never get their link. It runs
    // AFTER the response is composed and is never awaited — the sync the student
    // asked for must not wait on a Pages probe, and must not fail with one.
    if (view?.repo_owner && view?.repo_name) {
      const owner = view.repo_owner;
      const repo = view.repo_name;
      void (async () => {
        try {
          const { recordPagesUrlIfLive } = await import('../services/sbp/repoConnect/pagesUrlService');
          await recordPagesUrlIfLive(projectId, owner, repo, { correlationId });
        } catch { /* classified and logged inside; this guards the detached promise */ }
      })();
    }

    res.json({ ...view, verification });
  } catch (err: any) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Invalid input', issues: err.issues }); return; }
    logError('workspace_repo_sync_failed', req, err);
    res.status(statusFor(err)).json(errorBody(err, 'Failed to sync workspace repo'));
  }
});

// ── the no-git fallback ──────────────────────────────────────────────────────

// GET docs/bundle — the SAME rendered document set as a zip, for a student who
// has not connected a repo yet.
//
// A nudge toward connecting, not a parallel path we maintain forever: the
// archive leads with docs/CONNECT-YOUR-REPO.md, and the response says in a
// header and in the log that verification and points require a repo.
router.get('/api/portal/workspace/docs/bundle', requireParticipant, async (req, res) => {
  try {
    const projectId = projectIdSchema.parse(req.query.project_id);
    // Ownership FIRST — before a plan is read, before anything is rendered.
    const svc = await import('../services/studentWorkspaceService');
    await svc.getWorkspaceRepo(req.participant!.sub, projectId);

    const { buildDocsBundle } = await import('../services/sbp/docsBundle');
    const bundle = await buildDocsBundle(projectId);

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'info', service: 'backend',
      event: 'workspace_docs_bundle_downloaded', correlation_id: correlationOf(req),
      outcome: 'success',
      context: { project_id: projectId, files: bundle.paths.length, plan_version: bundle.planVersion, published: bundle.published },
    }));

    // ASCII-only filename: the slug is [a-z0-9-] by construction, so no RFC 5987
    // encoding dance is needed and none is faked.
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${bundle.filename}"`);
    res.setHeader('Content-Length', String(bundle.bytes.length));
    res.setHeader('Cache-Control', 'no-store');
    // Machine-readable restatement of what the archive says on its first page.
    res.setHeader('X-Colaberry-Verification', 'requires-connected-repo');
    res.setHeader('X-Colaberry-Plan-Version', String(bundle.planVersion));
    res.status(200).send(bundle.bytes);
  } catch (err: any) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Invalid input', issues: err.issues }); return; }
    logError('workspace_docs_bundle_failed', req, err);
    res.status(statusFor(err)).json(errorBody(err, 'Could not build your document bundle'));
  }
});

export default router;
