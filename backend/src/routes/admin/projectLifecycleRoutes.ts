import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireSection } from '../../middlewares/authMiddleware';
import { FLAGS } from '../../config/featureFlags';
import {
  lifecycleIdParam, lifecycleStatusQuery, transitionBody, approveBody, composeBody, zodIssues,
} from '../../schemas/projectLifecycleSchema';

/**
 * Admin — unified project lifecycle status, transitions and blueprint approval.
 *
 * ── THE GATE ─────────────────────────────────────────────────────────────────
 * Every route is `requireSection('program')`, the same section a delivery contract belongs to.
 * Two things must agree or a scoped mgmt token 403s: (1) `mgmtSectionGate`'s PATH_SECTION maps
 * `/api/admin/project-lifecycle` → 'program' (added in that file in the same commit), and (2) the
 * frontend nav declares the same section — which it will when Phase 5 adds the review page. There
 * is no frontend route yet, so no `UNLISTED_PATH_SECTIONS` row is needed: that list pairs
 * FRONTEND routes lacking a sidebar entry with a section, and its test iterates a fixed list
 * rather than deriving from PATH_SECTION. The route-auth lint (a required CI check) also requires
 * a recognised guard on every admin route file.
 *
 * The backend row is not optional even with no UI: the gate is DENY-BY-DEFAULT, so an unmapped
 * path reaches a bare 403 with nothing explaining why.
 *
 * ── SHIPS DARK ───────────────────────────────────────────────────────────────
 * Behind `FLAGS.lifecycleEnforcement` (`ENABLE_PROJECT_LIFECYCLE`), default off, matching the
 * `ENABLE_FACTORY_GENERATION` precedent. When disabled every route returns an EXPLICIT
 * `409 { lifecycleDisabled: true }` — never a generic success and never an empty 200. The request
 * is direct about this: "Disabled generation must be explicit, never a generic successful
 * fallback." A disabled feature that answers 200 with nothing is indistinguishable from a feature
 * that ran and found nothing.
 *
 * ── NO MODELS AT MODULE SCOPE ────────────────────────────────────────────────
 * Services are loaded with `await import` inside each handler. A static model import initialises
 * Sequelize at module load, which breaks every route test that stubs `config/database` — the
 * reason spelled out at `factoryRoutes.ts:9-11`. This file imports only Zod, the guard, the flag
 * and its own schemas, all of which are inert.
 */
const router = Router();

const SECTION = 'program';
const PREFIX = '/api/admin/project-lifecycle';

/** One structured line per request outcome. JSON to stdout, per the Observability Framework. */
function log(event: string, correlationId: string, outcome: 'success' | 'failure' | 'partial', context: Record<string, unknown>): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'error' : 'info',
    service: 'backend',
    event,
    correlation_id: correlationId,
    outcome,
    ...(context.error_class ? { error_class: context.error_class } : {}),
    context,
  }));
}

/**
 * Redact a PAYLOAD, never a whole log line.
 *
 * `redactForLogs` applied to an entire line mangles UUIDs — it rewrites anything that looks like
 * an identifier — so correlation ids and project ids become unusable for tracing exactly when a
 * trace is needed. Applied to the free-text fields only, it masks what it should.
 */
async function redactPayload(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { redactForLogs } = await import('../../utils/piiRedaction');
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    out[k] = typeof v === 'string' ? redactForLogs(v) : v;
  }
  return out;
}

function correlationOf(req: Request): string {
  return String(req.header('X-Correlation-ID') ?? (req as any).correlationId ?? `plc-${Date.now()}`);
}

/** The authenticated admin. Never read from a request body — that is a spoofable approver. */
function adminOf(req: Request): { id?: string; email?: string; role?: string } | undefined {
  return (req as any).admin;
}

/** The explicit disabled answer. Shared so no route can accidentally return a soft success. */
function disabled(res: Response): void {
  res.status(409).json({
    lifecycleDisabled: true,
    error: 'Project lifecycle enforcement is not enabled in this environment.',
    remedy: 'Set ENABLE_PROJECT_LIFECYCLE=true to enable it.',
  });
}

/**
 * GET /api/admin/project-lifecycle/:projectId?kind=student|delivery
 *
 * Where the project stands: stage, condition, what is missing, who acts next. The request requires
 * a user be able to tell this "without opening technical logs", so the blocker and next actor are
 * part of the response rather than something to infer from a stage name.
 */
router.get(`${PREFIX}/:projectId`, requireSection(SECTION), async (req: Request, res: Response) => {
  const correlationId = correlationOf(req);
  if (!FLAGS.lifecycleEnforcement) { disabled(res); return; }

  const p = lifecycleIdParam.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: 'Invalid project id.', issues: zodIssues(p.error) }); return; }
  const q = lifecycleStatusQuery.safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: 'Invalid query.', issues: zodIssues(q.error) }); return; }

  try {
    const { readLifecycleStatus } = await import('../../services/lifecycle/lifecycleStatus');
    const status = await readLifecycleStatus({
      projectId: p.data.projectId,
      kind: q.data.kind,
      admin: adminOf(req),
    });
    if (!status) { res.status(404).json({ error: 'No lifecycle is registered for that project.' }); return; }
    log('project_lifecycle_status_read', correlationId, 'success', { project_id: p.data.projectId, stage: status.stage });
    res.json(status);
  } catch (err: any) {
    const errorClass = err?.name ?? 'UnclassifiedError';
    // Honour the guard's OWN status. It deliberately throws 404 rather than 403 for a row in
    // another tenant, because a 403 confirms the row exists. Hardcoding 403 here would convert
    // that decision back into an existence oracle.
    if (errorClass === 'TenantAccessError') { res.status(err.status ?? 403).json({ error: err.message }); return; }
    log('project_lifecycle_status_read', correlationId, 'failure', {
      project_id: p.data.projectId, error_class: errorClass,
      ...(await redactPayload({ message: String(err?.message ?? err) })),
    });
    res.status(500).json({ error: 'Could not read the lifecycle status.' });
  }
});

/**
 * POST /api/admin/project-lifecycle/:projectId/transition
 *
 * A stage transition is a COMMAND. The client names the stage it wants; the server reads the
 * current stage from persisted state and decides. `from` is deliberately not accepted from the
 * body — a stale tab supplying it is how a project walks backwards through an edge that was legal
 * when the page loaded.
 */
router.post(`${PREFIX}/:projectId/transition`, requireSection(SECTION), async (req: Request, res: Response) => {
  const correlationId = correlationOf(req);
  if (!FLAGS.lifecycleEnforcement) { disabled(res); return; }

  const p = lifecycleIdParam.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: 'Invalid project id.', issues: zodIssues(p.error) }); return; }
  const b = transitionBody.safeParse(req.body ?? {});
  if (!b.success) { res.status(400).json({ error: 'Invalid body.', issues: zodIssues(b.error) }); return; }

  try {
    const { requestTransition } = await import('../../services/lifecycle/lifecycleStatus');
    const { refusalStatus } = await import('../../services/lifecycle/lifecycleTransition');
    const decision = await requestTransition({
      projectId: p.data.projectId,
      kind: b.data.kind,
      to: b.data.to,
      reason: b.data.reason ?? null,
      isDraftScenario: b.data.isDraftScenario === true,
      admin: adminOf(req),
    });

    if (!decision.allowed) {
      const status = decision.refusal ? refusalStatus(decision.refusal) : 409;
      log('project_lifecycle_transition', correlationId, 'partial', {
        project_id: p.data.projectId, to: b.data.to, refusal: decision.refusal, blocking: decision.blocking.length,
      });
      res.status(status).json({
        error: decision.message,
        refusal: decision.refusal,
        // The gap list is what makes a 422 actionable rather than a flat "no".
        gaps: decision.blocking,
        advisory: decision.advisory,
      });
      return;
    }

    log('project_lifecycle_transition', correlationId, 'success', {
      project_id: p.data.projectId, from: decision.from, to: decision.to, condition: decision.nextCondition,
    });
    res.json({ from: decision.from, to: decision.to, condition: decision.nextCondition, message: decision.message });
  } catch (err: any) {
    const errorClass = err?.name ?? 'UnclassifiedError';
    // See the note on the status route: the guard's own status is authoritative.
    if (errorClass === 'TenantAccessError') { res.status(err.status ?? 403).json({ error: err.message }); return; }
    log('project_lifecycle_transition', correlationId, 'failure', {
      project_id: p.data.projectId, error_class: errorClass,
      ...(await redactPayload({ message: String(err?.message ?? err) })),
    });
    res.status(500).json({ error: 'Could not apply the transition.' });
  }
});

/**
 * POST /api/admin/project-lifecycle/:projectId/approve
 *
 * Approve one exact blueprint revision. The approver comes from the authenticated session and is
 * never accepted from the body. `expectedRevision` is required with no default, because a default
 * would silently approve whatever revision is current — the stale approval the CAS exists to stop.
 */
router.post(`${PREFIX}/:projectId/approve`, requireSection(SECTION), async (req: Request, res: Response) => {
  const correlationId = correlationOf(req);
  if (!FLAGS.lifecycleEnforcement) { disabled(res); return; }

  const p = lifecycleIdParam.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: 'Invalid project id.', issues: zodIssues(p.error) }); return; }
  const b = approveBody.safeParse(req.body ?? {});
  if (!b.success) { res.status(400).json({ error: 'Invalid body.', issues: zodIssues(b.error) }); return; }

  const admin = adminOf(req);
  if (!admin?.email && !admin?.id) {
    res.status(403).json({ error: 'An approval requires an authenticated identity.' });
    return;
  }

  try {
    const { approveLifecycleBlueprint } = await import('../../services/lifecycle/lifecycleStatus');
    const result = await approveLifecycleBlueprint({
      projectId: p.data.projectId,
      manifestId: b.data.manifestId,
      expectedRevision: b.data.expectedRevision,
      scope: b.data.scope,
      rationale: b.data.rationale ?? null,
      selectedDesignRef: b.data.selectedDesignRef ?? null,
      admin,
    });

    log('project_lifecycle_approved', correlationId, 'success', {
      project_id: p.data.projectId, manifest_id: b.data.manifestId,
      revision: b.data.expectedRevision, already_approved: result.alreadyApproved,
    });
    // 200 on an idempotent hit, 201 on a new approval. The body says which, so a caller is never
    // left guessing whether its own click or an earlier one produced the record.
    res.status(result.alreadyApproved ? 200 : 201).json({
      alreadyApproved: result.alreadyApproved,
      approvedBy: result.approval.approved_by,
      approvedAt: result.approval.approved_at,
      revision: result.approval.revision,
    });
  } catch (err: any) {
    const { approvalErrorStatus } = await import('../../services/lifecycle/blueprintApproval');
    const errorClass = err?.name ?? 'UnclassifiedError';
    const status = errorClass === 'TenantAccessError' ? (err.status ?? 403) : approvalErrorStatus(err);

    log('project_lifecycle_approved', correlationId, status >= 500 ? 'failure' : 'partial', {
      project_id: p.data.projectId, manifest_id: b.data.manifestId, error_class: errorClass,
      ...(await redactPayload({ message: String(err?.message ?? err) })),
    });

    if (status === 500) { res.status(500).json({ error: 'Could not record the approval.' }); return; }
    res.status(status).json({
      error: err?.message ?? 'Approval refused.',
      errorClass,
      // ApprovalConflictError carries the real revision so a UI can refresh rather than retry blind.
      ...(typeof err?.currentRevision === 'number' ? { currentRevision: err.currentRevision } : {}),
      ...(Array.isArray(err?.issues) ? { issues: err.issues } : {}),
    });
  }
});

/**
 * POST /api/admin/project-lifecycle/:projectId/compose
 *
 * Validate a proposed blueprint and report every refusal at once.
 *
 * THIS ROUTE IS THE POINT OF P5-T1.4, not garnish on it. Before it, `generateBlueprint` had ZERO
 * non-test callers: the whole generation pipeline was a producer with no consumer, which this
 * repo has a standing rule about. This is its first.
 *
 * EVERY refusal is returned, not the first. A reviewer fixing a blueprint needs the whole list in
 * one pass; returning the earliest blocker and stopping turns one review into a queue of round
 * trips, and the stage on each refusal is what says where to look.
 *
 * 422 rather than 400 when it refuses. A 400 says "this request was malformed"; the request was
 * well formed and the BLUEPRINT is not ready, which is a different thing for a client to act on.
 * 400 stays for a body that failed the schema.
 */
router.post(`${PREFIX}/:projectId/compose`, requireSection(SECTION), async (req: Request, res: Response) => {
  const correlationId = correlationOf(req);
  if (!FLAGS.lifecycleEnforcement) { disabled(res); return; }

  const p = lifecycleIdParam.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: 'Invalid project id.', issues: zodIssues(p.error) }); return; }
  const b = composeBody.safeParse(req.body ?? {});
  if (!b.success) { res.status(400).json({ error: 'Invalid body.', issues: zodIssues(b.error) }); return; }

  // THE URL AND THE PAYLOAD MUST AGREE. `project.id` is what every validator and every ref in the
  // manifest is keyed on, so composing a body carrying project B under project A's URL would file
  // B's blueprint against A. Refused rather than reconciled: picking one of the two would be
  // guessing which the caller meant.
  const bodyProjectId = b.data.project.id;
  if (typeof bodyProjectId === 'string' && bodyProjectId !== p.data.projectId) {
    log('project_lifecycle_compose', correlationId, 'failure', {
      project_id: p.data.projectId, error_class: 'ProjectIdMismatch',
    });
    res.status(400).json({
      error: 'The project id in the URL and the project in the body are different projects.',
      errorClass: 'ProjectIdMismatch',
    });
    return;
  }

  try {
    const { composeBlueprint } = await import('../../services/lifecycle/generation/blueprintComposition');
    const out = composeBlueprint({
      ...(b.data as unknown as Parameters<typeof composeBlueprint>[0]),
      roleIds: new Set(b.data.roleIds ?? []),
      correlationId,
    });

    const composed = out.refusals.length === 0;
    log('project_lifecycle_compose', correlationId, composed ? 'success' : 'partial', {
      project_id: p.data.projectId,
      refusals: out.refusals.length,
      advisories: out.advisories.length,
      stages_refused: [...new Set(out.refusals.map((r) => r.stage))],
      ...(composed ? {} : { error_class: 'BlueprintCompositionRefused' }),
    });

    res.status(composed ? 200 : 422).json({
      composed,
      // Both lists, always. An advisory dropped from the response is a validation result the
      // reviewer cannot see, which is the same defect as dropping it in the mapper.
      refusals: out.refusals,
      advisories: out.advisories,
      selectedDesign: out.selectedDesign,
    });
  } catch (err: any) {
    const errorClass = err?.name ?? 'UnclassifiedError';
    // NO TenantAccessError BRANCH HERE, unlike the other handlers. `composeBlueprint` is pure
    // and touches no tenant-scoped row, so it cannot raise one — a mutation deleting the
    // branch survived every test, which is Amendment 4 category 2: an operand no input can
    // reach. Copied from the neighbours out of symmetry rather than need, and removed rather
    // than left as a declared expectation nothing can check.
    log('project_lifecycle_compose', correlationId, 'failure', {
      project_id: p.data.projectId, error_class: errorClass,
      ...(await redactPayload({ message: String(err?.message ?? err) })),
    });
    res.status(500).json({ error: 'Could not compose the blueprint.' });
  }
});

export default router;
