import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireSection } from '../../middlewares/authMiddleware';
import type { ContractTrack, ContractRequirement, RequirementKind, RequirementPriority, EvidenceState } from '../../services/factory/contracts/factoryContract';
import {
  reconstructFactoryProject, factoryProjectView, sampleCommandCenterView,
  type FactoryDocJson, type FactoryCommandCenterView,
} from '../../services/factory/factoryProjectView';

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
        enrichmentStatus: chosen.enrichment_status, contentHash: chosen.content_sha256,
      },
    };
    res.json(body);
  } catch (err: any) {
    logFail('factory_contract_view_failed', err, { deliveryProjectId });
    res.status(500).json({ error: 'Could not load the contract.' });
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
function toContractRequirement(r: any): ContractRequirement {
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
    evidence_state: (r.evidence_state ?? 'planned') as EvidenceState,
    source_evidence: Array.isArray(r.source_evidence) ? r.source_evidence : [],
  };
}

export default router;
