/**
 * govQualification — the Enterprise-owned qualification record: create, record a decision, and the SERVER-SIDE
 * approval bound to an immutable OP source snapshot + version. Mirrors factoryApproval's CAS + fork-on-edit
 * (a new decision is a new version, never an in-place mutation; concurrency is made safe by the DB unique index
 * uq_gov_qual_thread_version on (canonical_opportunity_id, bidding_entity, version)). Opportunity Pulse's
 * verdict/scores are advisory; Enterprise qualification depends on EVIDENCE, not on OP supplying a verdict.
 */
import crypto from 'crypto';
import { fetchGovOpportunityDetail } from './opportunities/opDetailClient';

export type QualificationDecision =
  | 'pending_review' | 'needs_evidence' | 'no_bid' | 'rfi_response' | 'approved_bid_pursuit';
export const QUALIFICATION_DECISIONS: readonly QualificationDecision[] =
  ['pending_review', 'needs_evidence', 'no_bid', 'rfi_response', 'approved_bid_pursuit'];
/** The two decisions that are an APPROVAL (bind to a re-fetched source snapshot; require no blocking evidence). */
export const APPROVAL_DECISIONS: readonly QualificationDecision[] = ['rfi_response', 'approved_bid_pursuit'];

export class QualificationConflictError extends Error { constructor(public currentVersion: number) { super('qualification version conflict'); this.name = 'QualificationConflictError'; } }
export class QualificationBlockedError extends Error { constructor(public blocking: string[]) { super('qualification blocked by unmet requirements'); this.name = 'QualificationBlockedError'; } }
export class ChangedSourceError extends Error { constructor(public reviewed: number | null, public current: number) { super('source changed since review; renewed review required'); this.name = 'ChangedSourceError'; } }
export class SourceUnavailableError extends Error { constructor() { super('source evidence unavailable; approval blocked'); this.name = 'SourceUnavailableError'; } }
export class QualificationNotFoundError extends Error { constructor() { super('qualification not found'); this.name = 'QualificationNotFoundError'; } }
export class SelfApprovalError extends Error { constructor() { super('the qualification reviewer may not approve their own bid pursuit'); this.name = 'SelfApprovalError'; } }

function contentHash(salt: string, obj: unknown): string {
  return crypto.createHash('sha256').update(`${salt}:${JSON.stringify(obj)}`).digest('hex');
}

// ── Requirement evaluation (PURE) ────────────────────────────────────────────
export interface RequirementEval { id: string; dueStage: string; applicability: string; blocking: boolean; reason: string | null; }
export interface RequirementsEvaluation {
  evals: RequirementEval[];
  blocking: RequirementEval[];
  deliveryObligations: RequirementEval[];
  byDueStage: Record<string, RequirementEval[]>;
  canApproveBid: boolean;
}

/**
 * Missing evidence NEVER silently passes:
 *  - applicability 'unknown' is a first-class blocking state (never treated as false);
 *  - a 'not_applicable' with NO applicabilityEvidenceRef is blocking (an unevidenced not_applicable is how a
 *    cert wall gets wrongly dismissed);
 *  - an APPLICABLE binding/mandatory requirement due at SUBMISSION with no evidenceRef is a blocking submission
 *    prerequisite.
 * A delivery/award-stage obligation without evidence is FLAGGED (needs a credible plan + its later gate) but
 * does NOT block a bid-pursuit approval — future obligations must not block initial research.
 */
export function evaluateRequirements(reqs: any[] | null | undefined): RequirementsEvaluation {
  const list = Array.isArray(reqs) ? reqs : [];
  const evals: RequirementEval[] = list.map((r) => {
    const applicability = String(r?.applicability ?? 'unknown');
    const dueStage = String(r?.dueStage ?? 'unknown');
    const binding = r?.bindingStatus === 'binding_solicitation_requirement' || r?.bindingStatus === 'mandatory_response_instruction';
    const hasEvidence = !!(r?.evidenceRef && r.evidenceRef.docId);
    const naEvidenced = !!(r?.applicabilityEvidenceRef && r.applicabilityEvidenceRef.docId);
    let blocking = false; let reason: string | null = null;
    if (applicability === 'unknown') { blocking = true; reason = 'applicability_unknown'; }
    else if (applicability === 'not_applicable' && !naEvidenced) { blocking = true; reason = 'not_applicable_unevidenced'; }
    else if (applicability !== 'not_applicable' && binding && dueStage === 'submission' && !hasEvidence) { blocking = true; reason = 'submission_prerequisite_no_evidence'; }
    return { id: String(r?.id ?? ''), dueStage, applicability, blocking, reason };
  });
  const byDueStage: Record<string, RequirementEval[]> = { submission: [], award: [], delivery: [], unknown: [] };
  for (const e of evals) (byDueStage[e.dueStage] ?? byDueStage.unknown).push(e);
  const deliveryObligations = evals.filter((e) => (e.dueStage === 'delivery' || e.dueStage === 'award') && !e.blocking);
  const blocking = evals.filter((e) => e.blocking);
  return { evals, blocking, deliveryObligations, byDueStage, canApproveBid: blocking.length === 0 };
}

// ── Persistence ──────────────────────────────────────────────────────────────
async function loadCurrent(canonicalOpportunityId: string, biddingEntity: string): Promise<any | null> {
  const { default: GovQualification } = await import('../../models/GovQualification');
  return GovQualification.findOne({
    where: { canonical_opportunity_id: canonicalOpportunityId, bidding_entity: biddingEntity, status: 'active' },
    order: [['version', 'DESC']],
  });
}

export interface CreateQualificationInput {
  tenantId: string; organizationId?: string | null; biddingEntity: string;
  canonicalOpportunityId: string; deliveryProjectId?: string | null; reviewerIdentityId: string;
  sourceSnapshot: any; sourceSnapshotVersion: number; sourceAvailable: boolean; requirements: any[];
}

/** Create a pending_review qualification (version 1). Idempotent per (canonical, bidding_entity): re-create
 *  returns the existing active record rather than a second one. */
export async function createQualification(input: CreateQualificationInput): Promise<any> {
  const existing = await loadCurrent(input.canonicalOpportunityId, input.biddingEntity);
  if (existing) return existing.get ? existing.get() : existing;
  const { default: GovQualification } = await import('../../models/GovQualification');
  const evaluation = evaluateRequirements(input.requirements);
  const row: any = await GovQualification.create({
    tenant_id: input.tenantId, organization_id: input.organizationId ?? null, bidding_entity: input.biddingEntity,
    canonical_opportunity_id: input.canonicalOpportunityId, delivery_project_id: input.deliveryProjectId ?? null,
    reviewer_identity_id: input.reviewerIdentityId, decision: 'pending_review',
    requirements_json: { requirements: input.requirements, evaluation }, source_snapshot: input.sourceSnapshot,
    source_snapshot_version: input.sourceSnapshotVersion, source_available: input.sourceAvailable,
    status: 'active', version: 1,
    content_sha256: contentHash(`${input.canonicalOpportunityId}:${input.biddingEntity}:1`, input.sourceSnapshot),
  });
  return row.get ? row.get() : row;
}

async function forkNewVersion(current: any, patch: Record<string, any>): Promise<any> {
  const { default: GovQualification } = await import('../../models/GovQualification');
  const nextVersion = current.version + 1;
  const next: any = await GovQualification.create({
    tenant_id: current.tenant_id, organization_id: current.organization_id, bidding_entity: current.bidding_entity,
    canonical_opportunity_id: current.canonical_opportunity_id, delivery_project_id: current.delivery_project_id,
    requirements_json: current.requirements_json, source_snapshot: current.source_snapshot,
    source_snapshot_version: current.source_snapshot_version, source_available: current.source_available,
    status: 'active', version: nextVersion,
    content_sha256: contentHash(`${current.canonical_opportunity_id}:${current.bidding_entity}:${nextVersion}`, current.source_snapshot),
    ...patch,
  });
  current.status = 'superseded';
  current.superseded_by_id = next.id;
  await current.save();
  return next.get ? next.get() : next;
}

export interface RecordDecisionInput {
  canonicalOpportunityId: string; biddingEntity: string; expectedVersion: number;
  decision: QualificationDecision; rationale?: string | null; reviewerIdentityId: string;
  evidence?: any; effortCap?: string | null; reassessmentConditions?: string | null;
}

/** Record a NON-approval decision (needs_evidence / no_bid / pending_review). Approval decisions
 *  (approved_bid_pursuit / rfi_response) must go through approveGovQualification (source-snapshot bound). */
export async function recordDecision(input: RecordDecisionInput): Promise<any> {
  if (!QUALIFICATION_DECISIONS.includes(input.decision)) throw new Error(`unknown decision ${input.decision}`);
  if (APPROVAL_DECISIONS.includes(input.decision)) throw new Error('approval decisions must use approveGovQualification');
  const current = await loadCurrent(input.canonicalOpportunityId, input.biddingEntity);
  if (!current) throw new QualificationNotFoundError();
  if (current.version !== input.expectedVersion) throw new QualificationConflictError(current.version);
  return forkNewVersion(current, {
    decision: input.decision, rationale: input.rationale ?? null, reviewer_identity_id: input.reviewerIdentityId,
    evidence_json: input.evidence ?? current.evidence_json, effort_cap: input.effortCap ?? current.effort_cap,
    reassessment_conditions: input.reassessmentConditions ?? current.reassessment_conditions,
  });
}

export interface ApproveQualificationInput {
  canonicalOpportunityId: string; biddingEntity: string; expectedVersion: number;
  decision: 'approved_bid_pursuit' | 'rfi_response'; approverIdentityId: string;
  rationale?: string | null; evidence?: any; effortCap?: string | null; reassessmentConditions?: string | null;
}

/**
 * Server-side approval bound to an immutable source snapshot:
 *  1. CAS on expectedVersion (stale review -> conflict).
 *  2. RE-FETCH OP detail by canonical id (server-side). Unavailable -> FAIL CLOSED (SourceUnavailableError).
 *  3. If the re-fetched sourceSnapshotVersion != the reviewed source_snapshot_version -> ChangedSourceError
 *     (renewed review required). Browser-supplied source facts are NOT consulted here.
 *  4. evaluateRequirements(re-fetched requirements) must have NO blocking items -> else QualificationBlockedError.
 *  5. Fork a new approved version, binding the re-fetched snapshot + version and the approver identity.
 * Research authorization (this) does not imply build/submission readiness — a build needs a separate
 * build_authorization (see buildAuthorization).
 */
export async function approveGovQualification(input: ApproveQualificationInput): Promise<any> {
  if (!APPROVAL_DECISIONS.includes(input.decision)) throw new Error('approveGovQualification only records approval decisions');
  const current = await loadCurrent(input.canonicalOpportunityId, input.biddingEntity);
  if (!current) throw new QualificationNotFoundError();
  if (current.version !== input.expectedVersion) throw new QualificationConflictError(current.version);
  // Separation of duties: the reviewer who built the record may not approve their own pursuit. The section gate
  // is role-level only, so this identity check is the second, in-service guard (un-bypassable by the route).
  if (input.approverIdentityId && current.reviewer_identity_id && input.approverIdentityId === current.reviewer_identity_id) {
    throw new SelfApprovalError();
  }

  const detail = await fetchGovOpportunityDetail(input.canonicalOpportunityId);
  if (!detail) throw new SourceUnavailableError();                                   // fail closed
  if (detail.sourceSnapshotVersion !== current.source_snapshot_version) {
    throw new ChangedSourceError(current.source_snapshot_version ?? null, detail.sourceSnapshotVersion);
  }
  const evaluation = evaluateRequirements(detail.requirements);
  if (!evaluation.canApproveBid) throw new QualificationBlockedError(evaluation.blocking.map((b) => `${b.id}:${b.reason}`));

  return forkNewVersion(current, {
    decision: input.decision, reviewer_identity_id: current.reviewer_identity_id,
    // Bind the approval to the SERVER-fetched snapshot + version + the re-evaluated requirements.
    source_snapshot: detail, source_snapshot_version: detail.sourceSnapshotVersion, source_available: true,
    requirements_json: { requirements: detail.requirements, evaluation },
    rationale: input.rationale ?? current.rationale,
    // Capture the approver in the immutable evidence, distinct from the reviewer, so the record shows WHO approved.
    evidence_json: { ...(input.evidence ?? current.evidence_json ?? {}), approvedBy: input.approverIdentityId },
    effort_cap: input.effortCap ?? current.effort_cap, reassessment_conditions: input.reassessmentConditions ?? current.reassessment_conditions,
  });
}
