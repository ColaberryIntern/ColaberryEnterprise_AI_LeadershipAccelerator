import { Router, Request, Response } from 'express';
import { requireSection } from '../../middlewares/authMiddleware';
import { FLAGS } from '../../config/featureFlags';
import { lifecycleIdParam, zodIssues } from '../../schemas/projectLifecycleSchema';
import {
  compareQuery, changeRequestBody, linkedQuery,
} from '../../schemas/projectLifecycleReviewSchema';
import {
  SECTION, PREFIX, log, redactPayload, correlationOf, adminOf, disabled,
} from '../projectLifecycleRouteSupport';

/**
 * Admin — blueprint REVIEW: compare two revisions, request changes to one, and read the records
 * connected to one record.
 *
 * Split out of `projectLifecycleRoutes.ts` when that file reached 496 lines, 4 short of
 * CLAUDE.md's hard 500-line ceiling. The seam matches the services: that file answers "where does
 * this project stand and what may it do next" (status, transition, approve, compose); this one
 * answers "what changed, what must change, and what connects to what".
 *
 * Everything shared — the section constant, the path prefix, the structured logger, the payload
 * redactor and the explicit disabled answer — is IMPORTED from `projectLifecycleRouteSupport`.
 * A second copy of `PREFIX` here would be a second place the route path could be wrong, and a
 * second `disabled()` a second chance for a route to answer a soft success when the feature is
 * off.
 *
 * `requireSection` is applied per ROUTE, not once per file: the route-auth lint checks per file,
 * so a file-level-only guard would pass the lint while leaving an individual route open.
 *
 * No models at module scope — services are `await import`ed inside each handler, for the reason
 * at `factoryRoutes.ts:9-11`: a static model import initialises Sequelize at module load and
 * breaks every route test that stubs `config/database`.
 */
const router = Router();

/**
 * GET /api/admin/project-lifecycle/:projectId/revisions/compare?kind=&from=&to=
 *
 * What changed between two revisions of the operating blueprint. With no `from`/`to` it compares
 * the newest two, which is the question a reviewer is actually asking.
 *
 * THE FOUR OUTCOMES ARE DISTINCT RESPONSES, not one 200 with an empty diff. "Nothing changed",
 * "there is only one revision", "this project has no blueprint" and "the revision you named does
 * not exist" lead to four different actions, and a reviewer shown an all-clear screen for the
 * middle two would approve something nobody compared.
 */
router.get(`${PREFIX}/:projectId/revisions/compare`, requireSection(SECTION), async (req: Request, res: Response) => {
  const correlationId = correlationOf(req);
  if (!FLAGS.lifecycleEnforcement) { disabled(res); return; }

  const p = lifecycleIdParam.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: 'Invalid project id.', issues: zodIssues(p.error) }); return; }
  const q = compareQuery.safeParse(req.query ?? {});
  if (!q.success) { res.status(400).json({ error: 'Invalid query.', issues: zodIssues(q.error) }); return; }

  try {
    const { compareBlueprintRevisions } = await import('../../services/lifecycle/blueprintChangeRequest');
    const out = await compareBlueprintRevisions({
      projectId: p.data.projectId,
      kind: q.data.kind,
      fromRevision: q.data.from,
      toRevision: q.data.to,
      admin: adminOf(req),
    });

    if (out.state === 'no_manifest') {
      log('project_lifecycle_compare', correlationId, 'partial', { project_id: p.data.projectId, state: out.state });
      res.status(404).json({ state: out.state, error: 'This project has no operating blueprint to compare.' });
      return;
    }
    if (out.state === 'revision_not_found') {
      log('project_lifecycle_compare', correlationId, 'partial', {
        project_id: p.data.projectId, state: out.state, requested: out.requested.length,
      });
      res.status(404).json({
        state: out.state,
        error: 'One of the requested revisions does not exist for this project.',
        // The available list is what makes this actionable rather than a flat "no".
        requested: out.requested,
        available: out.available,
      });
      return;
    }
    if (out.state === 'single_revision') {
      log('project_lifecycle_compare', correlationId, 'success', { project_id: p.data.projectId, state: out.state });
      res.json({ state: out.state, only: out.only });
      return;
    }

    log('project_lifecycle_compare', correlationId, 'success', {
      project_id: p.data.projectId, state: out.state,
      from: out.from.revision, to: out.to.revision,
      changed: out.diff.changed, unreadable: out.diff.unreadable.length,
    });
    res.json(out);
  } catch (err: any) {
    const errorClass = err?.name ?? 'UnclassifiedError';
    if (errorClass === 'TenantAccessError') { res.status(err.status ?? 403).json({ error: err.message }); return; }
    log('project_lifecycle_compare', correlationId, 'failure', {
      project_id: p.data.projectId, error_class: errorClass,
      ...(await redactPayload({ message: String(err?.message ?? err) })),
    });
    res.status(500).json({ error: 'Could not compare the revisions.' });
  }
});

/**
 * POST /api/admin/project-lifecycle/:projectId/request-changes
 *
 * Send a revision back to its author with what must change. Persists as the lifecycle's own
 * `awaiting_input` condition rather than in a new table — `blueprintChangeRequest.ts` carries why,
 * and why that makes a resubmit idempotent by construction.
 *
 * AN IDENTICAL RESUBMIT ANSWERS 200 WITH `applied: false`, not 409. It is not an error: the end
 * state the caller asked for is the end state that exists. The flag is there so a UI can say
 * "already requested" rather than claiming it just sent a second one.
 */
router.post(`${PREFIX}/:projectId/request-changes`, requireSection(SECTION), async (req: Request, res: Response) => {
  const correlationId = correlationOf(req);
  if (!FLAGS.lifecycleEnforcement) { disabled(res); return; }

  const p = lifecycleIdParam.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: 'Invalid project id.', issues: zodIssues(p.error) }); return; }
  const b = changeRequestBody.safeParse(req.body ?? {});
  if (!b.success) { res.status(400).json({ error: 'Invalid body.', issues: zodIssues(b.error) }); return; }

  try {
    const { requestBlueprintChanges } = await import('../../services/lifecycle/blueprintChangeRequest');
    const out = await requestBlueprintChanges({
      projectId: p.data.projectId,
      kind: b.data.kind,
      revision: b.data.revision,
      text: b.data.text,
      admin: adminOf(req),
    });

    log('project_lifecycle_request_changes', correlationId, 'success', {
      project_id: p.data.projectId, revision: out.revision, applied: out.applied,
    });
    res.json({ applied: out.applied, revision: out.revision, condition: 'awaiting_input' });
  } catch (err: any) {
    const errorClass = err?.name ?? 'UnclassifiedError';
    if (errorClass === 'TenantAccessError') { res.status(err.status ?? 403).json({ error: err.message }); return; }
    if (errorClass === 'ChangeRequestRefused') {
      // A refusal carries its own status and a machine-readable reason, so a UI can tell
      // "you lack the authority" from "that revision does not exist" without parsing prose.
      log('project_lifecycle_request_changes', correlationId, 'partial', {
        project_id: p.data.projectId, refusal: err.refusal,
      });
      res.status(err.status ?? 409).json({ error: err.message, refusal: err.refusal });
      return;
    }
    log('project_lifecycle_request_changes', correlationId, 'failure', {
      project_id: p.data.projectId, error_class: errorClass,
      ...(await redactPayload({ message: String(err?.message ?? err) })),
    });
    res.status(500).json({ error: 'Could not record the change request.' });
  }
});

/**
 * GET /api/admin/project-lifecycle/:projectId/linked?kind=&entityId=
 *
 * The records connected to one record, in the same project. Backs the linked views: selecting a
 * requirement reveals its proposal section and its downstream story; selecting an assignment
 * reveals the role it names.
 *
 * NOTHING IS NEVER A BARE EMPTY LIST. The service distinguishes "that id is not in this
 * manifest" from "this blueprint records no edge of that kind", and the response carries which,
 * because a reviewer who reads an empty panel as "this record stands alone" has been told
 * something the manifest never said.
 */
router.get(`${PREFIX}/:projectId/linked`, requireSection(SECTION), async (req: Request, res: Response) => {
  const correlationId = correlationOf(req);
  if (!FLAGS.lifecycleEnforcement) { disabled(res); return; }

  const p = lifecycleIdParam.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: 'Invalid project id.', issues: zodIssues(p.error) }); return; }
  const q = linkedQuery.safeParse(req.query ?? {});
  if (!q.success) { res.status(400).json({ error: 'Invalid query.', issues: zodIssues(q.error) }); return; }

  try {
    const { loadLatestManifestRefs } = await import('../../services/lifecycle/blueprintChangeRequest');
    const latest = await loadLatestManifestRefs({
      projectId: p.data.projectId, kind: q.data.kind, admin: adminOf(req),
    });
    if (latest === null) {
      log('project_lifecycle_linked', correlationId, 'partial', {
        project_id: p.data.projectId, state: 'no_manifest',
      });
      res.status(404).json({
        state: 'no_manifest',
        error: 'This project has no operating blueprint, so it has no records to link.',
      });
      return;
    }

    // The traversal is PURE and the role registry is injected, so there is one definition of
    // "is this a real role" rather than a second copy inside the traversal.
    const { connectedRecords } = await import('../../services/lifecycle/linkedViews');
    const { isKnownDeliveryRole } = await import('../../modules/delivery/deliveryRoles');
    const out = connectedRecords(latest.refs, q.data.entityId, isKnownDeliveryRole);

    log('project_lifecycle_linked', correlationId, 'success', {
      project_id: p.data.projectId, revision: latest.revision,
      view_kind: out.entity?.viewKind ?? null,
      groups: out.groups.length, unlinked: out.unlinked?.kind ?? null,
    });
    res.json({ state: 'linked', revision: latest.revision, ...out });
  } catch (err: any) {
    const errorClass = err?.name ?? 'UnclassifiedError';
    if (errorClass === 'TenantAccessError') { res.status(err.status ?? 403).json({ error: err.message }); return; }
    log('project_lifecycle_linked', correlationId, 'failure', {
      project_id: p.data.projectId, error_class: errorClass,
      ...(await redactPayload({ message: String(err?.message ?? err) })),
    });
    res.status(500).json({ error: 'Could not read the connected records.' });
  }
});

export default router;
