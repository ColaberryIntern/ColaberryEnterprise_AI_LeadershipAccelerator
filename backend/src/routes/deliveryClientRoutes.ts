import { Response, Router } from 'express';
import { Op } from 'sequelize';
import {
  DeliveryClientRequest,
  requireDeliveryClient,
  requireDeliveryProjectAccess,
} from '../middlewares/deliveryClientAuth';
import {
  findForbiddenFields,
  toClientShape,
  toClientShapes,
} from '../modules/delivery/clientVisibility';

/**
 * deliveryClientRoutes — the read surface an external client reviewer actually sees.
 *
 * Gate 10's safety property is that **a client sees the engagement and nothing else**. Two
 * mechanisms enforce it here, and they are deliberately independent so that neither one
 * failing silently opens the surface:
 *
 * 1. **Scope comes from the token, never from the request.** `delivery_project_ids` was
 *    stamped at sign-in from memberships that already existed. A project id in the URL is
 *    checked against that list by `requireDeliveryProjectAccess` before any handler runs.
 *    There is no query parameter, filter, or body field on this router that can widen what
 *    a session can reach — the only input that selects data is the token itself.
 *
 * 2. **Every payload is rebuilt from an allowlist.** `toClientShape` constructs a new
 *    object from `CLIENT_FIELD_ALLOWLIST` rather than deleting keys from a model row, so a
 *    column added to `delivery_projects` next month is invisible here by default. That is
 *    the difference between a surface that is safe now and one that stays safe.
 *
 * ## The tripwire is not redundant
 *
 * `assertNoForbiddenFields` re-scans the finished payload for internal vocabulary
 * (`risk_*`, `builder_*`, `execution_*`, cost fields) immediately before it is sent. The
 * allowlist should already make this impossible, which is the point: it fails **loud in
 * development** and **logs and continues in production**, per CLAUDE.md's contract rule.
 * If it ever fires, the allowlist has been bypassed by a code path nobody remembered.
 *
 * ## Absence of a write surface is deliberate
 *
 * This router is read-only. Client acceptance and change requests are real actions with
 * real consequences and they get their own reviewed endpoints; they are not smuggled in as
 * a `PATCH` next to a list view.
 */

const router = Router();

/**
 * Fail loud in development, log and continue in production.
 *
 * Returning a 500 in production for a tripwire that has never fired would turn a
 * defence-in-depth check into an outage. Returning 200 in development would let the same
 * bug ship. Both halves are intentional.
 */
function assertNoForbiddenFields(payload: unknown, label: string, res: Response): boolean {
  const hits = findForbiddenFields(payload);
  if (hits.length === 0) return true;

  const summary = hits.map((h) => `${h.path}:${h.category}`).join(', ');
  // Never log the values — only which fields leaked and where.
  console.error(
    JSON.stringify({
      level: 'error',
      service: 'delivery-client-api',
      event: 'client_payload_forbidden_fields',
      outcome: 'failure',
      error_class: 'ContractViolation',
      context: { label, hits: summary },
    }),
  );

  if (process.env.NODE_ENV !== 'production') {
    res.status(500).json({ error: 'Response failed the client visibility check.' });
    return false;
  }
  return true;
}

/**
 * GET /api/refactored/client/projects
 *
 * The projects this session covers. Never "all projects filtered by" — the id list comes
 * from the token, so an empty membership cannot degrade into a full listing.
 */
router.get(
  '/api/refactored/client/projects',
  requireDeliveryClient,
  async (req: DeliveryClientRequest, res: Response) => {
    try {
      const ids = req.deliveryClient!.delivery_project_ids;
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { DeliveryProject } = require('../models');

      const rows = await DeliveryProject.findAll({ where: { id: { [Op.in]: ids } } });
      const projects = toClientShapes(
        'project',
        rows.map((r: any) => r.get({ plain: true })),
      );

      const payload = { projects };
      if (!assertNoForbiddenFields(payload, 'client_projects_list', res)) return;
      res.json(payload);
    } catch (err) {
      console.error(
        JSON.stringify({
          level: 'error',
          service: 'delivery-client-api',
          event: 'client_projects_list_failed',
          outcome: 'failure',
          error_class: (err as Error)?.constructor?.name ?? 'Error',
        }),
      );
      res.status(500).json({ error: 'Unable to load your projects right now.' });
    }
  },
);

/**
 * GET /api/refactored/client/projects/:projectId
 *
 * One engagement, as the client is owed it: the decisions they were asked to make, the
 * releases they were given, the change requests they raised, and the documents published
 * to them. A project outside the session's scope returns **404, not 403** — see
 * `requireDeliveryProjectAccess` for why.
 */
router.get(
  '/api/refactored/client/projects/:projectId',
  requireDeliveryClient,
  requireDeliveryProjectAccess('projectId'),
  async (req: DeliveryClientRequest, res: Response) => {
    const projectId = req.params.projectId as string;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { DeliveryProject, DeliveryDecision, DeliveryChangeRequest } = require('../models');

      const project = await DeliveryProject.findOne({ where: { id: projectId } });
      if (!project) {
        // The token said this project is in scope and the table disagrees. That is a data
        // problem, not an access decision, but the client-facing answer is the same 404 —
        // distinguishing them here would leak that the id is a real one.
        res.status(404).json({ error: 'Not found' });
        return;
      }

      const plain = (r: any) => r.get({ plain: true });

      // Decisions and change requests are scoped by project id, which the guard above has
      // already confirmed belongs to this session.
      const [decisionRows, changeRows] = await Promise.all([
        DeliveryDecision.findAll({ where: { delivery_project_id: projectId } }),
        DeliveryChangeRequest.findAll({ where: { delivery_project_id: projectId } }),
      ]);

      const payload = {
        project: toClientShape('project', plain(project)),
        // A client is owed the decisions they were asked to weigh in on. Internal design
        // decisions stay internal; `requires_client_approval` is the line.
        decisions: toClientShapes('decision', decisionRows.map(plain)),
        changeRequests: toClientShapes('change_request', changeRows.map(plain)),
      };

      if (!assertNoForbiddenFields(payload, 'client_project_detail', res)) return;
      res.json(payload);
    } catch (err) {
      console.error(
        JSON.stringify({
          level: 'error',
          service: 'delivery-client-api',
          event: 'client_project_detail_failed',
          outcome: 'failure',
          error_class: (err as Error)?.constructor?.name ?? 'Error',
          context: { projectId },
        }),
      );
      res.status(500).json({ error: 'Unable to load this project right now.' });
    }
  },
);

export default router;
