/**
 * platformBuildRoutes - the build runner's three calls, and the student's view of the result.
 *
 * RUNNER (GitHub OIDC, see runnerIdentity.ts; no session, no secret):
 *   GET  /api/platform-build/runs/:runId/bundle     claim the run, receive the workspace + briefs
 *   POST /api/platform-build/runs/:runId/artifacts  hand back the Command Center and demo spec
 *   POST /api/platform-build/runs/:runId/failure    report that the build could not finish
 *
 * VIEW (signed link, see viewToken.ts; minted by the authenticated portal project read):
 *   GET  /api/platform-view/:token/*                the hosted Command Center and Demo
 *
 * Under `/api/` deliberately: nginx already routes it, so no edge change ships with this.
 * Paths are limited to .html/.css/.js/.json/.md for the same reason (see uploadContract.ts).
 */
import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { env } from '../config/env';
import { verifyRunnerToken, RunnerIdentityError } from '../services/sbp/platformBuild/runnerIdentity';
import { getRun, transitionRun } from '../services/sbp/platformBuild/runStore';
import { checkUpload } from '../services/sbp/platformBuild/uploadContract';
import { saveRunArtifacts, activeArtifact, RunNotAcceptingUpload } from '../services/sbp/platformBuild/artifactStore';
import { runnerBundle, liveProjectFile } from '../services/sbp/platformBuild/bundle';
import { verifyViewToken } from '../services/sbp/platformBuild/viewToken';
import {
  resolveServePath, contentTypeFor, viewHeaders, injectShim, STORAGE_SHIM_JS, SHIM_PATH,
} from '../services/sbp/platformBuild/serveMap';

const router = Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function log(event: string, outcome: 'success' | 'failure' | 'partial', context: Record<string, unknown>, errorClass?: string): void {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'error' : 'info',
    service: 'sbp-platform-build',
    event,
    outcome,
    ...(errorClass ? { error_class: errorClass } : {}),
    context,
  });
  if (outcome === 'failure') console.error(line); else console.log(line);
}

/** Verify the runner, then load the run named in the path. Answers the request itself on failure. */
async function runnerRun(req: Request, res: Response) {
  const runId = String(req.params.runId || '');
  if (!UUID.test(runId)) { res.status(400).json({ error: 'bad run id' }); return null; }
  const header = String(req.headers.authorization || '');
  try {
    await verifyRunnerToken(header.startsWith('Bearer ') ? header.slice(7) : '', {
      repository: env.platformBuildRepo,
      workflowFile: env.platformBuildWorkflow,
    });
  } catch (err) {
    const cls = err instanceof RunnerIdentityError ? err.error_class : 'AuthError';
    log('platform_build_runner_refused', 'failure', { runId, reason: (err as Error).message }, cls);
    res.status(401).json({ error: 'not the platform build workflow' });
    return null;
  }
  const run = await getRun(runId);
  if (!run) { res.status(404).json({ error: 'run not found' }); return null; }
  return run;
}

router.get('/api/platform-build/runs/:runId/bundle', async (req: Request, res: Response) => {
  try {
    const run = await runnerRun(req, res);
    if (!run) return;
    if (run.status === 'uploaded') { res.status(409).json({ error: 'run already uploaded' }); return; }
    if (run.status !== 'dispatched' && run.status !== 'building') {
      res.status(409).json({ error: `run is ${run.status}` });
      return;
    }
    await transitionRun(run.id, ['dispatched'], 'building');
    const bundle = await runnerBundle(run.project_id, run.correlation_id);
    if (!bundle) {
      await transitionRun(run.id, ['building'], 'failed', { errorClass: 'ContractViolation', errorDetail: 'project has no published plan' });
      res.status(409).json({ error: 'project has no published plan' });
      return;
    }
    log('platform_build_bundle_served', 'success', { runId: run.id, projectId: run.project_id, files: Object.keys(bundle.files).length });
    res.json(bundle);
  } catch (err) {
    log('platform_build_bundle_failed', 'failure', { message: (err as Error).message }, (err as Error).name);
    res.status(503).json({ error: 'bundle unavailable' });
  }
});

router.post('/api/platform-build/runs/:runId/artifacts', async (req: Request, res: Response) => {
  try {
    const run = await runnerRun(req, res);
    if (!run) return;
    const verdict = checkUpload(req.body);
    if (!verdict.ok) {
      log('platform_build_upload_refused', 'failure', { runId: run.id, problems: verdict.problems.slice(0, 20) }, 'ValidationError');
      res.status(422).json({ error: 'upload refused', problems: verdict.problems });
      return;
    }
    const cost = typeof (req.body as { cost_usd?: unknown }).cost_usd === 'number' ? (req.body as { cost_usd: number }).cost_usd : null;
    const saved = await saveRunArtifacts(run.id, verdict.accepted, cost);
    log('platform_build_uploaded', 'success', {
      runId: run.id, projectId: run.project_id, duplicate: saved.duplicate,
      commandCenterVersion: saved.commandCenterVersion, demoVersion: saved.demoVersion,
      demoProblems: verdict.accepted.demoProblems.length,
    });
    res.json({ ok: true, ...saved, demo_problems: verdict.accepted.demoProblems });
  } catch (err) {
    if (err instanceof RunNotAcceptingUpload) { res.status(409).json({ error: err.message }); return; }
    log('platform_build_upload_failed', 'failure', { message: (err as Error).message }, (err as Error).name);
    res.status(503).json({ error: 'upload unavailable' });
  }
});

const FailureSchema = z.object({
  error_class: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/),
  detail: z.string().max(1000).optional(),
  cost_usd: z.number().nonnegative().max(1000).optional(),
}).strict();

router.post('/api/platform-build/runs/:runId/failure', async (req: Request, res: Response) => {
  try {
    const run = await runnerRun(req, res);
    if (!run) return;
    const parsed = FailureSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'body must be { error_class, detail?, cost_usd? }' }); return; }
    const moved = await transitionRun(run.id, ['dispatched', 'building'], 'failed', {
      errorClass: parsed.data.error_class, errorDetail: parsed.data.detail ?? null, costUsd: parsed.data.cost_usd ?? null,
    });
    log('platform_build_runner_failed', 'failure', { runId: run.id, projectId: run.project_id, moved }, parsed.data.error_class);
    res.json({ ok: true, moved });
  } catch (err) {
    log('platform_build_failure_report_failed', 'failure', { message: (err as Error).message }, (err as Error).name);
    res.status(503).json({ error: 'unavailable' });
  }
});

// ---- the view ---------------------------------------------------------------

const NOT_READY_HTML = '<!doctype html><html lang="en"><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width, initial-scale=1"><title>Not ready yet</title>'
  + '<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.5 system-ui,sans-serif;'
  + 'background:#f5f7fb;color:#13294b}main{max-width:34rem;padding:2rem}</style></head><body><main>'
  + '<h1>This page is not ready yet.</h1><p>The platform is still building it, or the link has expired. '
  + 'Go back to your project in the portal and open the link again.</p></main></body></html>';

function send(res: Response, status: number, body: string, type: string, headers: Record<string, string>): void {
  res.status(status);
  for (const [k, v] of Object.entries(headers)) res.set(k, v);
  res.set('Content-Type', type);
  res.send(body);
}

async function serveView(req: Request, res: Response, token: string, rest: string): Promise<void> {
  const projectId = verifyViewToken(token, env.jwtSecret);
  const target = projectId ? resolveServePath(rest) : null;
  if (!projectId || !target) {
    send(res, 404, NOT_READY_HTML, 'text/html; charset=utf-8', viewHeaders({ html: true }));
    return;
  }
  try {
    switch (target.kind) {
      case 'redirect':
        res.redirect(302, `${req.path}/`);
        return;
      case 'shim':
        send(res, 200, STORAGE_SHIM_JS, contentTypeFor(SHIM_PATH), viewHeaders({ html: false }));
        return;
      case 'live': {
        const body = await liveProjectFile(projectId, target.path);
        if (body === null) break;
        send(res, 200, body, contentTypeFor(target.path), viewHeaders({ html: false }));
        return;
      }
      case 'demo_spec': {
        const demo = await activeArtifact(projectId, 'demo');
        const body = demo?.files['demo/demo-spec.json'];
        if (!body) break;
        send(res, 200, body, contentTypeFor('demo/demo-spec.json'), viewHeaders({ html: false }));
        return;
      }
      case 'demo_engine': {
        const demo = await activeArtifact(projectId, 'demo');
        if (!demo) break;
        const { demoKitFiles } = await import('../services/sbp/demoKit');
        const { DEMO_KIT_ENGINE_PATH } = await import('../services/sbp/connectedDemoStory');
        const { withScriptNonce } = await import('../services/sbp/demoRender');
        const engine = demoKitFiles().find((f) => f.path === DEMO_KIT_ENGINE_PATH)?.content;
        if (!engine) break;
        const nonce = crypto.randomBytes(16).toString('base64');
        const html = withScriptNonce(injectShim(engine, `../${SHIM_PATH}`), nonce);
        send(res, 200, html, 'text/html; charset=utf-8', viewHeaders({ html: true, nonce }));
        return;
      }
      case 'cc_file': {
        const cc = await activeArtifact(projectId, 'command_center');
        const body = cc?.files[target.path];
        if (body === undefined) break;
        const isHtml = target.path.endsWith('.html');
        const depth = target.path.split('/').length - 1;
        const out = isHtml ? injectShim(body, `${'../'.repeat(depth)}${SHIM_PATH}`) : body;
        send(res, 200, out, contentTypeFor(target.path), viewHeaders({ html: isHtml }));
        return;
      }
      default:
        break;
    }
    // A data file the page asked for and we do not have (an optional enrichment file, say) is a
    // plain 404 the sandboxed page can READ. Without the CORS header the browser reports it as a
    // network failure instead, found by loading the v13 Command Center in Edge.
    const isPage = target.kind === 'cc_file' ? target.path.endsWith('.html') : target.kind === 'demo_engine';
    if (!isPage) {
      send(res, 404, '{"error":"not found"}', 'application/json; charset=utf-8', viewHeaders({ html: false }));
      return;
    }
    send(res, 404, NOT_READY_HTML, 'text/html; charset=utf-8', viewHeaders({ html: true }));
  } catch (err) {
    log('platform_view_failed', 'failure', { projectId, path: rest, message: (err as Error).message }, (err as Error).name);
    send(res, 503, NOT_READY_HTML, 'text/html; charset=utf-8', viewHeaders({ html: true }));
  }
}

/*
 * ONE route, matched by pattern, because Express's non-strict routing treats a trailing slash as
 * optional: a separate `/:token` route that redirected to `/:token/` also matched `/:token/`
 * itself, and the Command Center's root URL redirected to itself forever. Here the redirect fires
 * only when the slash is genuinely absent, which is the case relative paths need fixed.
 */
router.get(/^\/api\/platform-view\/([^/]+)(\/.*)?$/, (req: Request, res: Response) => {
  const params = req.params as unknown as Record<string, string | undefined>;
  const token = String(params[0] ?? '');
  const tail = params[1];
  if (tail === undefined) {
    res.redirect(302, `${req.path}/`);
    return;
  }
  // Express has already URL-decoded the capture. Decoding again would let `%252e%252e` become
  // `..`; resolveServePath refuses that anyway, but one decode is the honest number.
  void serveView(req, res, token, tail.slice(1));
});

export default router;
