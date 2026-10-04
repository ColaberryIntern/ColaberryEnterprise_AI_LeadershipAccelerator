import { Router, Request, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import crypto from 'crypto';
import { requireSection } from '../../middlewares/authMiddleware';
// READ-ONLY, tenant-scoped, fail-closed container resolution (NOT the provisioning helper). Every route scopes
// to the fixed Government Contracts container's tenant/org; if it is not configured, the route FAILS CLOSED.
import { lookupGovContractsContainer } from '../../scripts/lib/factoryDemoContainer';
// The qualification services lazy-load their models inside their functions, so these imports never init the ORM.
import {
  createQualification, recordDecision, approveGovQualification, recordDocumentReview,
  createDecoupledQualification, getDecoupledWorkspace, recordZipAttestation, approveDecoupledQualification,
  evaluateRequirements, evaluateEvidenceCoverage, reviewedDocIdsFrom,
  QUALIFICATION_DECISIONS, APPROVAL_DECISIONS,
  QualificationConflictError, QualificationBlockedError, ChangedSourceError, SourceUnavailableError,
  QualificationNotFoundError, SelfApprovalError, SourceNotApprovableError, EvidenceInsufficientError,
  DocumentNotListedError,
} from '../../services/factory/govQualification';
import { authorizeBuild, BuildNotAuthorizedError } from '../../services/factory/buildAuthorization';
import { linkGovOpportunity, AliasProjectNotFoundError, AliasProjectNotGovernmentError, AliasConflictError } from '../../services/factory/opportunities/govOpportunityAlias';
import { resolveGovOpportunityDetail, isLiveOpDetailConfigured, describeSourceState } from '../../services/factory/opportunities/opDetailClient';
import { fetchGovOpportunityCandidatesV2 } from '../../services/factory/opportunities/opListClient';
// Gov step 6 — the two-track delivery project, created on approval behind FLAGS.govIngestion (ships dark).
import { FLAGS } from '../../config/featureFlags';
import { ensureGovTwoTrackProject } from '../../services/factory/govDeliveryProject';

/**
 * Admin — Government Qualification Workspace (Phase 2).
 *
 * ── THE GATE ─────────────────────────────────────────────────────────────────
 * Every route is `requireSection('program')`, and every path is nested under
 * `/api/admin/factory/qualification`, so mgmtSectionGate's existing `/api/admin/factory` → 'program' PREFIX
 * mapping covers it (the route-auth lint requires the guard). The section gate is ROLE-level only; separation of
 * duties (a reviewer may not approve their own pursuit) is a SECOND, in-service check (SelfApprovalError → 403).
 *
 * ── SOURCE IS SERVER-AUTHORITATIVE ───────────────────────────────────────────
 * The source snapshot a qualification is created/approved against is ALWAYS re-fetched server-side by canonical
 * id (opDetailClient); the browser never supplies source facts. When the source is unavailable the write fails
 * closed (503). The OP live v2 endpoint is not yet wired — opDetailClient is fixture-backed — so this is NOT a
 * proven cross-repo integration; `sourceLive:false` says so to the UI.
 */
const router = Router();

const canonicalParam = z.object({ canonicalOpportunityId: z.string().regex(/^op:gov:[0-9a-f]{32}$/) });
// A DECOUPLED (discovery-ZIP) workspace key: `gws:<discovery uuid>`. Disjoint from the canonical `op:gov:` namespace,
// so branching on isGwsKey is unambiguous and a canonical key never takes the decoupled branch (and vice-versa).
const GWS_RE = /^gws:[0-9a-f-]{36}$/;
const isGwsKey = (k: string): boolean => GWS_RE.test(k);
// The shared key param for the routes that serve BOTH paths (GET, create, approve, decision, extract-requirements):
// accepts a canonical id OR a gws key; anything else → 400. The handlers branch on isGwsKey. The write routes that
// are canonical-only by design (link, authorize-build, review-documents) keep `canonicalParam` (a gws key → 400 there).
const qualKeyParam = z.object({ canonicalOpportunityId: z.string().regex(/^(op:gov:[0-9a-f]{32}|gws:[0-9a-f-]{36})$/) });
const biddingEntityField = z.string().min(1).max(120);

function logFail(event: string, err: any, context: Record<string, unknown>): void {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'error', service: 'backend', event,
    outcome: 'failure', error_class: err?.constructor?.name ?? 'Error', context: { ...context, message: err?.message },
  }));
}

/** Resolve the fixed gov container or fail closed (503). Returns null AFTER responding when unavailable. */
async function scopeOrFail(res: Response, event: string, context: Record<string, unknown>): Promise<{ tenantId: string; orgId: string } | null> {
  const container = await lookupGovContractsContainer();
  if (!container) {
    logFail(event, new Error('gov container not resolvable'), context);
    res.status(503).json({ error: 'The government contracts workspace is not configured.' });
    return null;
  }
  return { tenantId: container.tenant.id, orgId: container.org.id };
}

/** The identity acting on the request (email preferred, sub fallback). */
function actorIdentity(req: Request): string {
  return String((req as any).admin?.email ?? (req as any).admin?.sub ?? 'unknown-admin');
}

/** Map a qualification-service error to its HTTP status; returns true if it handled the response. */
function mapQualificationError(res: Response, err: any): boolean {
  if (err instanceof QualificationConflictError) { res.status(409).json({ error: err.message, currentVersion: err.currentVersion }); return true; }
  if (err instanceof ChangedSourceError) { res.status(409).json({ error: err.message, reviewedVersion: err.reviewed, currentVersion: err.current, changedSource: true }); return true; }
  if (err instanceof QualificationBlockedError) { res.status(422).json({ error: err.message, blocking: err.blocking }); return true; }
  if (err instanceof EvidenceInsufficientError) { res.status(422).json({ error: err.message, evidenceInsufficient: true, reasons: err.reasons }); return true; }
  if (err instanceof DocumentNotListedError) { res.status(422).json({ error: err.message, documentNotListed: true, docIds: err.docIds }); return true; }
  if (err instanceof SourceNotApprovableError) { res.status(409).json({ error: err.message, sourceNotApprovable: true, reason: err.reason }); return true; }
  if (err instanceof SourceUnavailableError) { res.status(503).json({ error: err.message, sourceUnavailable: true }); return true; }
  if (err instanceof SelfApprovalError) { res.status(403).json({ error: err.message }); return true; }
  if (err instanceof QualificationNotFoundError) { res.status(404).json({ error: err.message }); return true; }
  return false;
}

/**
 * GET /api/admin/factory/qualification/:canonicalOpportunityId?biddingEntity=…
 * The workspace read view backing data: the server-fetched source facts (requirements grouped by due stage,
 * advisory legacy fit/verdict), the current qualification record if one exists, whether the source has changed
 * under a prior review, and whether an approval is currently allowed. Never mutates.
 */
router.get('/api/admin/factory/qualification/:canonicalOpportunityId', requireSection('program'), async (req: Request, res: Response) => {
  const p = qualKeyParam.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: 'Invalid opportunity key.' }); return; }
  const be = biddingEntityField.safeParse((req.query.biddingEntity as string) ?? '');
  const { canonicalOpportunityId } = p.data;
  const scope = await scopeOrFail(res, 'gov_qualification_view_scope', { canonicalOpportunityId });
  if (!scope) return;
  // DECOUPLED (discovery-ZIP) workspace: no OP source re-fetch; the uploaded ZIP is the evidence source.
  if (isGwsKey(canonicalOpportunityId)) {
    try {
      res.json(await getDecoupledWorkspace(scope.tenantId, canonicalOpportunityId, be.success && be.data ? be.data : undefined));
    } catch (err: any) {
      logFail('gov_qualification_decoupled_view_failed', err, { canonicalOpportunityId });
      res.status(500).json({ error: 'Could not load the qualification workspace.' });
    }
    return;
  }
  try {
    // Server-authoritative source-state (available / degraded / snapshot_unrecorded / unavailable / auth_failed /
    // malformed). The browser never supplies source facts, and the approve control is only offered when the
    // source is genuinely approvable — mirroring the server-side gate so the UI cannot imply an unusable action.
    const resolved = await resolveGovOpportunityDetail(canonicalOpportunityId);
    const detail = resolved.detail;

    const { default: GovQualification } = await import('../../models/GovQualification');
    const where: any = { canonical_opportunity_id: canonicalOpportunityId, tenant_id: scope.tenantId, status: 'active' };
    if (be.success && be.data) where.bidding_entity = be.data;
    const record: any = await GovQualification.findOne({ where, order: [['version', 'DESC']] });
    const recordJson = record ? record.get() : null;

    // Effective requirements = reviewer-established (if any) else the source's (always [] for live v2).
    const established = (recordJson && recordJson.requirements_json && recordJson.requirements_json.established)
      || (detail && detail.requirements) || [];
    const evaluation = detail ? evaluateRequirements(established) : null;
    const coverage = detail ? evaluateEvidenceCoverage(detail, established, reviewedDocIdsFrom(recordJson)) : null;

    const sourcePresent = resolved.state === 'available' || resolved.state === 'degraded' || resolved.state === 'snapshot_unrecorded';
    const sourceApprovable = resolved.state === 'available';
    const changedSource = !!(recordJson && resolved.snapshotRecorded && recordJson.source_snapshot_version !== resolved.sourceSnapshotVersion);
    const canApprove = sourceApprovable && !changedSource && !!evaluation && evaluation.canApprovePursuit && !!coverage && coverage.sufficient;

    res.json({
      canonicalOpportunityId,
      sourceLive: isLiveOpDetailConfigured(),
      sourceState: resolved.state,
      sourceStateLabel: describeSourceState(resolved),
      sourceAvailable: sourcePresent,
      sourceSnapshotVersion: resolved.sourceSnapshotVersion,
      snapshotRecorded: resolved.snapshotRecorded,
      source: detail,                      // server-authoritative facts for the UI (never browser-supplied)
      evaluation,                          // requirement blocking result (missing evidence blocks)
      coverage,                            // document-coverage sufficiency (empty/unknown/partial rules)
      qualification: recordJson,
      changedSource,
      canApprove,                          // true ONLY when the source is approvable, current, covered, unblocked
    });
  } catch (err: any) {
    logFail('gov_qualification_view_failed', err, { canonicalOpportunityId });
    res.status(500).json({ error: 'Could not load the qualification workspace.' });
  }
});

/**
 * GET /api/admin/factory/qualification-candidates — the TRUSTED discovery→canonical mapping (OP v2 list). Each
 * item carries a real `op:gov:<hex>` canonical id, so the UI can start a qualification without ever deriving an id
 * from a title. When v2 is unavailable this returns { available:false, reason } and no candidates — the UI shows
 * the gap rather than offering a fabricated start.
 */
router.get('/api/admin/factory/qualification-candidates', requireSection('program'), async (_req: Request, res: Response) => {
  const scope = await scopeOrFail(res, 'gov_qualification_candidates_scope', {});
  if (!scope) return;
  const result = await fetchGovOpportunityCandidatesV2(); // never throws (degrade-dark)
  res.json({ ...result, sourceLive: isLiveOpDetailConfigured() });
});

const createBody = z.object({
  biddingEntity: biddingEntityField, deliveryProjectId: z.string().uuid().optional(),
  // Decoupled-workspace provenance (display only; the clicked discovery row's title/agency). Ignored on the canonical path.
  from: z.string().max(400).optional(), agency: z.string().max(200).optional(),
});

/** POST /api/admin/factory/qualification/:canonicalOpportunityId — create a pending_review record. Canonical path:
 *  bound to a SERVER-fetched source snapshot (fails closed 503 when unavailable). Decoupled (gws) path: bound to NO
 *  snapshot — the uploaded ZIP is the evidence source. */
router.post('/api/admin/factory/qualification/:canonicalOpportunityId', requireSection('program'), async (req: Request, res: Response) => {
  const p = qualKeyParam.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: 'Invalid opportunity key.' }); return; }
  const b = createBody.safeParse(req.body ?? {});
  if (!b.success) { res.status(400).json({ error: 'Invalid create body.', issues: b.error.issues }); return; }
  const { canonicalOpportunityId } = p.data;
  const scope = await scopeOrFail(res, 'gov_qualification_create_scope', { canonicalOpportunityId });
  if (!scope) return;
  // DECOUPLED (discovery-ZIP) create: no OP snapshot binding; store workspace_kind + provenance from the discovery row.
  if (isGwsKey(canonicalOpportunityId)) {
    try {
      const q = await createDecoupledQualification({
        tenantId: scope.tenantId, organizationId: scope.orgId, biddingEntity: b.data.biddingEntity,
        gwsKey: canonicalOpportunityId, reviewerIdentityId: actorIdentity(req),
        provenance: { uuid: canonicalOpportunityId.slice(4), title: b.data.from ?? null, agency: b.data.agency ?? null },
      });
      res.status(201).json({ qualification: q });
    } catch (err: any) {
      if (mapQualificationError(res, err)) return;
      logFail('gov_qualification_decoupled_create_failed', err, { canonicalOpportunityId });
      res.status(500).json({ error: 'Could not create the qualification.' });
    }
    return;
  }
  try {
    // Research/draft is permitted whenever the source is READABLE (available/degraded/snapshot_unrecorded); only
    // an unreadable source (unavailable/auth_failed/malformed) fails closed. Pursuit APPROVAL is gated separately
    // and will still refuse a degraded/unrecorded/uncovered source.
    const resolved = await resolveGovOpportunityDetail(canonicalOpportunityId);
    const detail = resolved.detail;
    if (!detail) { res.status(503).json({ error: 'The opportunity source is unavailable; cannot open a qualification bound to it.', sourceUnavailable: true, sourceState: resolved.state }); return; }
    const q = await createQualification({
      tenantId: scope.tenantId, organizationId: scope.orgId, biddingEntity: b.data.biddingEntity,
      canonicalOpportunityId, deliveryProjectId: b.data.deliveryProjectId ?? null, reviewerIdentityId: actorIdentity(req),
      sourceSnapshot: detail, sourceSnapshotVersion: resolved.sourceSnapshotVersion as number, sourceAvailable: true, requirements: detail.requirements,
    });
    res.status(201).json({ qualification: q });
  } catch (err: any) {
    if (mapQualificationError(res, err)) return;
    logFail('gov_qualification_create_failed', err, { canonicalOpportunityId });
    res.status(500).json({ error: 'Could not create the qualification.' });
  }
});

/** A reviewer-ESTABLISHED, cited applicable requirement (same shape the coverage/blocking evaluation consumes). */
const establishedRequirement = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  category: z.string().max(60).optional(),
  applicability: z.enum(['always', 'conditional', 'not_applicable', 'unknown']),
  applicabilityEvidenceRef: z.object({ docId: z.string() }).nullable().optional(),
  responsibleParty: z.string().max(60).optional(),
  dueStage: z.enum(['submission', 'award', 'delivery', 'unknown']),
  bindingStatus: z.string().max(80),
  evidenceRef: z.object({ docId: z.string() }).nullable().optional(),
});

const decisionBody = z.object({
  biddingEntity: biddingEntityField,
  expectedVersion: z.coerce.number().int().min(1),
  decision: z.enum(['pending_review', 'needs_evidence', 'no_bid']),
  rationale: z.string().max(4000).optional(),
  effortCap: z.string().max(200).optional(),
  reassessmentConditions: z.string().max(2000).optional(),
  /** Optional: the cited requirements the reviewer establishes as applicable (stored for pursuit approval). */
  establishedRequirements: z.array(establishedRequirement).max(200).optional(),
  evidence: z.record(z.string(), z.any()).optional(),
});

/** POST /api/admin/factory/qualification/:canonicalOpportunityId/decision — record a NON-approval decision. */
router.post('/api/admin/factory/qualification/:canonicalOpportunityId/decision', requireSection('program'), async (req: Request, res: Response) => {
  const p = qualKeyParam.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: 'Invalid opportunity key.' }); return; }
  const b = decisionBody.safeParse(req.body ?? {});
  if (!b.success) { res.status(400).json({ error: 'Invalid decision body.', issues: b.error.issues }); return; }
  const { canonicalOpportunityId } = p.data;
  const scope = await scopeOrFail(res, 'gov_qualification_decision_scope', { canonicalOpportunityId });
  if (!scope) return;
  try {
    const q = await recordDecision({
      canonicalOpportunityId, biddingEntity: b.data.biddingEntity, expectedVersion: b.data.expectedVersion,
      decision: b.data.decision, rationale: b.data.rationale ?? null, reviewerIdentityId: actorIdentity(req),
      effortCap: b.data.effortCap ?? null, reassessmentConditions: b.data.reassessmentConditions ?? null,
      establishedRequirements: b.data.establishedRequirements, evidence: b.data.evidence,
    });
    res.json({ qualification: q });
  } catch (err: any) {
    if (mapQualificationError(res, err)) return;
    logFail('gov_qualification_decision_failed', err, { canonicalOpportunityId });
    res.status(500).json({ error: 'Could not record the decision.' });
  }
});

const approveBody = z.object({
  biddingEntity: biddingEntityField,
  expectedVersion: z.coerce.number().int().min(1),
  decision: z.enum(['approved_bid_pursuit', 'rfi_response']),
  rationale: z.string().max(4000).optional(),
  effortCap: z.string().max(200).optional(),
  reassessmentConditions: z.string().max(2000).optional(),
});

/**
 * STEP 6 (behind FLAGS.govIngestion — ships DARK): after a pursuit is approved, create-or-reuse the two-track gov
 * delivery project. BEST-EFFORT by design — the pursuit is already approved and forked, so a project-creation
 * failure must NOT fail the request; it is logged and returned as a non-fatal warning so it can be retried
 * (ensureGovTwoTrackProject is idempotent). Never runs when the flag is off. Never confers build authorization.
 */
async function createTwoTrackProjectAfterApproval(q: any, canonicalOpportunityId: string, approverIdentityId: string): Promise<string | undefined> {
  if (!FLAGS.govIngestion) return undefined;
  try {
    await ensureGovTwoTrackProject({
      qualificationId: q.id,
      canonicalOpportunityId,
      established: (q.requirements_json && q.requirements_json.established) || [],
      provenance: (q.requirements_json && q.requirements_json.provenance) || null,
      approverIdentityId,
    });
    return undefined;
  } catch (projErr: any) {
    logFail('gov_two_track_project_create_failed', projErr, { canonicalOpportunityId });
    return 'The pursuit was approved, but creating its delivery project failed; it will be retried.';
  }
}

/** POST /api/admin/factory/qualification/:canonicalOpportunityId/approve — the server-side, source-bound approval.
 *  The approver is the request identity (enforced != reviewer in the service). */
router.post('/api/admin/factory/qualification/:canonicalOpportunityId/approve', requireSection('program'), async (req: Request, res: Response) => {
  const p = qualKeyParam.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: 'Invalid opportunity key.' }); return; }
  // DECOUPLED (ZIP) pursuit approval: the uploaded+attested ZIP is the evidence (no OP re-fetch). Same ordered gate.
  if (isGwsKey(p.data.canonicalOpportunityId)) {
    const b = approveBody.safeParse(req.body ?? {});
    if (!b.success) { res.status(400).json({ error: 'Invalid approval body.', issues: b.error.issues }); return; }
    const { canonicalOpportunityId } = p.data;
    const scope = await scopeOrFail(res, 'gov_qualification_decoupled_approve_scope', { canonicalOpportunityId });
    if (!scope) return;
    try {
      const q = await approveDecoupledQualification({
        gwsKey: canonicalOpportunityId, biddingEntity: b.data.biddingEntity, expectedVersion: b.data.expectedVersion,
        decision: b.data.decision, approverIdentityId: actorIdentity(req), rationale: b.data.rationale ?? null,
      });
      const projectWarning = await createTwoTrackProjectAfterApproval(q, canonicalOpportunityId, actorIdentity(req));
      res.json({ qualification: q, ...(projectWarning ? { projectWarning } : {}) });
    } catch (err: any) {
      if (mapQualificationError(res, err)) return;
      logFail('gov_qualification_decoupled_approve_failed', err, { canonicalOpportunityId });
      res.status(500).json({ error: 'Could not approve the qualification.' });
    }
    return;
  }
  const b = approveBody.safeParse(req.body ?? {});
  if (!b.success) { res.status(400).json({ error: 'Invalid approval body.', issues: b.error.issues }); return; }
  const { canonicalOpportunityId } = p.data;
  const scope = await scopeOrFail(res, 'gov_qualification_approve_scope', { canonicalOpportunityId });
  if (!scope) return;
  try {
    const q = await approveGovQualification({
      canonicalOpportunityId, biddingEntity: b.data.biddingEntity, expectedVersion: b.data.expectedVersion,
      decision: b.data.decision, approverIdentityId: actorIdentity(req),
      rationale: b.data.rationale ?? null, effortCap: b.data.effortCap ?? null, reassessmentConditions: b.data.reassessmentConditions ?? null,
    });
    const projectWarning = await createTwoTrackProjectAfterApproval(q, canonicalOpportunityId, actorIdentity(req));
    res.json({ qualification: q, ...(projectWarning ? { projectWarning } : {}) });
  } catch (err: any) {
    if (mapQualificationError(res, err)) return;
    logFail('gov_qualification_approve_failed', err, { canonicalOpportunityId });
    res.status(500).json({ error: 'Could not approve the qualification.' });
  }
});

const linkBody = z.object({ deliveryProjectId: z.string().uuid(), linkReason: z.string().min(1).max(2000) });

/** POST /api/admin/factory/qualification/:canonicalOpportunityId/link — map the opportunity to an EXISTING gov
 *  project (idempotent, existence-checked; never renames or qualifies the project). */
router.post('/api/admin/factory/qualification/:canonicalOpportunityId/link', requireSection('program'), async (req: Request, res: Response) => {
  const p = canonicalParam.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: 'Invalid canonical opportunity id.' }); return; }
  const b = linkBody.safeParse(req.body ?? {});
  if (!b.success) { res.status(400).json({ error: 'Invalid link body.', issues: b.error.issues }); return; }
  const { canonicalOpportunityId } = p.data;
  const scope = await scopeOrFail(res, 'gov_qualification_link_scope', { canonicalOpportunityId });
  if (!scope) return;
  try {
    const alias = await linkGovOpportunity({
      tenantId: scope.tenantId, deliveryProjectId: b.data.deliveryProjectId,
      canonicalOpportunityId, linkedByIdentityId: actorIdentity(req), linkReason: b.data.linkReason,
    });
    res.status(alias.created ? 201 : 200).json({ alias });
  } catch (err: any) {
    if (err instanceof AliasProjectNotFoundError) { res.status(404).json({ error: 'That delivery project was not found in this workspace.' }); return; }
    if (err instanceof AliasProjectNotGovernmentError) { res.status(409).json({ error: 'Only a government delivery project can be linked to an opportunity.' }); return; }
    if (err instanceof AliasConflictError) { res.status(409).json({ error: 'This opportunity is already linked to a different project.', existingDeliveryProjectId: err.existingDeliveryProjectId }); return; }
    logFail('gov_qualification_link_failed', err, { canonicalOpportunityId });
    res.status(500).json({ error: 'Could not link the opportunity.' });
  }
});

const authorizeBuildBody = z.object({
  deliveryProjectId: z.string().uuid(),
  govQualificationId: z.string().uuid().optional(),
  scope: z.string().min(1).max(500),
  resourceLimit: z.string().min(1).max(500),
  rationale: z.string().max(4000).optional(),
});

/** POST /api/admin/factory/qualification/:canonicalOpportunityId/authorize-build — record the SEPARATE build
 *  authorization (a pursuit approval is not a build authorization). The approver is the request identity. */
router.post('/api/admin/factory/qualification/:canonicalOpportunityId/authorize-build', requireSection('program'), async (req: Request, res: Response) => {
  const p = canonicalParam.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: 'Invalid canonical opportunity id.' }); return; }
  const b = authorizeBuildBody.safeParse(req.body ?? {});
  if (!b.success) { res.status(400).json({ error: 'Invalid authorize-build body.', issues: b.error.issues }); return; }
  const { canonicalOpportunityId } = p.data;
  const scope = await scopeOrFail(res, 'gov_qualification_authorize_build_scope', { canonicalOpportunityId });
  if (!scope) return;
  try {
    const out = await authorizeBuild({
      deliveryProjectId: b.data.deliveryProjectId, govQualificationId: b.data.govQualificationId ?? null,
      approverIdentityId: actorIdentity(req), scope: b.data.scope, resourceLimit: b.data.resourceLimit, rationale: b.data.rationale ?? null,
    });
    res.status(201).json({ buildAuthorization: out });
  } catch (err: any) {
    if (err instanceof BuildNotAuthorizedError) { res.status(400).json({ error: err.message, reason: err.reason }); return; }
    logFail('gov_qualification_authorize_build_failed', err, { canonicalOpportunityId });
    res.status(500).json({ error: 'Could not record the build authorization.' });
  }
});

// Manual document review upload: in-memory, 100 MB cap. Multer errors (e.g. size) become a 400, not a 500. The
// ZIP bytes are hashed server-side and discarded — never stored.
const documentUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });
function uploadDocumentZip(req: Request, res: Response, next: (err?: any) => void): void {
  documentUpload.single('document')(req as any, res as any, (err: any) => {
    if (err) { res.status(400).json({ error: 'Upload failed (file too large or malformed).' }); return; }
    next();
  });
}

const reviewDocsBody = z.object({
  biddingEntity: biddingEntityField,
  expectedVersion: z.coerce.number().int().min(1),
  mode: z.enum(['add', 'revoke']),
  coveredDocIds: z.string().min(2), // JSON-encoded array of docId strings (multipart text field)
});

/**
 * POST /api/admin/factory/qualification/:canonicalOpportunityId/review-documents — record (mode 'add') or revoke
 * (mode 'revoke') a MANUAL document review. For 'add', the reviewer's manually-downloaded Bonfire ZIP is uploaded
 * (field 'document'); the server computes its sha256 and records an attestation covering the given authoritative
 * docIds, which then count toward the coverage gate. Non-weakening: recordDocumentReview rejects any docId the
 * source did not LIST as authoritative (422). Program-gated + tenant-scoped; bytes are never stored or logged.
 */
router.post('/api/admin/factory/qualification/:canonicalOpportunityId/review-documents', requireSection('program'), uploadDocumentZip, async (req: Request, res: Response) => {
  const p = canonicalParam.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: 'Invalid canonical opportunity id.' }); return; }
  const b = reviewDocsBody.safeParse(req.body ?? {});
  if (!b.success) { res.status(400).json({ error: 'Invalid review-documents body.', issues: b.error.issues }); return; }
  let coveredDocIds: string[];
  try {
    const parsed = JSON.parse(b.data.coveredDocIds);
    if (!Array.isArray(parsed) || parsed.length === 0 || parsed.some((x) => typeof x !== 'string')) throw new Error('bad');
    coveredDocIds = parsed;
  } catch { res.status(400).json({ error: 'coveredDocIds must be a non-empty JSON array of docId strings.' }); return; }
  const { canonicalOpportunityId } = p.data;
  const file: any = (req as any).file;
  if (b.data.mode === 'add' && (!file || !file.buffer)) { res.status(400).json({ error: 'No document file uploaded (field "document").' }); return; }
  const scope = await scopeOrFail(res, 'gov_qualification_review_documents_scope', { canonicalOpportunityId });
  if (!scope) return;
  try {
    const sha256 = file && file.buffer ? crypto.createHash('sha256').update(file.buffer).digest('hex') : null;
    const q = await recordDocumentReview({
      canonicalOpportunityId, biddingEntity: b.data.biddingEntity, expectedVersion: b.data.expectedVersion,
      reviewerIdentityId: actorIdentity(req), mode: b.data.mode, coveredDocIds,
      filename: file ? (file.originalname || 'document.zip') : null, sha256, sizeBytes: file ? file.size : null,
    });
    res.status(b.data.mode === 'add' ? 201 : 200).json({ qualification: q });
  } catch (err: any) {
    if (mapQualificationError(res, err)) return;
    logFail('gov_qualification_review_documents_failed', err, { canonicalOpportunityId });
    res.status(500).json({ error: 'Could not record the document review.' });
  }
});

const attestZipBody = z.object({
  biddingEntity: biddingEntityField,
  expectedVersion: z.coerce.number().int().min(1),
  mode: z.enum(['add', 'revoke']),
});

/**
 * POST /api/admin/factory/qualification/:canonicalOpportunityId/attest-zip — DECOUPLED (gws) evidence attestation.
 * The uploaded solicitation ZIP is the evidence of record for a ZIP workspace (there is NO OP snapshot to validate
 * docIds against), so the server computes the sha256 and records a single synthetic 'solicitation_zip' attestation
 * (bytes are NEVER stored); 'revoke' removes it. GWS-ONLY — a canonical opportunity uses /review-documents (400 here).
 */
router.post('/api/admin/factory/qualification/:canonicalOpportunityId/attest-zip', requireSection('program'), uploadDocumentZip, async (req: Request, res: Response) => {
  const p = qualKeyParam.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: 'Invalid opportunity key.' }); return; }
  if (!isGwsKey(p.data.canonicalOpportunityId)) { res.status(400).json({ error: 'ZIP attestation is only for the decoupled ZIP workspace; a canonical opportunity uses review-documents.' }); return; }
  const b = attestZipBody.safeParse(req.body ?? {});
  if (!b.success) { res.status(400).json({ error: 'Invalid attest-zip body.', issues: b.error.issues }); return; }
  const file: any = (req as any).file;
  if (b.data.mode === 'add' && (!file || !file.buffer)) { res.status(400).json({ error: 'No document file uploaded (field "document").' }); return; }
  const { canonicalOpportunityId } = p.data;
  const scope = await scopeOrFail(res, 'gov_qualification_attest_zip_scope', { canonicalOpportunityId });
  if (!scope) return;
  try {
    const sha256 = file && file.buffer ? crypto.createHash('sha256').update(file.buffer).digest('hex') : null;
    const q = await recordZipAttestation({
      gwsKey: canonicalOpportunityId, biddingEntity: b.data.biddingEntity, expectedVersion: b.data.expectedVersion,
      reviewerIdentityId: actorIdentity(req), mode: b.data.mode,
      filename: file ? (file.originalname || 'solicitation.zip') : null, sha256, sizeBytes: file ? file.size : null,
    });
    res.status(b.data.mode === 'add' ? 201 : 200).json({ qualification: q });
  } catch (err: any) {
    if (mapQualificationError(res, err)) return;
    logFail('gov_qualification_attest_zip_failed', err, { canonicalOpportunityId });
    res.status(500).json({ error: 'Could not record the ZIP attestation.' });
  }
});

/**
 * POST /api/admin/factory/qualification/:canonicalOpportunityId/extract-requirements — READ-ONLY. Run the existing
 * deterministic, in-memory extractor on the uploaded solicitation ZIP and return CANDIDATE requirements for the
 * reviewer to confirm in the workspace. It PERSISTS NOTHING: extraction is a convenience, not establishment — an
 * extracted candidate becomes an established (gate-bearing) requirement only when the reviewer confirms it through
 * the /decision establish path. Program-gated; multer in-memory ZIP (bytes hashed/parsed in memory, never stored).
 */
router.post('/api/admin/factory/qualification/:canonicalOpportunityId/extract-requirements', requireSection('program'), uploadDocumentZip, async (req: Request, res: Response) => {
  const p = qualKeyParam.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: 'Invalid opportunity key.' }); return; }
  const file: any = (req as any).file;
  if (!file || !file.buffer) { res.status(400).json({ error: 'No document file uploaded (field "document").' }); return; }
  try {
    const { extractProposal } = await import('../../services/factory/proposal/proposalExtractor');
    const result = await extractProposal(file.buffer);
    const candidates = (result.requirements || []).map((r: any) => ({
      id: r.canonicalReqId, text: r.statement, extractedText: r.extractedText,
      sourceDocument: r.sourceDocument, section: r.section, kind: r.kind, priority: r.priority,
    }));
    res.json({ candidates, fileCount: result.fileCount });
  } catch (err: any) {
    logFail('gov_qualification_extract_requirements_failed', err, { canonicalOpportunityId: p.data.canonicalOpportunityId });
    res.status(500).json({ error: 'Could not extract requirements from the document.' });
  }
});

export const QUALIFICATION_DECISION_STATES = QUALIFICATION_DECISIONS;
export const QUALIFICATION_APPROVAL_STATES = APPROVAL_DECISIONS;
export default router;
