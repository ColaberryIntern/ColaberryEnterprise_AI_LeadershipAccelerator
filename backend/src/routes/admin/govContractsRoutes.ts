import { Router, Request, Response } from 'express';
import { requireSection, adminAllowedSections } from '../../middlewares/authMiddleware';
import { resolveGovProjectActor } from '../../middlewares/govProjectAccess';
import type { StudentGovProjectView } from '../../services/factory/govProjectProjection';

/**
 * Admin — Government Contracts tab (mgmt-portal M1).
 *
 * The admin Interns hub's "Gov Contracts" tab needs ONE list endpoint: the active government
 * pursuits/projects this caller may see. It is its OWN route gated `requireSection('gov_contracts')`
 * — NOT the existing `/api/admin/factory/*` surface, which is gated `program`. Reusing that would
 * recreate the nav-renders-but-API-403s trap this repo keeps warning about: the tab is gated
 * `gov_contracts`, so its data must be too, or a future `gov_contracts`-only role would see the tab
 * and get a 403 on every call.
 *
 * TWO layers of access, in order:
 *   1. SECTION gate (`requireSection('gov_contracts')`) — may you open the tab at all. owner/admin
 *      hold it (derived from ALL_SECTIONS); no scoped role does yet.
 *   2. ROW scope — a "broad" caller (one who also holds `program`: owner, admin, legacy full admin)
 *      is a management/operator viewer and sees EVERY active pursuit, exactly as the existing gov
 *      cockpit does; a scoped caller sees only the delivery projects they are an active
 *      `DeliveryProjectMember` of (email-resolved identity), mirroring `/api/portal/gov-projects`.
 *
 * Read-only. The list itself is the existing `listGovPipeline` projection (thread-head pursuits in
 * the gov container, newest first); the deep link into the per-pursuit cockpit lives on the client.
 */
const router = Router();

function logFail(event: string, err: unknown, context: Record<string, unknown>): void {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'error', service: 'backend', event,
    outcome: 'failure',
    error_class: (err as { constructor?: { name?: string } })?.constructor?.name ?? 'Error',
    context: { ...context, message: (err as { message?: string })?.message },
  }));
}

/**
 * GET /api/admin/gov-contracts — the active gov pursuits this caller may see, for the Gov Contracts
 * tab. `scope` echoes whether the list is the full tenant list ('all') or membership-scoped ('member').
 * Fails closed (503) if the gov container is not configured; never discloses another tenant's data.
 */
router.get('/api/admin/gov-contracts', requireSection('gov_contracts'), async (req: Request, res: Response) => {
  try {
    // Inside the try so a DB-level rejection here fails as a clean 500, not an unhandled rejection;
    // an unconfigured container is still the deliberate fail-closed 503.
    // C92: the list body lives in services/factory/govContractsList.ts, shared with the Campus HQ building
    const { listGovContractsFor } = await import('../../services/factory/govContractsList');
    const admin = (req as any).admin ?? {};
    const list = await listGovContractsFor({ email: String(admin.email ?? ''), sections: adminAllowedSections(admin) });
    if (!list) {
      logFail('gov_contracts_scope', new Error('gov container not resolvable'), {});
      res.status(503).json({ error: 'The government contracts workspace is not configured.' });
      return;
    }
    res.json(list);
  } catch (err: unknown) {
    logFail('gov_contracts_list_failed', err, {});
    res.status(500).json({ error: 'Could not list government contracts.' });
  }
});

/**
 * GET /api/admin/gov-contracts/:projectId/cockpit — the SAME student-safe projection the assigned
 * intern sees in their portal cockpit, so an owner/admin can read it in-place from the left-nav
 * (the Interns-hub left-nav redesign). Gated `requireSection('gov_contracts')` — owner/admin hold it,
 * no scoped role does — and it returns the read-only view for ANY non-archived government delivery
 * project, NOT only ones the caller is a member of, so management sees every contract the list shows.
 *
 * Management-drivable (Ali, 2026-11-02): `viewerCanVerify=true` so an owner/admin sees reviewer controls and
 * admin-only (pricing) documents, and the sibling POST routes below let management run the copilot and
 * draft/accept/request-changes/comment on proposal documents from the admin cockpit. The projection is still
 * student-safe in SHAPE (no admin/internal field leaks). 404 when the id is not a (non-archived) government project.
 */
router.get('/api/admin/gov-contracts/:projectId/cockpit', requireSection('gov_contracts'), async (req: Request, res: Response) => {
  const projectId = req.params.projectId;
  if (typeof projectId !== 'string' || !projectId) {
    res.status(400).json({ error: 'Project id is required' });
    return;
  }
  try {
    const { getStudentGovProjectView } = await import('../../services/factory/govProjectProjection');
    // Resolve the admin's identity only to feed the projection's proposal-share lookup; an owner/admin
    // is not an edit-share member, so it resolves to a read-only view regardless.
    const actor = await resolveGovProjectActor(req);
    const view = await getStudentGovProjectView(projectId, true, actor?.platformIdentityId ?? null);
    if (!view) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json({ project: view });
  } catch (err: unknown) {
    logFail('gov_contract_cockpit_failed', err, { projectId });
    res.status(500).json({ error: 'Could not load the government contract.' });
  }
});

// ── Management-drivable proposal + copilot (Ali, 2026-11-02) ──────────────────────────────────────────────────
// Management does not just READ a gov contract — from the admin Interns-hub cockpit it can DRIVE the proposal
// workflow (draft / accept / request-changes / comment) and ask the project copilot. These MIRROR the student
// portal routes (govProjectPortalRoutes) but are gated `requireSection('gov_contracts')` instead of
// participant+membership, and reuse the SAME services, so no business logic forks. The maker/approver split is
// preserved exactly: it lives in the portal's route-capability gating, and `acceptProposalDocument` never enforced
// maker≠accepter — so a `gov_contracts` holder gets the same authority an `evidence.verify` holder already had.
const DOC_ERR_STATUS: Record<string, number> = { not_found: 404, empty: 422, no_reviewer: 401, not_drafted: 422, already_accepted: 409, no_author: 401, forbidden: 403, ai_failed: 502 };

/**
 * Resolve + validate an admin gov-contract context for a mutation: the project must be a (non-archived)
 * government project (404 otherwise — the same enumeration defense as the cockpit GET), and we resolve the admin's
 * platform identity to record who acted. Returns null (after writing the response) on a bad or absent project.
 */
async function adminGovContext(req: Request, res: Response): Promise<{ identityId: string | null; view: StudentGovProjectView } | null> {
  const projectId = req.params.projectId;
  if (typeof projectId !== 'string' || !projectId) { res.status(400).json({ error: 'Project id is required' }); return null; }
  const { getStudentGovProjectView } = await import('../../services/factory/govProjectProjection');
  const actor = await resolveGovProjectActor(req);
  const view = await getStudentGovProjectView(projectId, true, actor?.platformIdentityId ?? null);
  if (!view) { res.status(404).json({ error: 'Not found' }); return null; }
  return { identityId: actor?.platformIdentityId ?? null, view };
}

function docKeyOf(req: Request, res: Response): string | null {
  const docKey = req.params.docKey;
  if (typeof docKey !== 'string' || !docKey) { res.status(400).json({ error: 'Document id is required' }); return null; }
  return docKey;
}

/** POST /api/admin/gov-contracts/:projectId/copilot — management asks the project copilot (deterministic, grounded). */
router.post('/api/admin/gov-contracts/:projectId/copilot', requireSection('gov_contracts'), async (req: Request, res: Response) => {
  const ctx = await adminGovContext(req, res);
  if (!ctx) return;
  const question = String((req.body ?? {}).question ?? '').trim();
  if (!question) { res.status(400).json({ error: 'A question is required' }); return; }
  try {
    const { answerCopilot } = await import('../../services/factory/govCopilot');
    res.json(answerCopilot(ctx.view, question));
  } catch (err: unknown) {
    logFail('gov_contract_copilot_failed', err, { projectId: req.params.projectId });
    res.status(500).json({ error: 'Could not answer right now.' });
  }
});

/** POST .../:projectId/documents/:docKey/draft — management drafts a proposal document (manual or AI; canVerify=true). */
router.post('/api/admin/gov-contracts/:projectId/documents/:docKey/draft', requireSection('gov_contracts'), async (req: Request, res: Response) => {
  const ctx = await adminGovContext(req, res);
  if (!ctx) return;
  const docKey = docKeyOf(req, res); if (!docKey) return;
  try {
    const { draftProposalDocument } = await import('../../services/factory/proposal/govProposalDocumentActions');
    const manual = typeof (req.body ?? {}).contentHtml === 'string' ? (req.body as any).contentHtml : null;
    const document = await draftProposalDocument({ deliveryProjectId: req.params.projectId as string, docKey, identityId: ctx.identityId, canVerify: true, manualHtml: manual });
    res.json({ document });
  } catch (err: any) {
    if (err?.name === 'ProposalDocumentError') { res.status(DOC_ERR_STATUS[err.reason] ?? 400).json({ error: err.message, reason: err.reason }); return; }
    logFail('gov_contract_doc_draft_failed', err, { projectId: req.params.projectId, docKey });
    res.status(500).json({ error: 'Could not draft the document.' });
  }
});

/** POST .../:projectId/documents/:docKey/accept — management accepts a drafted document. */
router.post('/api/admin/gov-contracts/:projectId/documents/:docKey/accept', requireSection('gov_contracts'), async (req: Request, res: Response) => {
  const ctx = await adminGovContext(req, res);
  if (!ctx) return;
  const docKey = docKeyOf(req, res); if (!docKey) return;
  try {
    const { acceptProposalDocument } = await import('../../services/factory/proposal/govProposalDocumentStore');
    res.json({ document: await acceptProposalDocument(req.params.projectId as string, docKey, ctx.identityId ?? '') });
  } catch (err: any) {
    if (err?.name === 'ProposalDocumentError') { res.status(DOC_ERR_STATUS[err.reason] ?? 400).json({ error: err.message, reason: err.reason }); return; }
    logFail('gov_contract_doc_accept_failed', err, { projectId: req.params.projectId, docKey });
    res.status(500).json({ error: 'Could not accept the document.' });
  }
});

/** POST .../:projectId/documents/:docKey/request-changes — management sends a document back with a note. */
router.post('/api/admin/gov-contracts/:projectId/documents/:docKey/request-changes', requireSection('gov_contracts'), async (req: Request, res: Response) => {
  const ctx = await adminGovContext(req, res);
  if (!ctx) return;
  const docKey = docKeyOf(req, res); if (!docKey) return;
  try {
    const { requestChangesProposalDocument } = await import('../../services/factory/proposal/govProposalDocumentStore');
    res.json({ document: await requestChangesProposalDocument(req.params.projectId as string, docKey, ctx.identityId ?? '', String((req.body ?? {}).note ?? '')) });
  } catch (err: any) {
    if (err?.name === 'ProposalDocumentError') { res.status(DOC_ERR_STATUS[err.reason] ?? 400).json({ error: err.message, reason: err.reason }); return; }
    logFail('gov_contract_doc_changes_failed', err, { projectId: req.params.projectId, docKey });
    res.status(500).json({ error: 'Could not update the document.' });
  }
});

/** POST .../:projectId/documents/:docKey/comment — management adds a comment to a document's review thread. */
router.post('/api/admin/gov-contracts/:projectId/documents/:docKey/comment', requireSection('gov_contracts'), async (req: Request, res: Response) => {
  const ctx = await adminGovContext(req, res);
  if (!ctx) return;
  const docKey = docKeyOf(req, res); if (!docKey) return;
  try {
    const { addProposalDocumentComment } = await import('../../services/factory/proposal/govProposalDocumentStore');
    res.json({ document: await addProposalDocumentComment(req.params.projectId as string, docKey, ctx.identityId ?? '', String((req.body ?? {}).body ?? '')) });
  } catch (err: any) {
    if (err?.name === 'ProposalDocumentError') { res.status(DOC_ERR_STATUS[err.reason] ?? 400).json({ error: err.message, reason: err.reason }); return; }
    logFail('gov_contract_doc_comment_failed', err, { projectId: req.params.projectId, docKey });
    res.status(500).json({ error: 'Could not add the comment.' });
  }
});

// ── Proposal Studio P2: blueprint from the stored ZIP ──────────────────────────────────────────────────────────
/**
 * POST .../:projectId/blueprint/reanalyze — re-read the STORED solicitation ZIP into the next blueprint version and
 * re-derive the document set, returning a diff from the previous blueprint. 409 when no stored package exists (the
 * operator must re-upload on the Solicitation step); never fabricates a blueprint. 404 for a non-gov project.
 */
router.post('/api/admin/gov-contracts/:projectId/blueprint/reanalyze', requireSection('gov_contracts'), async (req: Request, res: Response) => {
  const ctx = await adminGovContext(req, res);
  if (!ctx) return;
  try {
    const { reanalyzeProposalBlueprint } = await import('../../services/factory/proposal/reanalyzeProposalBlueprint');
    const result = await reanalyzeProposalBlueprint(req.params.projectId as string, ctx.identityId);
    res.json(result);
  } catch (err: any) {
    if (err?.name === 'BlueprintReanalysisError') { res.status(err.reason === 'bundle_missing' ? 409 : 500).json({ error: err.message, reason: err.reason }); return; }
    logFail('gov_contract_blueprint_reanalyze_failed', err, { projectId: req.params.projectId });
    res.status(500).json({ error: 'Could not re-analyze the solicitation.' });
  }
});

/** GET .../:projectId/blueprint — the current (highest-version) blueprint for the project, or null if none yet. */
router.get('/api/admin/gov-contracts/:projectId/blueprint', requireSection('gov_contracts'), async (req: Request, res: Response) => {
  const ctx = await adminGovContext(req, res);
  if (!ctx) return;
  try {
    const { default: GovProposalBlueprint } = await import('../../models/GovProposalBlueprint');
    const row: any = await GovProposalBlueprint.findOne({ where: { delivery_project_id: req.params.projectId }, order: [['version', 'DESC']] });
    res.json({ blueprint: row ? row.blueprint_json : null, version: row ? row.version : null });
  } catch (err: unknown) {
    logFail('gov_contract_blueprint_get_failed', err, { projectId: req.params.projectId });
    res.status(500).json({ error: 'Could not load the blueprint.' });
  }
});

// ── Proposal Studio P4: build-artifact evidence ────────────────────────────────────────────────────────────────
/** POST .../:projectId/build-demo — admin sets the demo URL (validated https + host-allowlisted) for capture. */
router.post('/api/admin/gov-contracts/:projectId/build-demo', requireSection('gov_contracts'), async (req: Request, res: Response) => {
  const ctx = await adminGovContext(req, res); if (!ctx) return;
  try {
    const { setGovBuildDemo } = await import('../../services/factory/proposal/captureStoryArtifact');
    const b = (req.body ?? {}) as any;
    await setGovBuildDemo(req.params.projectId as string, { demoUrl: String(b.demoUrl ?? ''), captureRoot: b.captureRoot ?? null, storyCapturePaths: b.storyCapturePaths ?? {}, identityId: ctx.identityId });
    res.json({ ok: true });
  } catch (err: any) {
    if (err?.name === 'GovBuildDemoError') { res.status(400).json({ error: err.message, reason: err.reason }); return; }
    logFail('gov_contract_build_demo_failed', err, { projectId: req.params.projectId });
    res.status(500).json({ error: 'Could not set the demo URL.' });
  }
});

/** POST .../:projectId/stories/:storyId/recapture — admin re-captures a story's screenshot at its latest commit. */
router.post('/api/admin/gov-contracts/:projectId/stories/:storyId/recapture', requireSection('gov_contracts'), async (req: Request, res: Response) => {
  const ctx = await adminGovContext(req, res); if (!ctx) return;
  const storyId = String(req.params.storyId ?? ''); if (!storyId) { res.status(400).json({ error: 'Story id is required' }); return; }
  try {
    const { recaptureStory } = await import('../../services/factory/proposal/captureStoryArtifact');
    res.json({ result: await recaptureStory(req.params.projectId as string, storyId) });
  } catch (err: unknown) {
    logFail('gov_contract_recapture_failed', err, { projectId: req.params.projectId, storyId });
    res.status(500).json({ error: 'Could not re-capture the screenshot.' });
  }
});

/** GET .../:projectId/artifacts/:artifactId/image — serve a captured PNG for a member (404 otherwise). */
router.get('/api/admin/gov-contracts/:projectId/artifacts/:artifactId/image', requireSection('gov_contracts'), async (req: Request, res: Response) => {
  const ctx = await adminGovContext(req, res); if (!ctx) return;
  try {
    const path = await import('path');
    const { GOV_BUILD_ARTIFACT_DIR } = await import('../../config/upload');
    const { default: GovBuildArtifact } = await import('../../models/GovBuildArtifact');
    const row: any = await GovBuildArtifact.findByPk(String(req.params.artifactId));
    if (!row || row.delivery_project_id !== req.params.projectId || !row.file_path) { res.status(404).json({ error: 'Not found' }); return; }
    res.sendFile(path.join(GOV_BUILD_ARTIFACT_DIR, path.basename(String(row.file_path))));
  } catch (err: unknown) {
    logFail('gov_contract_artifact_image_failed', err, { projectId: req.params.projectId });
    res.status(500).json({ error: 'Could not load the image.' });
  }
});

/** POST .../:projectId/documents/:docKey/insert-figure — insert a captured artifact as the next numbered figure. */
router.post('/api/admin/gov-contracts/:projectId/documents/:docKey/insert-figure', requireSection('gov_contracts'), async (req: Request, res: Response) => {
  const ctx = await adminGovContext(req, res); if (!ctx) return;
  const docKey = docKeyOf(req, res); if (!docKey) return;
  const artifactId = String((req.body ?? {}).artifactId ?? ''); if (!artifactId) { res.status(400).json({ error: 'artifactId is required' }); return; }
  try {
    const { insertArtifactFigure } = await import('../../services/factory/proposal/insertArtifactFigure');
    res.json({ document: await insertArtifactFigure(req.params.projectId as string, docKey, artifactId, ctx.identityId) });
  } catch (err: any) {
    if (err?.name === 'ProposalDocumentError') { res.status(DOC_ERR_STATUS[err.reason] ?? 400).json({ error: err.message, reason: err.reason }); return; }
    logFail('gov_contract_insert_figure_failed', err, { projectId: req.params.projectId, docKey });
    res.status(500).json({ error: 'Could not insert the figure.' });
  }
});

// ── Proposal Studio P3: versions, checks, gates ────────────────────────────────────────────────────────────────
const REVIEW_ERR_STATUS: Record<string, number> = { not_found: 404, gate_order: 409, checks_not_met: 409, separation_of_duties: 403, no_reviewer: 401, no_version: 409 };
const VALID_GATES = new Set(['pink', 'red', 'gold', 'white_glove']);

/** GET .../:projectId/documents/:docKey/versions — the immutable version history + stored check scores. */
router.get('/api/admin/gov-contracts/:projectId/documents/:docKey/versions', requireSection('gov_contracts'), async (req: Request, res: Response) => {
  const ctx = await adminGovContext(req, res); if (!ctx) return;
  const docKey = docKeyOf(req, res); if (!docKey) return;
  try {
    const review = await import('../../services/factory/proposal/govProposalReviewStore');
    const docId = await review.docIdFor(req.params.projectId as string, docKey);
    if (!docId) { res.json({ versions: [], gates: [] }); return; }
    res.json({ versions: await review.listDocumentVersions(docId), gates: await review.listGateReviews(docId) });
  } catch (err: unknown) {
    logFail('gov_contract_versions_failed', err, { projectId: req.params.projectId, docKey });
    res.status(500).json({ error: 'Could not load the version history.' });
  }
});

/** GET .../:projectId/versions/:a/diff/:b — HTML-aware word diff between two versions (server-side, in-repo LCS). */
router.get('/api/admin/gov-contracts/:projectId/versions/:a/diff/:b', requireSection('gov_contracts'), async (req: Request, res: Response) => {
  const ctx = await adminGovContext(req, res); if (!ctx) return;
  try {
    const review = await import('../../services/factory/proposal/govProposalReviewStore');
    res.json({ segments: await review.diffVersions(String(req.params.a), String(req.params.b)) });
  } catch (err: unknown) {
    logFail('gov_contract_version_diff_failed', err, { projectId: req.params.projectId });
    res.status(500).json({ error: 'Could not diff the versions.' });
  }
});

/** POST .../:projectId/documents/:docKey/run-checks — score the current version on the six checks and store them. */
router.post('/api/admin/gov-contracts/:projectId/documents/:docKey/run-checks', requireSection('gov_contracts'), async (req: Request, res: Response) => {
  const ctx = await adminGovContext(req, res); if (!ctx) return;
  const docKey = docKeyOf(req, res); if (!docKey) return;
  try {
    const { runProposalDocumentChecks } = await import('../../services/factory/proposal/runProposalDocumentChecks');
    const result = await runProposalDocumentChecks(req.params.projectId as string, docKey);
    if (!result) { res.status(409).json({ error: 'There is no drafted version to check yet.' }); return; }
    res.json({ result });
  } catch (err: unknown) {
    logFail('gov_contract_run_checks_failed', err, { projectId: req.params.projectId, docKey });
    res.status(500).json({ error: 'Could not run the checks.' });
  }
});

/** POST .../:projectId/documents/:docKey/gates/:gate — a reviewer approves or returns a color-team gate. Enforces
 *  gate order, the pass-the-relevant-checks rule, and Gold separation of duties (a holder of the broad `program`
 *  section is the master-admin override). Interns never reach this (the route is section-gated gov_contracts). */
router.post('/api/admin/gov-contracts/:projectId/documents/:docKey/gates/:gate', requireSection('gov_contracts'), async (req: Request, res: Response) => {
  const ctx = await adminGovContext(req, res); if (!ctx) return;
  const docKey = docKeyOf(req, res); if (!docKey) return;
  const gate = String(req.params.gate ?? '');
  if (!VALID_GATES.has(gate)) { res.status(400).json({ error: 'Unknown gate.' }); return; }
  const decision = String((req.body ?? {}).decision ?? '');
  if (decision !== 'approve' && decision !== 'return') { res.status(400).json({ error: 'decision must be "approve" or "return".' }); return; }
  try {
    const review = await import('../../services/factory/proposal/govProposalReviewStore');
    const docId = await review.docIdFor(req.params.projectId as string, docKey);
    if (!docId) { res.status(404).json({ error: 'Not found' }); return; }
    const isMasterAdmin = adminAllowedSections((req as any).admin ?? {}).includes('program');
    const gates = await review.decideGate({ documentId: docId, gate: gate as any, reviewerIdentityId: ctx.identityId, decision, note: String((req.body ?? {}).note ?? ''), isMasterAdmin });
    res.json({ gates });
  } catch (err: any) {
    if (err?.name === 'ProposalReviewError') { res.status(REVIEW_ERR_STATUS[err.reason] ?? 400).json({ error: err.message, reason: err.reason }); return; }
    logFail('gov_contract_gate_decide_failed', err, { projectId: req.params.projectId, docKey, gate });
    res.status(500).json({ error: 'Could not record the gate decision.' });
  }
});

export default router;
