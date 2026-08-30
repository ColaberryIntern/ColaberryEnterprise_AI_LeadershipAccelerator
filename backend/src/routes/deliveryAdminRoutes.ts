import { Request, Response, Router } from 'express';
import { requireAdmin } from '../middlewares/authMiddleware';
import { assignBuilderToProject } from '../services/delivery/builderAssignment';

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

export default router;
