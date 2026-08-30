import { Request, Response, Router } from 'express';
import { requireAdmin } from '../middlewares/authMiddleware';
import { assignBuilderToProject } from '../services/delivery/builderAssignment';
import { evaluateStoryGate, recordEvidence, upsertStory } from '../services/delivery/storyEvidence';

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

      const actorIdentityId =
        (req as unknown as { user?: { platform_identity_id?: string; id?: string } }).user
          ?.platform_identity_id ??
        (req as unknown as { user?: { id?: string } }).user?.id ??
        null;

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
export default router;
