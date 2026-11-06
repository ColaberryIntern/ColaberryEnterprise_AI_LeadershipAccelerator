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
 * POST /api/portal/gov-projects/:projectId/copilot — the Build Cockpit's project copilot. Guarded by project.read
 * (a member of THIS project), it loads the SAME student-safe projection the page renders and answers
 * DETERMINISTICALLY from it (govCopilot) — so the copilot can only ever repeat what the caller already sees; there
 * is no path by which it exposes an admin/internal field or another member's identity. Body: { question }.
 */
router.post(
  '/api/portal/gov-projects/:projectId/copilot',
  requireParticipant,
  requireGovProjectAccess('project.read'),
  async (req: GovProjectRequest, res: Response) => {
    const projectId = req.params.projectId;
    if (typeof projectId !== 'string' || !projectId) { res.status(400).json({ error: 'Project id is required' }); return; }
    const question = String((req.body ?? {}).question ?? '').trim();
    if (!question) { res.status(400).json({ error: 'A question is required' }); return; }
    try {
      const { hasDeliveryPermission } = await import('../modules/delivery/deliveryAuthorization');
      const viewerCanVerify = !!(req.deliveryContext && hasDeliveryPermission(req.deliveryContext, 'evidence.verify'));
      const viewerIdentityId = req.deliveryContext?.platformIdentityId ?? null;
      const view = await getStudentGovProjectView(projectId, viewerCanVerify, viewerIdentityId);
      if (!view) { res.status(404).json({ error: 'Not found' }); return; }
      const { answerCopilot } = await import('../services/factory/govCopilot');
      res.json(answerCopilot(view, question));
    } catch {
      res.status(500).json({ error: 'Could not answer right now.' });
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

// ── P4/P6: intern proposal AUTHORING — an EDIT-shared member drafts/edits a response from the portal ──────────
// Mirrors the admin author routes (govQualificationRoutes), reusing the SAME services (keyed on delivery_project_id,
// which the portal route already holds), but gated for a student: membership (project.read) AND an EDIT-level
// proposal share on THIS project. The intern can DRAFT/EDIT only — every save lands `draft`; review/approve stay
// admin-only (requireSection('program')), so separation of duties holds. The write is confined to the requirements
// the student-safe projection exposes, which DROPS pricing — so an intern can never touch a pricing slot. Identity
// is always the guard-resolved one (req.deliveryContext), never a client-supplied value.
const RESPONSE_ERR_STATUS: Record<string, number> = {
  bad_input: 400, bad_resolution: 400, empty_answer: 422, not_found: 404, gap_not_found: 404,
};

/**
 * Gate an intern proposal WRITE: require an EDIT-level share on THIS project, and that `requirementId` is one the
 * caller's own student-safe projection exposes (pricing is dropped there). On success returns the guard-resolved
 * identity; otherwise writes 401/403/404 and returns null. A non-member never reaches here (requireGovProjectAccess
 * 404s first); a member without an edit share is 403; an edit member writing a hidden/pricing requirement is 404.
 */
async function requireProposalEdit(req: GovProjectRequest, res: Response, projectId: string, requirementId: string): Promise<string | null> {
  const me = req.deliveryContext?.platformIdentityId ?? null;
  if (!me) { res.status(401).json({ error: 'No resolvable identity' }); return null; }
  const view = await getStudentGovProjectView(projectId, false, me);
  if (!view) { res.status(404).json({ error: 'Not found' }); return null; }
  const prop = view.proposal;
  if (!prop || !prop.canEdit) { res.status(403).json({ error: 'Forbidden' }); return null; }
  if (!prop.responses.some((r: { requirementId: string }) => r.requirementId === requirementId)) {
    res.status(404).json({ error: 'Not found' });
    return null;
  }
  return me;
}

/**
 * POST /api/portal/gov-projects/:projectId/proposal/:requirementId — an EDIT-shared intern drafts/edits the
 * response for one requirement. Any save lands `draft` (a changed answer is not reviewed/approved); the intern
 * cannot review or approve. Body: { content }.
 */
router.post(
  '/api/portal/gov-projects/:projectId/proposal/:requirementId',
  requireParticipant,
  requireGovProjectAccess('project.read'),
  async (req: GovProjectRequest, res: Response) => {
    const projectId = req.params.projectId;
    const requirementId = req.params.requirementId;
    if (typeof projectId !== 'string' || !projectId || typeof requirementId !== 'string' || !requirementId) {
      res.status(400).json({ error: 'Project and requirement ids are required' });
      return;
    }
    const me = await requireProposalEdit(req, res, projectId, requirementId);
    if (!me) return;
    const { saveProposalResponse, ResponseError } = await import('../services/factory/govProposalResponse');
    try {
      const view = await saveProposalResponse({ deliveryProjectId: projectId, requirementId, content: String((req.body ?? {}).content ?? ''), authoredByIdentityId: me });
      res.json(view);
    } catch (err: any) {
      if (err instanceof ResponseError) { res.status(RESPONSE_ERR_STATUS[err.reason] ?? 400).json({ error: err.message, reason: err.reason }); return; }
      res.status(500).json({ error: 'Could not save the response.' });
    }
  },
);

/**
 * POST /api/portal/gov-projects/:projectId/proposal/:requirementId/gaps/:gapId — an EDIT-shared intern resolves a
 * draft gap (answered | filler | open). Recomputes status and clears any prior sign-off. Body: { resolution, answer? }.
 */
router.post(
  '/api/portal/gov-projects/:projectId/proposal/:requirementId/gaps/:gapId',
  requireParticipant,
  requireGovProjectAccess('project.read'),
  async (req: GovProjectRequest, res: Response) => {
    const projectId = req.params.projectId;
    const requirementId = req.params.requirementId;
    const gapId = req.params.gapId;
    if (typeof projectId !== 'string' || !projectId || typeof requirementId !== 'string' || !requirementId || typeof gapId !== 'string' || !gapId) {
      res.status(400).json({ error: 'Project, requirement and gap ids are required' });
      return;
    }
    const me = await requireProposalEdit(req, res, projectId, requirementId);
    if (!me) return;
    const body: any = req.body ?? {};
    const { resolveProposalGap, ResponseError } = await import('../services/factory/govProposalResponse');
    try {
      const view = await resolveProposalGap({ deliveryProjectId: projectId, requirementId, gapId, resolution: body.resolution, answer: body.answer ?? null });
      res.json(view);
    } catch (err: any) {
      if (err instanceof ResponseError) { res.status(RESPONSE_ERR_STATUS[err.reason] ?? 400).json({ error: err.message, reason: err.reason }); return; }
      res.status(500).json({ error: 'Could not update the gap.' });
    }
  },
);

// ── v2 PROPOSAL DOCUMENTS — AI-drafted, reviewer-accepted named documents ─────────────────────────────────────
const DOC_ERR_STATUS: Record<string, number> = { not_found: 404, empty: 422, no_reviewer: 401, not_drafted: 422, already_accepted: 409, no_author: 401, forbidden: 403, ai_failed: 502 };

/**
 * POST /api/portal/gov-projects/:projectId/documents/:docKey/draft — draft a proposal document. With { contentHtml }
 * it saves a manual edit (sanitized); without it, the AI drafts the whole document from its requirements. Either way
 * the result lands `drafted`, NEVER `accepted` (the maker never accepts its own work). A member may draft; an
 * admin-only (pricing) document requires a reviewer. Gated by project.read.
 */
router.post(
  '/api/portal/gov-projects/:projectId/documents/:docKey/draft',
  requireParticipant,
  requireGovProjectAccess('project.read'),
  async (req: GovProjectRequest, res: Response) => {
    const projectId = req.params.projectId; const docKey = req.params.docKey;
    if (typeof projectId !== 'string' || !projectId || typeof docKey !== 'string' || !docKey) { res.status(400).json({ error: 'Project and document ids are required' }); return; }
    const me = req.deliveryContext?.platformIdentityId ?? null;
    if (!me) { res.status(401).json({ error: 'No resolvable identity' }); return; }
    try {
      const { hasDeliveryPermission } = await import('../modules/delivery/deliveryAuthorization');
      const canVerify = !!(req.deliveryContext && hasDeliveryPermission(req.deliveryContext, 'evidence.verify'));
      const { draftProposalDocument } = await import('../services/factory/proposal/govProposalDocumentActions');
      const manual = typeof (req.body ?? {}).contentHtml === 'string' ? (req.body as any).contentHtml : null;
      const document = await draftProposalDocument({ deliveryProjectId: projectId, docKey, identityId: me, canVerify, manualHtml: manual });
      res.json({ document });
    } catch (err: any) {
      if (err?.name === 'ProposalDocumentError') { res.status(DOC_ERR_STATUS[err.reason] ?? 400).json({ error: err.message, reason: err.reason }); return; }
      res.status(500).json({ error: 'Could not draft the document.' });
    }
  },
);

/** POST .../documents/:docKey/accept — a REVIEWER accepts a drafted document (the only path to `accepted`). */
router.post(
  '/api/portal/gov-projects/:projectId/documents/:docKey/accept',
  requireParticipant,
  requireGovProjectAccess('evidence.verify'),
  async (req: GovProjectRequest, res: Response) => {
    const projectId = req.params.projectId; const docKey = req.params.docKey;
    if (typeof projectId !== 'string' || !projectId || typeof docKey !== 'string' || !docKey) { res.status(400).json({ error: 'Project and document ids are required' }); return; }
    const me = req.deliveryContext?.platformIdentityId ?? null;
    if (!me) { res.status(401).json({ error: 'No resolvable identity' }); return; }
    try {
      const { acceptProposalDocument } = await import('../services/factory/proposal/govProposalDocumentStore');
      res.json({ document: await acceptProposalDocument(projectId, docKey, me) });
    } catch (err: any) {
      if (err?.name === 'ProposalDocumentError') { res.status(DOC_ERR_STATUS[err.reason] ?? 400).json({ error: err.message, reason: err.reason }); return; }
      res.status(500).json({ error: 'Could not accept the document.' });
    }
  },
);

/** POST .../documents/:docKey/request-changes — a REVIEWER sends it back with a note (appended to the thread). */
router.post(
  '/api/portal/gov-projects/:projectId/documents/:docKey/request-changes',
  requireParticipant,
  requireGovProjectAccess('evidence.verify'),
  async (req: GovProjectRequest, res: Response) => {
    const projectId = req.params.projectId; const docKey = req.params.docKey;
    if (typeof projectId !== 'string' || !projectId || typeof docKey !== 'string' || !docKey) { res.status(400).json({ error: 'Project and document ids are required' }); return; }
    const me = req.deliveryContext?.platformIdentityId ?? null;
    if (!me) { res.status(401).json({ error: 'No resolvable identity' }); return; }
    try {
      const { requestChangesProposalDocument } = await import('../services/factory/proposal/govProposalDocumentStore');
      res.json({ document: await requestChangesProposalDocument(projectId, docKey, me, String((req.body ?? {}).note ?? '')) });
    } catch (err: any) {
      if (err?.name === 'ProposalDocumentError') { res.status(DOC_ERR_STATUS[err.reason] ?? 400).json({ error: err.message, reason: err.reason }); return; }
      res.status(500).json({ error: 'Could not update the document.' });
    }
  },
);

/** POST .../documents/:docKey/comment — any member adds a comment to a document's review thread. */
router.post(
  '/api/portal/gov-projects/:projectId/documents/:docKey/comment',
  requireParticipant,
  requireGovProjectAccess('project.read'),
  async (req: GovProjectRequest, res: Response) => {
    const projectId = req.params.projectId; const docKey = req.params.docKey;
    if (typeof projectId !== 'string' || !projectId || typeof docKey !== 'string' || !docKey) { res.status(400).json({ error: 'Project and document ids are required' }); return; }
    const me = req.deliveryContext?.platformIdentityId ?? null;
    if (!me) { res.status(401).json({ error: 'No resolvable identity' }); return; }
    try {
      const { addProposalDocumentComment } = await import('../services/factory/proposal/govProposalDocumentStore');
      res.json({ document: await addProposalDocumentComment(projectId, docKey, me, String((req.body ?? {}).body ?? '')) });
    } catch (err: any) {
      if (err?.name === 'ProposalDocumentError') { res.status(DOC_ERR_STATUS[err.reason] ?? 400).json({ error: err.message, reason: err.reason }); return; }
      res.status(500).json({ error: 'Could not add the comment.' });
    }
  },
);

// ── B.8 INTERN PARITY (read versions/questions/activity; answer + run review cycle on EDIT-shared docs) ──────────
// All guarded by membership (project.read). Reads carry no pricing (the projection drops it). Writes additionally
// require an EDIT-level proposal share. Gates, pricing and the library admin are NEVER exposed here.

/** The docKeys this caller may see (their student-safe projection drops pricing), plus whether they hold an EDIT share. */
async function proposalAccess(req: GovProjectRequest, projectId: string): Promise<{ me: string | null; docKeys: Set<string>; canEdit: boolean } | null> {
  const { hasDeliveryPermission } = await import('../modules/delivery/deliveryAuthorization');
  const canVerify = !!(req.deliveryContext && hasDeliveryPermission(req.deliveryContext, 'evidence.verify'));
  const me = req.deliveryContext?.platformIdentityId ?? null;
  const view = await getStudentGovProjectView(projectId, canVerify, me);
  if (!view) return null;
  return { me, docKeys: new Set((view.proposalDocuments ?? []).map((d) => d.key)), canEdit: !!view.proposal?.canEdit };
}

/** GET .../documents/:docKey/versions/:versionId — read one version's content (B.2 mirror). The doc must be one the
 *  caller may see (pricing is dropped from their projection ⇒ 404) and the version must belong to it. */
router.get(
  '/api/portal/gov-projects/:projectId/documents/:docKey/versions/:versionId',
  requireParticipant, requireGovProjectAccess('project.read'),
  async (req: GovProjectRequest, res: Response) => {
    const projectId = req.params.projectId; const docKey = req.params.docKey; const versionId = req.params.versionId;
    if (typeof projectId !== 'string' || !projectId || typeof docKey !== 'string' || !docKey || typeof versionId !== 'string' || !versionId) { res.status(400).json({ error: 'Project, document and version ids are required' }); return; }
    try {
      const access = await proposalAccess(req, projectId);
      if (!access || !access.docKeys.has(docKey)) { res.status(404).json({ error: 'Not found' }); return; }
      const review = await import('../services/factory/proposal/govProposalReviewStore');
      const ref = await review.docRefForVersion(versionId);
      if (!ref || ref.deliveryProjectId !== projectId || ref.docKey !== docKey) { res.status(404).json({ error: 'Not found' }); return; }
      const content = await review.getDocumentVersionContent(versionId);
      if (!content) { res.status(404).json({ error: 'Not found' }); return; }
      res.json(content);
    } catch { res.status(500).json({ error: 'Could not load the version.' }); }
  },
);

/** GET .../questions?status=open — the open questions for the agent panel (B.3 mirror). project.read. */
router.get(
  '/api/portal/gov-projects/:projectId/questions',
  requireParticipant, requireGovProjectAccess('project.read'),
  async (req: GovProjectRequest, res: Response) => {
    const projectId = req.params.projectId;
    if (typeof projectId !== 'string' || !projectId) { res.status(400).json({ error: 'Project id is required' }); return; }
    try {
      const { listOpenQuestions } = await import('../services/factory/proposal/govProposalGaps');
      res.json({ questions: await listOpenQuestions(projectId) });
    } catch { res.status(500).json({ error: 'Could not load the questions.' }); }
  },
);

/** GET .../activity?limit=50 — the derived activity feed (B.4 mirror). project.read. */
router.get(
  '/api/portal/gov-projects/:projectId/activity',
  requireParticipant, requireGovProjectAccess('project.read'),
  async (req: GovProjectRequest, res: Response) => {
    const projectId = req.params.projectId;
    if (typeof projectId !== 'string' || !projectId) { res.status(400).json({ error: 'Project id is required' }); return; }
    const limit = Number(req.query.limit) || 50;
    try {
      const { loadProposalActivity } = await import('../services/factory/proposal/proposalActivity');
      res.json({ activity: await loadProposalActivity(projectId, limit) });
    } catch { res.status(500).json({ error: 'Could not load the activity feed.' }); }
  },
);

/** POST .../questions/:key/answer — an EDIT-shared member answers an open question (B.3/B.8). Saves to the library
 *  and resolves every open gap that asked it; returns the resolved count + re-scored docs. Requires an EDIT share. */
router.post(
  '/api/portal/gov-projects/:projectId/questions/:key/answer',
  requireParticipant, requireGovProjectAccess('project.read'),
  async (req: GovProjectRequest, res: Response) => {
    const projectId = req.params.projectId;
    if (typeof projectId !== 'string' || !projectId) { res.status(400).json({ error: 'Project id is required' }); return; }
    const me = req.deliveryContext?.platformIdentityId ?? null;
    if (!me) { res.status(401).json({ error: 'No resolvable identity' }); return; }
    const { decodeQuestionKey } = await import('../services/factory/proposal/govProposalGaps');
    const question = decodeQuestionKey(String(req.params.key ?? ''));
    const answer = String((req.body ?? {}).answer ?? '').trim();
    if (!question) { res.status(400).json({ error: 'Unknown question key.' }); return; }
    if (!answer) { res.status(400).json({ error: 'An answer is required.' }); return; }
    try {
      const access = await proposalAccess(req, projectId);
      if (!access) { res.status(404).json({ error: 'Not found' }); return; }
      if (!access.canEdit) { res.status(403).json({ error: 'Forbidden' }); return; }
      const { default: GovQualification } = await import('../models/GovQualification');
      const q: any = await GovQualification.findOne({ where: { delivery_project_id: projectId }, order: [['version', 'DESC']] });
      if (!q?.tenant_id) { res.status(409).json({ error: 'No tenant resolved for this project.' }); return; }
      const { answerQuestionToLibrary } = await import('../services/factory/proposal/govCompanyLibrary');
      const { gapsResolved } = await answerQuestionToLibrary(q.tenant_id, projectId, { question, answer }, me);
      const view = await getStudentGovProjectView(projectId, false, me);
      res.json({ resolved: gapsResolved, documents: view?.proposalDocuments ?? [] });
    } catch { res.status(500).json({ error: 'Could not record the answer.' }); }
  },
);

/** POST .../documents/:docKey/review-cycle — an EDIT-shared member runs the agent review cycle on a doc they can see
 *  (B.5/B.8). 409 when a run is already active; never pricing (the doc must be in their projection). */
router.post(
  '/api/portal/gov-projects/:projectId/documents/:docKey/review-cycle',
  requireParticipant, requireGovProjectAccess('project.read'),
  async (req: GovProjectRequest, res: Response) => {
    const projectId = req.params.projectId; const docKey = req.params.docKey;
    if (typeof projectId !== 'string' || !projectId || typeof docKey !== 'string' || !docKey) { res.status(400).json({ error: 'Project and document ids are required' }); return; }
    const me = req.deliveryContext?.platformIdentityId ?? null;
    if (!me) { res.status(401).json({ error: 'No resolvable identity' }); return; }
    const maxIterations = Number((req.body ?? {}).maxIterations) || 3;
    try {
      const access = await proposalAccess(req, projectId);
      if (!access) { res.status(404).json({ error: 'Not found' }); return; }
      if (!access.canEdit) { res.status(403).json({ error: 'Forbidden' }); return; }
      if (!access.docKeys.has(docKey)) { res.status(404).json({ error: 'Not found' }); return; } // pricing/unseen ⇒ 404
      const review = await import('../services/factory/proposal/govProposalReviewStore');
      const runs = await import('../services/factory/proposal/govProposalReviewRunStore');
      const docId = await review.docIdFor(projectId, docKey);
      if (!docId) { res.status(404).json({ error: 'Not found' }); return; }
      if (await runs.activeRunForDoc(docId)) { res.status(409).json({ error: 'A review cycle is already running for this document.', reason: 'run_active' }); return; }
      const { id: runId } = await runs.createRun(docId);
      const { runReviewCycle } = await import('../services/factory/proposal/runReviewCycle');
      void runReviewCycle(projectId, docKey, { maxIterations, identityId: me, runId }).catch(async () => {
        try { await runs.updateRun(runId, { status: 'failed', lastMessage: 'The review cycle errored.' }); } catch { /* best-effort */ }
      });
      res.json({ runId, started: true, maxIterations });
    } catch { res.status(500).json({ error: 'Could not start the review cycle.' }); }
  },
);

/** GET .../review-cycle/:runId — poll a review run (B.5 mirror). project.read. */
router.get(
  '/api/portal/gov-projects/:projectId/review-cycle/:runId',
  requireParticipant, requireGovProjectAccess('project.read'),
  async (req: GovProjectRequest, res: Response) => {
    const projectId = req.params.projectId;
    if (typeof projectId !== 'string' || !projectId) { res.status(400).json({ error: 'Project id is required' }); return; }
    try {
      const runs = await import('../services/factory/proposal/govProposalReviewRunStore');
      const run = await runs.getRun(String(req.params.runId));
      if (!run) { res.status(404).json({ error: 'Not found' }); return; }
      res.json({ run });
    } catch { res.status(500).json({ error: 'Could not load the review run.' }); }
  },
);

// v3 (V1.4): the intern's open-needs list — same list, but never pricing and no approvals they can't give.
router.get(
  '/api/portal/gov-projects/:projectId/needs',
  requireParticipant,
  requireGovProjectAccess('project.read'),
  async (req: GovProjectRequest, res: Response) => {
    try {
      const { collectProjectNeeds } = await import('../services/factory/proposal/collectProjectNeeds');
      const { groupNeeds, needsForViewer } = await import('../services/factory/proposal/aggregateNeeds');
      const all = await collectProjectNeeds(String(req.params.projectId));
      const needs = needsForViewer(all, { includePricing: false, canApprove: false });
      res.json({ needs, ...groupNeeds(needs) });
    } catch {
      res.status(500).json({ error: 'Could not load the needs list.', error_class: 'NeedsLoadFailed' });
    }
  },
);

// v3 (V1.4): the portal mirror of resolve. The intern CANNOT approve (fact -> library pending; Gold refused by
// the core), and may only resolve a need their own viewer projection exposes — the rail check below rejects a
// direct POST at a pricing or ungivable-approval key the list never showed them.
router.post(
  '/api/portal/gov-projects/:projectId/needs/:key/resolve',
  requireParticipant,
  requireGovProjectAccess('project.read'),
  async (req: GovProjectRequest, res: Response) => {
    try {
      const { collectProjectNeeds } = await import('../services/factory/proposal/collectProjectNeeds');
      const { needsForViewer } = await import('../services/factory/proposal/aggregateNeeds');
      const { resolveProjectNeed } = await import('../services/factory/proposal/resolveProjectNeed');
      const projectId = String(req.params.projectId);
      const key = String(req.params.key);
      const actor = await resolveGovProjectActor(req);
      const visible = needsForViewer(await collectProjectNeeds(projectId), { includePricing: false, canApprove: false });
      if (!visible.some((n) => n.key === key)) {
        return res.status(403).json({ error: 'That need is not yours to resolve.', error_class: 'NeedNotVisible' });
      }
      const b = (req.body ?? {}) as Record<string, unknown>;
      const submission = {
        value: typeof b.value === 'string' ? b.value : undefined,
        fileRef: typeof b.fileRef === 'string' ? b.fileRef : undefined,
        approve: typeof b.approve === 'boolean' ? b.approve : undefined,
        note: typeof b.note === 'string' ? b.note : undefined,
      };
      const result = await resolveProjectNeed(projectId, key, submission, { email: actor?.email, canApprove: false });
      return res.status(result.status).json(result.body);
    } catch {
      return res.status(500).json({ error: 'Could not resolve the need.', error_class: 'NeedResolveFailed' });
    }
  },
);

// "Report a problem" from the intern's Studio — the portal mirror of the admin bug reporter, scoped to
// a project the intern can read. Same email to the Gov Studio recipients so the Gov tab picks it up.
router.post(
  '/api/portal/gov-projects/:projectId/bug-report',
  requireParticipant,
  requireGovProjectAccess('project.read'),
  async (req: GovProjectRequest, res: Response) => {
    const projectId = String(req.params.projectId);
    try {
      const actor = await resolveGovProjectActor(req);
      const { handleGovStudioBugReport } = await import('../services/govStudio/studioBugReport');
      const result = await handleGovStudioBugReport(projectId, actor?.email, req.body);
      res.status(result.status).json(result.body);
    } catch {
      res.status(500).json({ error: 'The report could not be sent.', error_class: 'BugReportSendFailed' });
    }
  },
);

export default router;
