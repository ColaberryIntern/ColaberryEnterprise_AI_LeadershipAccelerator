import { Router, Response } from 'express';
import { requireParticipant } from '../middlewares/participantAuth';
import { requireGovProjectAccess, resolveGovProjectActor, type GovProjectRequest } from '../middlewares/govProjectAccess';
import { getStudentGovProjectView } from '../services/factory/govProjectProjection';

/**
 * govProjectPortalRoutes — the STUDENT entry point to an assigned government project.
 *
 * Guard chain, in order (the order is the security property):
 *   requireParticipant            — authenticate the student (sets req.participant.email)
 *   requireGovProjectAccess       — project-scoped membership: tenant guard first (audited, 404 cross-tenant),
 *                                   then delivery permission (404 for a NON-member so they cannot even learn the
 *                                   project exists, 403 for a member lacking the permission)
 *   -> getStudentGovProjectView   — a STUDENT-SAFE projection (never an admin/internal field)
 *
 * A student sees ONLY the gov projects they are a DeliveryProjectMember of; every other project id is a 404.
 * This does NOT use requireSection('program') — it would hand an intern the whole Program surface.
 */
const router = Router();

/**
 * GET /api/portal/gov-projects — the gov projects THIS intern is an active member of (for the "on your profile"
 * card). Membership-scoped: it lists ONLY the caller's own active DeliveryProjectMember rows, joined to
 * non-archived government_public_sector projects, so it can never enumerate a project they are not on. Minimal
 * fields only (id, name, status); the full student-safe view is the per-project GET below. requireParticipant is
 * enough here — there is no project param to guard, and the query is already scoped to the caller's identity.
 */
router.get(
  '/api/portal/gov-projects',
  requireParticipant,
  async (req: GovProjectRequest, res: Response) => {
    try {
      const actor = await resolveGovProjectActor(req);
      if (!actor) { res.json({ projects: [] }); return; } // no resolvable identity ⇒ nothing assigned
      const { default: DeliveryProjectMember } = await import('../models/DeliveryProjectMember');
      const { default: DeliveryProject } = await import('../models/DeliveryProject');
      const memberships: any[] = await DeliveryProjectMember.findAll({
        where: { platform_identity_id: actor.platformIdentityId, status: 'active' },
      });
      const ids = Array.from(new Set(memberships.map((m) => m.delivery_project_id).filter(Boolean)));
      if (ids.length === 0) { res.json({ projects: [] }); return; }
      const projects: any[] = await DeliveryProject.findAll({ where: { id: ids } });
      const cards = projects
        .filter((p) => p && p.project_class === 'government_public_sector' && !p.archived_at)
        .map((p) => ({ projectId: String(p.id), name: String(p.name ?? ''), status: String(p.status ?? '') }));
      res.json({ projects: cards });
    } catch {
      res.status(500).json({ error: 'Could not load your projects.' });
    }
  },
);

router.get(
  '/api/portal/gov-projects/:projectId',
  requireParticipant,
  requireGovProjectAccess('project.read'),
  async (req: GovProjectRequest, res: Response) => {
    // The guard already refused a non-string (repeated) param with 400; narrow again for type-safety + defense.
    const projectId = req.params.projectId;
    if (typeof projectId !== 'string' || !projectId) {
      res.status(400).json({ error: 'Project id is required' });
      return;
    }
    try {
      // Does THIS viewer hold evidence.verify? (a reviewer does; a student does not) — lights up reviewer controls.
      const { hasDeliveryPermission } = await import('../modules/delivery/deliveryAuthorization');
      const viewerCanVerify = !!(req.deliveryContext && hasDeliveryPermission(req.deliveryContext, 'evidence.verify'));
      // Pass the guard-resolved identity so the projection can resolve THIS viewer's proposal share level (P6).
      const viewerIdentityId = req.deliveryContext?.platformIdentityId ?? null;
      const view = await getStudentGovProjectView(projectId, viewerCanVerify, viewerIdentityId);
      // Access already passed the guard; a null here means the project is not a (non-archived) gov project.
      if (!view) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.json({ project: view });
    } catch {
      res.status(500).json({ error: 'Could not load the project.' });
    }
  },
);

/**
 * POST /api/portal/gov-projects/:projectId/build-stories/:storyId/evidence — the student's completion HAND-IN for
 * a Build story. Guarded by requireGovProjectAccess('story.execute'): an assigned associate_builder holds
 * story.execute, so they may submit; they do NOT hold evidence.verify, so they can never self-verify — the
 * record is recorded `submitted`, and verification is a separate reviewer-only act. The submitter identity is the
 * one the guard resolved (req.deliveryContext.platformIdentityId), never a client-supplied value.
 */
router.post(
  '/api/portal/gov-projects/:projectId/build-stories/:storyId/evidence',
  requireParticipant,
  requireGovProjectAccess('story.execute'),
  async (req: GovProjectRequest, res: Response) => {
    const projectId = req.params.projectId;
    const storyId = req.params.storyId;
    if (typeof projectId !== 'string' || !projectId || typeof storyId !== 'string' || !storyId) {
      res.status(400).json({ error: 'Project and story ids are required' });
      return;
    }
    const body: any = req.body ?? {};
    // canonical_req_id comes from the body, or is derived from the STORY-<reqId> id as a fallback.
    const canonicalReqId = String(body.canonicalReqId ?? (storyId.startsWith('STORY-') ? storyId.slice(6) : '')).trim();
    const submittedByIdentityId = req.deliveryContext?.platformIdentityId ?? null;
    if (!submittedByIdentityId) {
      res.status(401).json({ error: 'No resolvable identity' });
      return;
    }
    const { submitBuildStoryEvidence, EvidenceInputError } = await import('../services/factory/govBuildEvidence');
    try {
      const evidence = await submitBuildStoryEvidence({
        deliveryProjectId: projectId, storyId, canonicalReqId,
        description: String(body.description ?? ''), artifactRef: body.artifactRef ?? null,
        submittedByIdentityId,
      });
      res.status(201).json({ evidence });
    } catch (err: any) {
      if (err instanceof EvidenceInputError) { res.status(400).json({ error: err.message }); return; }
      res.status(500).json({ error: 'Could not submit the evidence.' });
    }
  },
);

/**
 * POST /api/portal/gov-projects/:projectId/build-evidence/:evidenceId/verify — a REVIEWER decides a submitted
 * hand-in (verified | rejected). Guarded by requireGovProjectAccess('evidence.verify'): a student's
 * associate_builder role does NOT hold evidence.verify (403), so only a reviewer reaches this; the service adds
 * separation-of-duties (a reviewer cannot decide evidence they submitted) and refuses re-deciding. The reviewer
 * identity is the guard-resolved one, never client-supplied.
 */
router.post(
  '/api/portal/gov-projects/:projectId/build-evidence/:evidenceId/verify',
  requireParticipant,
  requireGovProjectAccess('evidence.verify'),
  async (req: GovProjectRequest, res: Response) => {
    const projectId = req.params.projectId;
    const evidenceId = req.params.evidenceId;
    if (typeof projectId !== 'string' || !projectId || typeof evidenceId !== 'string' || !evidenceId) {
      res.status(400).json({ error: 'Project and evidence ids are required' });
      return;
    }
    const reviewerIdentityId = req.deliveryContext?.platformIdentityId ?? null;
    if (!reviewerIdentityId) { res.status(401).json({ error: 'No resolvable identity' }); return; }
    const decision = String((req.body ?? {}).decision ?? '');
    const { verifyBuildStoryEvidence, EvidenceVerifyError } = await import('../services/factory/govBuildEvidence');
    try {
      const evidence = await verifyBuildStoryEvidence({ evidenceId, deliveryProjectId: projectId, reviewerIdentityId, decision: decision as any });
      res.json({ evidence });
    } catch (err: any) {
      if (err instanceof EvidenceVerifyError) {
        const code = err.reason === 'not_found' ? 404 : err.reason === 'self_review' ? 403 : err.reason === 'already_reviewed' ? 409 : 400;
        res.status(code).json({ error: err.message, reason: err.reason });
        return;
      }
      res.status(500).json({ error: 'Could not verify the evidence.' });
    }
  },
);

export default router;
