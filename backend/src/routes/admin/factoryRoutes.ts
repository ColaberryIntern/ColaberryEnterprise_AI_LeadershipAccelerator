import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireSection } from '../../middlewares/authMiddleware';
import type { ContractTrack, ContractRequirement, RequirementKind, RequirementPriority, EvidenceState } from '../../services/factory/contracts/factoryContract';
import {
  reconstructFactoryProject, factoryProjectView, sampleCommandCenterView,
  type FactoryDocJson, type FactoryCommandCenterView,
} from '../../services/factory/factoryProjectView';
// Phase 4 write path. factoryApproval / factoryReview lazy-load their models INSIDE their functions,
// so these static imports never trigger ORM init at module load.
import { approveProcessDocument, ApprovalConflictError, ApprovalGateError } from '../../services/factory/factoryApproval';
import { requestChanges, ReviewValidationError } from '../../services/factory/factoryReview';
// Gov-entry (Phase 5 slice 1): the best-fit opportunity feed (degrade-dark) + create-on-pick. The backfill
// + gov container lazy-load their models inside their functions, so these imports don't init the ORM here.
import { fetchBestFitOpportunities } from '../../services/factory/opportunities/oppPulseClient';
import { backfillUnassessedContract } from '../../services/factory/factoryBackfill';
import { resolveGovContractsContainer } from '../../scripts/lib/factoryDemoContainer';
// Slice 2: upload a solicitation zip -> deterministic source-cited requirements (no LLM).
import multer from 'multer';
import { ingestProposal } from '../../services/factory/proposal/proposalIngest';
// Slice 3: run the (flag-gated) generation engine -> a task graph the contract can be approved on.
import { generateDecomposition } from '../../services/factory/factoryDecomposeRun';

/**
 * Admin — AI Project Factory Command Center (READ ONLY, Phase 3).
 *
 * ── THE GATE ─────────────────────────────────────────────────────────────────
 * Every route is `requireSection('program')` (the section a delivery contract belongs to, like
 * /api/admin/projects). Two things must agree or a scoped mgmt token 403s: (1) mgmtSectionGate's
 * PATH_SECTION maps `/api/admin/factory` → 'program' (added in that file), and (2) the frontend nav
 * declares the SAME section. The route-auth lint (a required CI check) also requires this guard.
 *
 * ── WHAT IT SERVES ───────────────────────────────────────────────────────────
 * `factoryProjectView` — the command-center view model — for a delivery contract. Because the
 * factory ships dark and no live contract is seeded yet, `/sample` serves the in-code sample so the
 * UI renders on day one; `/contract/:id` reconstructs a real FactoryProject from the persisted
 * `doc_json` (a SUBSET) + `contract_tracks` + `contract_requirements`. Read only: the write actions
 * (approve / request-changes) already exist in factoryApproval and wire in Phase 4.
 */
const router = Router();

/** The approval state of the persisted document (null for the in-code sample, which is not stored). */
export interface FactoryApprovalInfo {
  status: string;
  level: string | null;
  version: number;
  /** which track this approval state belongs to — the approve action targets this track + version. */
  trackType: string;
  enrichmentStatus: string | null;
  contentHash: string | null;
}
export type FactoryCommandCenterResponse = FactoryCommandCenterView & { approval: FactoryApprovalInfo | null };

const idParam = z.object({ deliveryProjectId: z.string().uuid() });

function logFail(event: string, err: any, context: Record<string, unknown>): void {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'error', service: 'backend', event,
    outcome: 'failure', error_class: err?.constructor?.name ?? 'Error', context: { ...context, message: err?.message },
  }));
}

/** GET /api/admin/factory/sample — the day-one fixture (the Phase-1 sample), no DB. */
router.get('/api/admin/factory/sample', requireSection('program'), async (_req: Request, res: Response) => {
  const body: FactoryCommandCenterResponse = { ...sampleCommandCenterView(), approval: null };
  res.json(body);
});

/** GET /api/admin/factory/contract/:deliveryProjectId — a real contract's decomposition. */
router.get('/api/admin/factory/contract/:deliveryProjectId', requireSection('program'), async (req: Request, res: Response) => {
  const parsed = idParam.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid delivery project id.', issues: parsed.error.issues });
    return;
  }
  const { deliveryProjectId } = parsed.data;
  try {
    // Lazy-load the models so the sample path never triggers ORM init (the projectApprovalService lesson).
    const { default: ContractProcessDocument } = await import('../../models/ContractProcessDocument');
    const { default: ContractTrackModel } = await import('../../models/ContractTrack');
    const { default: ContractRequirementModel } = await import('../../models/ContractRequirement');

    const docs = await ContractProcessDocument.findAll({
      where: { delivery_project_id: deliveryProjectId },
      order: [['version', 'DESC']],
    });
    if (!docs.length) {
      res.status(404).json({ error: 'No decomposition has been generated for this contract yet.' });
      return;
    }
    // Latest per track; render the solution_build process if present (it carries the build), else the newest.
    const latestByTrack = new Map<string, typeof docs[number]>();
    for (const d of docs) if (!latestByTrack.has(d.track_type)) latestByTrack.set(d.track_type, d);
    const chosen = latestByTrack.get('solution_build') ?? docs[0];

    const [trackRows, reqRows] = await Promise.all([
      ContractTrackModel.findAll({ where: { delivery_project_id: deliveryProjectId } }),
      ContractRequirementModel.findAll({ where: { delivery_project_id: deliveryProjectId } }),
    ]);

    const project = reconstructFactoryProject({
      deliveryProjectId,
      docJson: (chosen.doc_json ?? {}) as FactoryDocJson,
      tracks: trackRows.map(toContractTrack),
      requirements: reqRows.map(toContractRequirement),
    });

    const body: FactoryCommandCenterResponse = {
      ...factoryProjectView(project, { contractName: `Delivery contract ${deliveryProjectId.slice(0, 8)}` }),
      approval: {
        status: chosen.status, level: chosen.approval_level, version: chosen.version,
        trackType: chosen.track_type,
        enrichmentStatus: chosen.enrichment_status, contentHash: chosen.content_sha256,
      },
    };
    res.json(body);
  } catch (err: any) {
    logFail('factory_contract_view_failed', err, { deliveryProjectId });
    res.status(500).json({ error: 'Could not load the contract.' });
  }
});

/** GET /api/admin/factory/contracts — delivery projects that have a persisted decomposition, so the
 *  page can default to a real contract instead of the sample. Latest document per project. */
router.get('/api/admin/factory/contracts', requireSection('program'), async (_req: Request, res: Response) => {
  try {
    const { default: ContractProcessDocument } = await import('../../models/ContractProcessDocument');
    const { default: DeliveryProject } = await import('../../models/DeliveryProject');
    const docs = await ContractProcessDocument.findAll({ order: [['version', 'DESC']] });
    const latestByProject = new Map<string, typeof docs[number]>();
    for (const d of docs) if (!latestByProject.has(d.delivery_project_id)) latestByProject.set(d.delivery_project_id, d);
    const ids = [...latestByProject.keys()];
    const projects = ids.length ? await DeliveryProject.findAll({ where: { id: ids } }) : [];
    const nameById = new Map<string, string>(projects.map((p: any) => [p.id, p.name]));
    const contracts = [...latestByProject.values()].map((d) => ({
      deliveryProjectId: d.delivery_project_id,
      name: nameById.get(d.delivery_project_id) ?? null,
      trackType: d.track_type, status: d.status, version: d.version,
    }));
    res.json({ contracts });
  } catch (err: any) {
    logFail('factory_contracts_list_failed', err, {});
    res.status(500).json({ error: 'Could not list contracts.' });
  }
});

const approveBody = z.object({
  trackType: z.string().min(1),
  expectedVersion: z.coerce.number().int().min(1),
  level: z.enum(['documented', 'full']),
  enrichmentStatus: z.enum(['pending', 'partial', 'resolved']),
});

/** POST /api/admin/factory/contract/:deliveryProjectId/approve — the gated, CAS-guarded approval. */
router.post('/api/admin/factory/contract/:deliveryProjectId/approve', requireSection('program'), async (req: Request, res: Response) => {
  const p = idParam.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: 'Invalid delivery project id.', issues: p.error.issues }); return; }
  const b = approveBody.safeParse(req.body);
  if (!b.success) { res.status(400).json({ error: 'Invalid approval request.', issues: b.error.issues }); return; }
  const { deliveryProjectId } = p.data;
  const approvedBy = String((req as any).admin?.email ?? (req as any).admin?.sub ?? 'unknown-admin');
  const revisionId = `${deliveryProjectId}:${b.data.trackType}:${b.data.expectedVersion}`;
  try {
    const dto = await approveProcessDocument({
      deliveryProjectId, trackType: b.data.trackType, expectedVersion: b.data.expectedVersion,
      level: b.data.level, revisionId, approvedBy, enrichmentStatus: b.data.enrichmentStatus,
    });
    res.json(dto);
  } catch (err: any) {
    if (err instanceof ApprovalConflictError) { res.status(409).json({ error: err.message, currentVersion: err.currentVersion }); return; }
    if (err instanceof ApprovalGateError) { res.status(422).json({ error: err.message, issues: err.issues }); return; }
    const msg = String(err?.message ?? '');
    if (/no process document/i.test(msg)) { res.status(404).json({ error: 'No decomposition to approve for this contract.' }); return; }
    if (/illegal approval transition/i.test(msg)) { res.status(409).json({ error: msg }); return; }
    logFail('factory_approve_failed', err, { deliveryProjectId });
    res.status(500).json({ error: 'Could not approve the contract.' });
  }
});

const requestChangesBody = z.object({
  trackType: z.string().min(1),
  reviewedVersion: z.coerce.number().int().min(1),
  reason: z.string().min(1),
});

/** POST /api/admin/factory/contract/:deliveryProjectId/request-changes — a companion review record. */
router.post('/api/admin/factory/contract/:deliveryProjectId/request-changes', requireSection('program'), async (req: Request, res: Response) => {
  const p = idParam.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: 'Invalid delivery project id.', issues: p.error.issues }); return; }
  const b = requestChangesBody.safeParse(req.body);
  if (!b.success) { res.status(400).json({ error: 'Invalid request-changes body.', issues: b.error.issues }); return; }
  const { deliveryProjectId } = p.data;
  const requestedBy = String((req as any).admin?.email ?? (req as any).admin?.sub ?? 'unknown-admin');
  try {
    const dto = await requestChanges({
      deliveryProjectId, trackType: b.data.trackType, reviewedVersion: b.data.reviewedVersion,
      reason: b.data.reason, requestedBy,
    });
    res.status(201).json(dto);
  } catch (err: any) {
    if (err instanceof ReviewValidationError) { res.status(400).json({ error: err.message }); return; }
    logFail('factory_request_changes_failed', err, { deliveryProjectId });
    res.status(500).json({ error: 'Could not record the change request.' });
  }
});

/**
 * GET /api/admin/factory/opportunities — the ranked best-fit government proposals for the entry page.
 * Live from Opportunity Pulse when configured, else the labeled in-app snapshot (the client degrades dark).
 * Nested under /api/admin/factory, so mgmtSectionGate's existing '/api/admin/factory' → 'program' covers it.
 */
router.get('/api/admin/factory/opportunities', requireSection('program'), async (_req: Request, res: Response) => {
  try {
    const feed = await fetchBestFitOpportunities(); // never throws
    res.json(feed);
  } catch (err: any) {
    logFail('factory_opportunities_failed', err, {});
    res.status(500).json({ error: 'Could not load government opportunities.' });
  }
});

const startBody = z.object({ title: z.string().max(300).optional(), agency: z.string().max(200).optional() });
const uuidParam = z.object({ uuid: z.string().uuid() });

/**
 * POST /api/admin/factory/opportunities/:uuid/start — pick a gov opportunity and start working on it.
 * findOrCreate a `government_public_sector` delivery project on a deterministic slug (`gov-<uuid>`, so a
 * re-pick reuses it) under the Government Contracts container, then backfill an honest `unassessed` shell
 * (Phase 6) so the Command Center opens on it. The real requirements come from the proposal zip in a later
 * slice; for now the contract exists and renders as unassessed.
 */
router.post('/api/admin/factory/opportunities/:uuid/start', requireSection('program'), async (req: Request, res: Response) => {
  const p = uuidParam.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: 'Invalid opportunity id.' }); return; }
  const b = startBody.safeParse(req.body ?? {});
  if (!b.success) { res.status(400).json({ error: 'Invalid body.' }); return; }
  const { uuid } = p.data;
  const slug = `gov-${uuid}`;
  try {
    const { default: DeliveryProject } = await import('../../models/DeliveryProject');
    const { brandId, org, engagement } = await resolveGovContractsContainer();

    let created = false;
    let project: any = await DeliveryProject.findOne({ where: { slug } });
    if (!project) {
      project = await DeliveryProject.create({
        engagement_id: engagement.id, tenant_id: engagement.tenant_id, organization_id: org.id,
        brand_id: brandId,
        name: (b.data.title && b.data.title.trim()) ? b.data.title.trim() : `Government contract ${uuid}`,
        slug, status: 'building', project_class: 'government_public_sector',
        business_problem: b.data.agency ? `Government solicitation from ${b.data.agency}.` : 'Government contract opportunity.',
      });
      created = true;
    }

    await backfillUnassessedContract(project.id); // honest unassessed shell so /contract/:id renders
    res.status(created ? 201 : 200).json({ deliveryProjectId: project.id, created });
  } catch (err: any) {
    logFail('factory_opportunity_start_failed', err, { uuid, slug });
    res.status(500).json({ error: 'Could not start this opportunity.' });
  }
});

// Solicitation upload: in-memory, 25 MB cap. Multer errors (e.g. size) are turned into a 400, not a 500.
const proposalUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
function uploadProposalZip(req: Request, res: Response, next: (err?: any) => void): void {
  proposalUpload.single('proposal')(req as any, res as any, (err: any) => {
    if (err) { res.status(400).json({ error: 'Upload failed (file too large or malformed).' }); return; }
    next();
  });
}

/**
 * POST /api/admin/factory/contract/:deliveryProjectId/ingest-proposal — upload the solicitation .zip; the
 * factory extracts source-cited requirements (deterministic, no LLM) and replaces the UNASSESSED shell.
 * Nested under /api/admin/factory, so mgmtSectionGate's 'program' mapping covers it.
 */
router.post('/api/admin/factory/contract/:deliveryProjectId/ingest-proposal', requireSection('program'), uploadProposalZip, async (req: Request, res: Response) => {
  const parsed = idParam.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid delivery project id.' }); return; }
  const file: any = (req as any).file;
  if (!file || !file.buffer) { res.status(400).json({ error: 'No proposal file uploaded (field "proposal").' }); return; }
  const fileName: string = file.originalname || 'proposal.zip';
  if (!/\.zip$/i.test(fileName)) { res.status(400).json({ error: 'Please upload a .zip of the solicitation.' }); return; }
  const { deliveryProjectId } = parsed.data;
  try {
    const result = await ingestProposal(deliveryProjectId, file.buffer, fileName);
    res.json(result);
  } catch (err: any) {
    logFail('factory_ingest_proposal_failed', err, { deliveryProjectId, fileName });
    res.status(500).json({ error: 'Could not ingest the proposal.' });
  }
});

/**
 * POST /api/admin/factory/contract/:deliveryProjectId/generate — run the generation engine on the contract's
 * requirements and, when the result is gate-clean, persist the task graph so the contract becomes approvable.
 * A gate-dirty result is a 422 with the issue count (never persisted); the engine being off is a 409.
 */
router.post('/api/admin/factory/contract/:deliveryProjectId/generate', requireSection('program'), async (req: Request, res: Response) => {
  const parsed = idParam.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid delivery project id.' }); return; }
  const { deliveryProjectId } = parsed.data;
  try {
    const out = await generateDecomposition(deliveryProjectId);
    if (out.status === 'disabled') {
      res.status(409).json({ error: 'The generation engine is off.', generationDisabled: true });
      return;
    }
    if (out.status === 'rejected') {
      res.status(422).json({ error: 'The generated decomposition did not pass the gate.', errorCount: out.errorCount, issues: out.issues });
      return;
    }
    res.json({ accepted: true, errorCount: 0 });
  } catch (err: any) {
    logFail('factory_generate_failed', err, { deliveryProjectId });
    res.status(500).json({ error: 'Could not generate the decomposition.' });
  }
});

// ── row → typed contract mappers (defensive; JSONB columns are `any` per the model convention) ──
function toContractTrack(r: any): ContractTrack {
  return {
    id: r.id,
    delivery_project_id: r.delivery_project_id,
    track_type: r.track_type,
    status: r.status ?? '',
    owner_identity_id: r.owner_identity_id ?? null,
    solution_student_project_id: r.solution_student_project_id ?? null,
  };
}
/** Exported for unit test: maps a DB requirement row to the typed contract shape. */
export function toContractRequirement(r: any): ContractRequirement {
  return {
    id: r.canonical_req_id, // the traceability spine id, NOT the row UUID
    statement: r.statement ?? '',
    kind: (r.kind ?? 'technical') as RequirementKind,
    priority: (r.priority ?? 'must') as RequirementPriority,
    tracks: Array.isArray(r.tracks) ? r.tracks : [],
    source_document: r.source_document ?? '',
    amendment_version: r.amendment_version ?? '',
    section: r.section ?? '',
    extracted_text: r.extracted_text ?? '',
    interpretation: r.interpretation ?? null,
    human_confirmed: !!r.human_confirmed,
    // A null/unknown evidence_state reads as honestly-unknown (`unassessed`), never as `planned` —
    // a migrated/legacy requirement with no established evidence must not claim it is planned.
    evidence_state: (r.evidence_state ?? 'unassessed') as EvidenceState,
    source_evidence: Array.isArray(r.source_evidence) ? r.source_evidence : [],
  };
}

export default router;
