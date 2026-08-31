import { Request, Response, Router } from 'express';
import { requireAdmin } from '../middlewares/authMiddleware';
import { assignBuilderToProject } from '../services/delivery/builderAssignment';
import { evaluateStoryGate, recordEvidence, upsertStory } from '../services/delivery/storyEvidence';
import { mentorQueueFor } from '../services/delivery/mentorState';
import {
  approveRelease,
  createReleaseCandidate,
  evaluateRelease,
  recordReleaseCheck,
  waiveReleaseCheck,
} from '../services/delivery/releaseManagement';
import { linkStudentProject, linkedStudentProjects } from '../services/delivery/projectSourceLink';
import { candidatesForProject, intakeSignal } from '../services/delivery/signalIntake';
import { claimFromEvidence, ledgerFor } from '../services/delivery/experienceClaims';

/**
 * deliveryAdminRoutes — the operator side of the delivery OS. One action, to begin with.
 *
 * The delivery OS shipped a client READ surface and no operator WRITE surface: nothing
 * created engagements, assigned builders, recorded evidence or cut releases. The Gate
 * 9–14 logic therefore had nothing to guard, and E2E scenario C — *the fourth concurrent
 * assignment is refused* — had nothing to observe.
 *
 * This is the first real write path, deliberately narrow: assign a builder to a project,
 * with the capacity model genuinely consulted. It establishes the pattern the other gates
 * would follow rather than committing to the whole operator surface at once.
 *
 * ## Why this is admin-gated and not client-gated
 *
 * Assignment is a staff decision about staff. `requireAdmin` gates on
 * `ADMIN_ROLES.has(payload.role)`, and a client session carries no `role` claim at all —
 * so a client token cannot reach this even by accident. That is the same structural
 * separation Gate 10 relies on, working in the other direction.
 */

const router = Router();

/**
 * POST /api/refactored/admin/projects/:projectId/assign
 *
 * Body: `{ builderIdentityId, role }`.
 *
 * Returns 201 on assignment, **409 when the builder is at capacity**, and 422 for the
 * other refusals. A refusal is an ordinary answer here, not an error: "she is on three
 * projects already" is information the caller must render, not an exception.
 */
router.post(
  '/api/refactored/admin/projects/:projectId/assign',
  requireAdmin,
  async (req: Request, res: Response) => {
    const projectId = typeof req.params?.projectId === 'string' ? req.params.projectId : '';
    const builderIdentityId =
      typeof req.body?.builderIdentityId === 'string' ? req.body.builderIdentityId : '';
    const role = typeof req.body?.role === 'string' ? req.body.role : '';

    if (!projectId || !builderIdentityId || !role) {
      res.status(400).json({ error: 'projectId, builderIdentityId and role are all required.' });
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const models = require('../models');

      // Was reading req.user, which requireAdmin never sets - see actorOf below. This
      // route had been recording a null granted_by_identity_id since it shipped.
      const actorIdentityId = actorOf(req);

      const outcome = await assignBuilderToProject({
        projectId,
        builderIdentityId,
        role,
        actorIdentityId: actorIdentityId as string,
        models,
      });

      if (outcome.assigned) {
        res.status(201).json({
          membershipId: outcome.membershipId,
          // Surfaced so a lead can see they are now relying on an exception, without
          // having to go and look for one.
          reliesOnOverride: outcome.assessment.reliesOnOverride,
          activeProjects: outcome.assessment.activeProjects,
          effectiveMax: outcome.assessment.effectiveMax,
        });
        return;
      }

      // 409 for capacity specifically: the request was well-formed and the state of the
      // world refused it, which is what Conflict means. 422 lumps it in with malformed
      // input and loses that distinction for a caller deciding whether to retry.
      const status = outcome.reason === 'overloaded' ? 409 : 422;
      res.status(status).json({
        error: outcome.message,
        reason: outcome.reason,
        ...(outcome.assessment ? { assessment: outcome.assessment } : {}),
      });
    } catch (err) {
      console.error(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'error',
          service: 'delivery-admin',
          event: 'builder_assignment_failed',
          outcome: 'failure',
          error_class: (err as Error)?.constructor?.name ?? 'Error',
          context: { projectId },
        }),
      );
      res.status(500).json({ error: 'Could not complete the assignment.' });
    }
  },
);

/**
 * POST /api/refactored/admin/projects/:projectId/stories
 *
 * Body: a `DeliveryStoryContract` plus optional `isUiStory`.
 *
 * **A contract with blocking issues is refused, not stored.** Gate 7's validator draws
 * the line at whether a problem would mislead about what is being built; storing one
 * that misleads means the quality gate later reasons about a story that does not
 * describe reality, and every verdict after that is worthless. Warnings are returned
 * and stored, because a thin contract is still a real one.
 */
router.post(
  '/api/refactored/admin/projects/:projectId/stories',
  requireAdmin,
  async (req: Request, res: Response) => {
    const projectId = typeof req.params?.projectId === 'string' ? req.params.projectId : '';
    const contract = req.body?.contract;
    if (!projectId || !contract || typeof contract.storyId !== 'string') {
      res.status(400).json({ error: 'projectId and a contract with a storyId are required.' });
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const models = require('../models');
      const out = await upsertStory({
        projectId,
        contract,
        isUiStory: req.body?.isUiStory === true,
        actorIdentityId: null,
        models,
      });

      if ('refused' in out) {
        // 422: the request was well-formed JSON but the contract itself is not valid.
        res.status(422).json({ error: 'The story contract has blocking issues.', issues: out.issues });
        return;
      }
      res.status(out.created ? 201 : 200).json(out);
    } catch (err) {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(), level: 'error', service: 'delivery-admin',
        event: 'story_upsert_failed', outcome: 'failure',
        error_class: (err as Error)?.constructor?.name ?? 'Error', context: { projectId },
      }));
      res.status(500).json({ error: 'Could not save the story.' });
    }
  },
);

/**
 * POST /api/refactored/admin/projects/:projectId/evidence
 *
 * Records one measurement. **Idempotent** on the Gate 9 key, because master plan §15
 * requires a replayed execution callback to produce no duplicate evidence - a runner
 * retrying a webhook is the normal case, and two rows for one measurement would let a
 * single test run satisfy a dimension twice.
 */
router.post(
  '/api/refactored/admin/projects/:projectId/evidence',
  requireAdmin,
  async (req: Request, res: Response) => {
    const projectId = typeof req.params?.projectId === 'string' ? req.params.projectId : '';
    const { dimension, evidenceType, outcome } = req.body ?? {};
    if (!projectId || !dimension || !evidenceType || !outcome) {
      res.status(400).json({ error: 'dimension, evidenceType and outcome are required.' });
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const models = require('../models');
      const out = await recordEvidence({
        projectId,
        storyId: typeof req.body?.storyId === 'string' ? req.body.storyId : null,
        dimension,
        evidenceType,
        outcome,
        subjectSha: req.body?.subjectSha ?? null,
        sourceRef: req.body?.sourceRef ?? null,
        payload: req.body?.payload ?? null,
        models,
      });
      // 200 rather than 201 on a dedup: nothing was created, and a caller retrying a
      // webhook should be able to tell that from the status alone.
      res.status(out.deduped ? 200 : 201).json(out);
    } catch (err) {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(), level: 'error', service: 'delivery-admin',
        event: 'evidence_record_failed', outcome: 'failure',
        error_class: (err as Error)?.constructor?.name ?? 'Error', context: { projectId },
      }));
      res.status(500).json({ error: 'Could not record the evidence.' });
    }
  },
);

/**
 * GET /api/refactored/admin/projects/:projectId/stories/:storyKey/quality-gate
 *
 * Runs Gate 9 against the evidence **actually recorded** for the story. The caller
 * chooses which story and which commit; it does not get to supply the evidence, because
 * a caller passing its own list could pass the gate by describing a healthier world than
 * the one that exists.
 *
 * Returns 200 with the verdict either way - a failing gate is an answer, not an error.
 */
router.get(
  '/api/refactored/admin/projects/:projectId/stories/:storyKey/quality-gate',
  requireAdmin,
  async (req: Request, res: Response) => {
    const projectId = typeof req.params?.projectId === 'string' ? req.params.projectId : '';
    const storyKey = typeof req.params?.storyKey === 'string' ? req.params.storyKey : '';
    const candidateSha = typeof req.query?.sha === 'string' ? req.query.sha : null;

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const models = require('../models');
      const out = await evaluateStoryGate({ projectId, storyKey, candidateSha, models });
      if (!out) {
        res.status(404).json({ error: 'No such story on this project.' });
        return;
      }
      res.json(out);
    } catch (err) {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(), level: 'error', service: 'delivery-admin',
        event: 'quality_gate_failed', outcome: 'failure',
        error_class: (err as Error)?.constructor?.name ?? 'Error', context: { projectId, storyKey },
      }));
      res.status(500).json({ error: 'Could not evaluate the quality gate.' });
    }
  },
);
/**
 * GET /api/refactored/admin/builders/:builderIdentityId/mentor-queue
 *
 * Gate 11: the exceptions that should pull a mentor toward one builder, prioritised.
 *
 * **The response carries `unsourceable` and that is not optional.** Two of the eight
 * inputs have no source in the schema - there is no join from a builder to a trust
 * requirement, and `delivery_decisions.decision_type` has no vocabulary. A queue that
 * returned six answers as if they were eight would tell a mentor a builder is fine when
 * the truth is that nobody looked. Any UI over this must render it.
 *
 * Always 200. An empty queue is the intended outcome for a healthy builder, not a 404.
 */
router.get(
  '/api/refactored/admin/builders/:builderIdentityId/mentor-queue',
  requireAdmin,
  async (req: Request, res: Response) => {
    const builderIdentityId =
      typeof req.params?.builderIdentityId === 'string' ? req.params.builderIdentityId : '';
    if (!builderIdentityId) {
      res.status(400).json({ error: 'builderIdentityId is required.' });
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const models = require('../models');
      const out = await mentorQueueFor({ builderIdentityId, models });
      res.json(out);
    } catch (err) {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(), level: 'error', service: 'delivery-admin',
        event: 'mentor_queue_failed', outcome: 'failure',
        error_class: (err as Error)?.constructor?.name ?? 'Error', context: { builderIdentityId },
      }));
      res.status(500).json({ error: 'Could not build the mentor queue.' });
    }
  },
);

/**
 * The release surface (Gates 13 + 14).
 *
 * `releaseManagement` had no HTTP surface, so scenario D - *government profile, missing
 * accessibility evidence, release blocked* - had nothing to drive. A script calling the
 * service directly would have looked like an executed scenario while testing the same
 * thing the unit tests already do.
 *
 * Every refusal here is an ordinary answer with a status code, never a thrown error: a
 * blocked release is the gate working.
 */
const models = () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../models');
};

/**
 * Who is acting.
 *
 * **`requireAdmin` populates `req.admin`, not `req.user`.** Reading `req.user` returned
 * `undefined` on every admin route, which E2E scenario D caught: approval 401'd because
 * there was no approving identity, and the pre-existing assignment route had been
 * recording a null `granted_by_identity_id` since it shipped. Nothing failed - a nullable
 * column accepted the null every time.
 *
 * `sub` is the identity on a real admin token (`AuthPayload`); `platform_identity_id` is
 * present on tokens that carry one. Both are checked, and `req.user` is still consulted
 * last so this keeps working if a route is ever mounted behind a different guard.
 */
type ActorBearing = {
  admin?: { platform_identity_id?: string; sub?: string; id?: string };
  user?: { platform_identity_id?: string; sub?: string; id?: string };
};

/**
 * Every actor column in this schema is a UUID. A token whose subject is not one - a
 * legacy admin login, a hand-made token - would make the INSERT fail and turn an
 * assignment into a 500, which is a worse outcome than the audit field being empty.
 *
 * Found by scenario C immediately after the req.user fix landed: its admin token carried
 * the subject 'e2e-c-admin', and every assignment started returning 500 where it had
 * previously written a silent null.
 *
 * So a malformed actor is dropped, but LOUDLY - the whole point of the fix was that a
 * missing actor should stop being invisible.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const actorOf = (req: Request): string | null => {
  const r = req as unknown as ActorBearing;
  const candidate =
    r.admin?.platform_identity_id ??
    r.admin?.sub ??
    r.admin?.id ??
    r.user?.platform_identity_id ??
    r.user?.sub ??
    r.user?.id ??
    null;

  if (!candidate) return null;
  if (!UUID_RE.test(candidate)) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'error', service: 'delivery-admin',
      event: 'actor_identity_not_uuid', outcome: 'partial',
      error_class: 'ContractViolation',
      context: { path: req.path },
    }));
    return null;
  }
  return candidate;
};

const releaseError = (res: Response, event: string, err: unknown, context: object) => {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'error', service: 'delivery-admin',
    event, outcome: 'failure',
    error_class: (err as Error)?.constructor?.name ?? 'Error', context,
  }));
  res.status(500).json({ error: 'The release operation could not be completed.' });
};

/** POST /api/refactored/admin/projects/:projectId/releases - cut a candidate. */
router.post(
  '/api/refactored/admin/projects/:projectId/releases',
  requireAdmin,
  async (req: Request, res: Response) => {
    const projectId = typeof req.params?.projectId === 'string' ? req.params.projectId : '';
    const version = typeof req.body?.version === 'string' ? req.body.version : '';
    if (!projectId || !version) {
      res.status(400).json({ error: 'projectId and version are required.' });
      return;
    }
    try {
      const out = await createReleaseCandidate({
        projectId, version,
        candidateSha: req.body?.candidateSha ?? null,
        actorIdentityId: actorOf(req),
        models: models(),
      });
      if (!out.ok) {
        res.status(422).json({ error: out.message, reason: out.reason, issues: out.issues });
        return;
      }
      res.status(201).json(out);
    } catch (err) { releaseError(res, 'release_create_failed', err, { projectId }); }
  },
);

/** POST /api/refactored/admin/releases/:releaseId/checks - record one check result. */
router.post(
  '/api/refactored/admin/releases/:releaseId/checks',
  requireAdmin,
  async (req: Request, res: Response) => {
    const releaseId = typeof req.params?.releaseId === 'string' ? req.params.releaseId : '';
    const { check, outcome } = req.body ?? {};
    if (!releaseId || !check || !outcome) {
      res.status(400).json({ error: 'check and outcome are required.' });
      return;
    }
    try {
      const out = await recordReleaseCheck({
        releaseId, check, outcome, detail: req.body?.detail ?? null, models: models(),
      });
      if (!out.ok) { res.status(422).json({ error: out.message, reason: out.reason }); return; }
      res.status(201).json(out);
    } catch (err) { releaseError(res, 'release_check_failed', err, { releaseId }); }
  },
);

/**
 * POST /api/refactored/admin/releases/:releaseId/waivers
 *
 * **422 without a reason.** A waiver is a governance event; one recorded with no
 * justification is indistinguishable afterwards from the gate never having applied.
 */
router.post(
  '/api/refactored/admin/releases/:releaseId/waivers',
  requireAdmin,
  async (req: Request, res: Response) => {
    const releaseId = typeof req.params?.releaseId === 'string' ? req.params.releaseId : '';
    const { check, reason } = req.body ?? {};
    if (!releaseId || !check) {
      res.status(400).json({ error: 'check is required.' });
      return;
    }
    try {
      const out = await waiveReleaseCheck({
        releaseId, check, reason: typeof reason === 'string' ? reason : '',
        actorIdentityId: actorOf(req), models: models(),
      });
      if (!out.ok) { res.status(422).json({ error: out.message, reason: out.reason }); return; }
      res.status(201).json(out);
    } catch (err) { releaseError(res, 'release_waiver_failed', err, { releaseId }); }
  },
);

/** GET /api/refactored/admin/releases/:releaseId/gate - 200 either way. */
router.get(
  '/api/refactored/admin/releases/:releaseId/gate',
  requireAdmin,
  async (req: Request, res: Response) => {
    const releaseId = typeof req.params?.releaseId === 'string' ? req.params.releaseId : '';
    try {
      const out = await evaluateRelease({ releaseId, models: models() });
      if (!out.ok) { res.status(404).json({ error: out.message, reason: out.reason }); return; }
      res.json(out.gate);
    } catch (err) { releaseError(res, 'release_gate_failed', err, { releaseId }); }
  },
);

/** POST /api/refactored/admin/releases/:releaseId/approve - 409 when the gate refuses. */
router.post(
  '/api/refactored/admin/releases/:releaseId/approve',
  requireAdmin,
  async (req: Request, res: Response) => {
    const releaseId = typeof req.params?.releaseId === 'string' ? req.params.releaseId : '';
    const approver = actorOf(req);
    if (!approver) {
      // A release is approved by a person, never by a pipeline. No identity, no approval.
      res.status(401).json({ error: 'An approving identity is required.' });
      return;
    }
    try {
      const out = await approveRelease({ releaseId, approverIdentityId: approver, models: models() });
      if (!out.ok) {
        // 409: the request was well-formed and the state of the world refused it.
        res.status(409).json({ error: out.message, reason: out.reason, gate: out.gate });
        return;
      }
      res.json(out.gate);
    } catch (err) { releaseError(res, 'release_approve_failed', err, { releaseId }); }
  },
);

/**
 * POST /api/refactored/admin/projects/:projectId/source-links
 *
 * Attach an existing student Project to a delivery project (scenario E).
 *
 * **Writes nothing to the student project.** Master plan §24 makes student Project
 * regression a stop condition, and the service is built so it cannot: the link lives
 * entirely in its own table. 422 without a reason, for the same argument as a waiver.
 */
router.post(
  '/api/refactored/admin/projects/:projectId/source-links',
  requireAdmin,
  async (req: Request, res: Response) => {
    const projectId = typeof req.params?.projectId === 'string' ? req.params.projectId : '';
    const studentProjectId =
      typeof req.body?.studentProjectId === 'string' ? req.body.studentProjectId : '';
    if (!projectId || !studentProjectId) {
      res.status(400).json({ error: 'projectId and studentProjectId are required.' });
      return;
    }
    try {
      const out = await linkStudentProject({
        deliveryProjectId: projectId,
        studentProjectId,
        reason: typeof req.body?.reason === 'string' ? req.body.reason : '',
        actorIdentityId: actorOf(req),
        models: models(),
      });
      if (!out.ok) { res.status(422).json({ error: out.message, reason: out.reason }); return; }
      // 200 on a replay so a caller can tell it did not create a second link.
      res.status(out.created ? 201 : 200).json(out);
    } catch (err) { releaseError(res, 'source_link_failed', err, { projectId }); }
  },
);

/** GET /api/refactored/admin/projects/:projectId/source-links */
router.get(
  '/api/refactored/admin/projects/:projectId/source-links',
  requireAdmin,
  async (req: Request, res: Response) => {
    const projectId = typeof req.params?.projectId === 'string' ? req.params.projectId : '';
    try {
      res.json({ links: await linkedStudentProjects({ deliveryProjectId: projectId, models: models() }) });
    } catch (err) { releaseError(res, 'source_links_read_failed', err, { projectId }); }
  },
);

/**
 * POST /api/refactored/admin/projects/:projectId/signals
 *
 * Gate 14 Operate: a production signal proposes a candidate and **changes nothing**.
 *
 * 201 with a candidate, or 422 with the refusals verbatim. The refusal that matters most
 * is `no_observation`: a conclusion drawn from telemetry that was never observed is a
 * fabrication, and it is the kind that reads as a real finding.
 */
router.post(
  '/api/refactored/admin/projects/:projectId/signals',
  requireAdmin,
  async (req: Request, res: Response) => {
    const projectId = typeof req.params?.projectId === 'string' ? req.params.projectId : '';
    const { kind, signal, summary, evidence } = req.body ?? {};
    if (!projectId || !kind || !signal || !summary || !evidence) {
      res.status(400).json({ error: 'kind, signal, summary and evidence are required.' });
      return;
    }
    try {
      const out = await intakeSignal({
        projectId, kind, signal, summary, evidence,
        aboutMissingTelemetry: req.body?.aboutMissingTelemetry === true,
        actorIdentityId: actorOf(req),
        models: models(),
      });
      if (!out.ok) {
        res.status(out.reason === 'no_such_project' ? 404 : 422)
          .json({ error: out.message, reason: out.reason, refusals: out.refusals });
        return;
      }
      res.status(201).json(out);
    } catch (err) { releaseError(res, 'signal_intake_failed', err, { projectId }); }
  },
);

/** GET /api/refactored/admin/projects/:projectId/signals */
router.get(
  '/api/refactored/admin/projects/:projectId/signals',
  requireAdmin,
  async (req: Request, res: Response) => {
    const projectId = typeof req.params?.projectId === 'string' ? req.params.projectId : '';
    try {
      res.json({ candidates: await candidatesForProject({ projectId, models: models() }) });
    } catch (err) { releaseError(res, 'signal_read_failed', err, { projectId }); }
  },
);

/**
 * POST /api/refactored/admin/builders/:builderIdentityId/claims
 *
 * Gate 11's Experience Ledger. Earn one claim from one recorded piece of evidence.
 *
 * **`builderDidTheWork` must be an explicit boolean.** `evaluateClaim` rejects a `false`
 * but an omitted value passes its check, so silence would become credit - which is the
 * attendance-only credit §Gate 11 forbids. 422 rather than a default.
 *
 * The request names WHICH evidence backs the claim. It does not get to say what that
 * evidence showed; type and outcome are read from the row.
 */
router.post(
  '/api/refactored/admin/builders/:builderIdentityId/claims',
  requireAdmin,
  async (req: Request, res: Response) => {
    const builderIdentityId =
      typeof req.params?.builderIdentityId === 'string' ? req.params.builderIdentityId : '';
    const { claimType, evidenceId, builderDidTheWork } = req.body ?? {};
    if (!builderIdentityId || !claimType || !evidenceId) {
      res.status(400).json({ error: 'claimType and evidenceId are required.' });
      return;
    }
    try {
      const out = await claimFromEvidence({
        builderIdentityId, claimType, evidenceId,
        builderDidTheWork,
        humanConfirmed: req.body?.humanConfirmed === true,
        attestedByIdentityId: actorOf(req),
        models: models(),
      });
      if (!out.ok) {
        res.status(out.reason === 'no_such_evidence' ? 404 : 422)
          .json({ error: out.message, reason: out.reason, rejections: out.rejections });
        return;
      }
      res.status(out.created ? 201 : 200).json(out);
    } catch (err) { releaseError(res, 'claim_failed', err, { builderIdentityId }); }
  },
);

/** GET /api/refactored/admin/builders/:builderIdentityId/ledger */
router.get(
  '/api/refactored/admin/builders/:builderIdentityId/ledger',
  requireAdmin,
  async (req: Request, res: Response) => {
    const builderIdentityId =
      typeof req.params?.builderIdentityId === 'string' ? req.params.builderIdentityId : '';
    try {
      res.json(await ledgerFor({ builderIdentityId, models: models() }));
    } catch (err) { releaseError(res, 'ledger_read_failed', err, { builderIdentityId }); }
  },
);

export default router;
