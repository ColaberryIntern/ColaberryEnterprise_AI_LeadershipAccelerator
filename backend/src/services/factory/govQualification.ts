/**
 * govQualification — the Enterprise-owned qualification record: create, record a decision, and the SERVER-SIDE
 * approval bound to an immutable OP source snapshot + version. Mirrors factoryApproval's CAS + fork-on-edit
 * (a new decision is a new version, never an in-place mutation; concurrency is made safe by the DB unique index
 * uq_gov_qual_thread_version on (canonical_opportunity_id, bidding_entity, version)). Opportunity Pulse's
 * verdict/scores are advisory; Enterprise qualification depends on EVIDENCE, not on OP supplying a verdict.
 */
import crypto from 'crypto';
import { resolveGovOpportunityDetail } from './opportunities/opDetailClient';

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
/** The re-resolved source is present but NOT in an approvable state (degraded last-known snapshot, or a snapshot
 *  the producer never recorded). Recoverable by renewed review once the source is current — never a blind retry. */
export class SourceNotApprovableError extends Error { constructor(public reason: 'degraded' | 'snapshot_unrecorded') { super(`source not in an approvable state: ${reason}`); this.name = 'SourceNotApprovableError'; } }
/** Document coverage / established requirements are not sufficient to approve a pursuit (missing evidence never
 *  silently passes; an empty requirements list is not evidence of "no requirements"). */
export class EvidenceInsufficientError extends Error { constructor(public reasons: string[]) { super('evidence coverage insufficient for pursuit approval'); this.name = 'EvidenceInsufficientError'; } }
/** A manual document review named a docId that the source never LISTED as an authoritative document — a human
 *  cannot invent an authoritative doc; manual review may only attest to OP-listed authoritative docIds. */
export class DocumentNotListedError extends Error { constructor(public docIds: string[]) { super('document(s) not listed as authoritative in the source snapshot'); this.name = 'DocumentNotListedError'; } }

function contentHash(salt: string, obj: unknown): string {
  return crypto.createHash('sha256').update(`${salt}:${JSON.stringify(obj)}`).digest('hex');
}

// ── Requirement evaluation (PURE) ────────────────────────────────────────────
export interface RequirementEval { id: string; dueStage: string; applicability: string; blocking: boolean; reason: string | null; }
export interface RequirementsEvaluation {
  evals: RequirementEval[];
  /** The FULL submission bar: every blocking reason (judgment gaps AND un-evidenced submission prerequisites). */
  blocking: RequirementEval[];
  /** Disqualifiers that block a PURSUIT decision: unknown applicability + un-evidenced "not applicable". */
  pursuitBlocking: RequirementEval[];
  /** Applicable submission requirements still needing evidence — block SUBMISSION, not the pursuit decision. */
  openSubmissionRequirements: RequirementEval[];
  deliveryObligations: RequirementEval[];
  byDueStage: Record<string, RequirementEval[]>;
  /** Submission-ready: nothing blocking at all (the bar the later bid-submission gate uses). */
  canApproveBid: boolean;
  /** Pursuit/research-ready: no disqualifier (un-evidenced submission prerequisites are expected at this stage). */
  canApprovePursuit: boolean;
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
  // A PURSUIT (research) decision is blocked only by true disqualifiers — a requirement of unknown applicability or
  // an un-evidenced "not applicable". An applicable submission requirement that merely lacks evidence yet is NOT a
  // disqualifier: evidence is gathered during the pursuit/build, and the FULL bar (canApproveBid) gates submission.
  const pursuitBlocking = blocking.filter((e) => e.reason !== 'submission_prerequisite_no_evidence');
  const openSubmissionRequirements = blocking.filter((e) => e.reason === 'submission_prerequisite_no_evidence');
  return {
    evals, blocking, pursuitBlocking, openSubmissionRequirements, deliveryObligations, byDueStage,
    canApproveBid: blocking.length === 0,
    canApprovePursuit: pursuitBlocking.length === 0,
  };
}

// ── Evidence-coverage evaluation (PURE) ──────────────────────────────────────
export interface EvidenceCoverage { sufficient: boolean; reasons: string[]; }

/**
 * Whether the source evidence is sufficient to APPROVE a pursuit — separate from, and additional to, requirement
 * blocking. Missing evidence never silently passes:
 *  - Zero ESTABLISHED requirements → `no_requirements_established`. OP's `requirements[]` is ALWAYS empty (it never
 *    synthesises requirements from a title), and the schema is explicit that an empty array is NOT evidence of "no
 *    requirements" — the reviewer must establish the applicable, cited requirements first.
 *  - Document coverage is judged from `documents.items[]` (the per-document breakdown): an item is AUTHORITATIVE
 *    when `role ∈ {solicitation, final_pws_sow, amendment}` (a `draft_pws` carries no binding obligation, so it is
 *    not authoritative) and REVIEWED when `retrieval.status === 'downloaded'` OR the reviewer manually attested to
 *    its `docId` (Bonfire gates the ZIP behind a portal session, so OP can LIST a doc but not download it; the
 *    reviewer downloads it by hand and records it — see recordDocumentReview / reviewedDocIds). Coverage is
 *    sufficient when the base solicitation/final_pws_sow is reviewed AND every amendment is reviewed. `partial` is
 *    not automatically failure: partial with all authoritative items reviewed (only non-authoritative attachments
 *    inaccessible) is sufficient.
 *  - `no_authoritative_source` is reserved for "OP listed NO authoritative doc"; a listed-but-unreviewed base or
 *    amendment → `authoritative_package_unreviewed`; `none_published` → `no_authoritative_source`;
 *    `inaccessible`/`unknown` coverage → `document_coverage_unknown`.
 */
export function evaluateEvidenceCoverage(
  source: any,
  establishedRequirements: any[] | null | undefined,
  reviewedDocIds?: ReadonlySet<string> | string[] | null,
): EvidenceCoverage {
  const reasons: string[] = [];
  const established = Array.isArray(establishedRequirements) ? establishedRequirements : [];
  if (established.length === 0) reasons.push('no_requirements_established');

  // A manually-reviewed authoritative doc (the reviewer downloaded the Bonfire ZIP and attested to it) counts
  // as reviewed alongside anything OP actually downloaded. reviewedDocIds are validated at write time to be
  // OP-listed authoritative docIds, so this can never invent an authoritative source — see recordDocumentReview.
  const reviewedSet: ReadonlySet<string> = reviewedDocIds instanceof Set
    ? reviewedDocIds
    : new Set(Array.isArray(reviewedDocIds) ? reviewedDocIds : []);
  const docs = source && source.documents;
  const coverage = String(docs?.coverage ?? 'unknown');
  const items: any[] = Array.isArray(docs?.items) ? docs.items : [];
  const reviewed = (it: any) => (it && it.retrieval && it.retrieval.status === 'downloaded') || (it && reviewedSet.has(it.docId));
  const base = items.filter((it) => it?.role === 'solicitation' || it?.role === 'final_pws_sow');
  const amendments = items.filter((it) => it?.role === 'amendment');

  if (coverage === 'none_published') {
    reasons.push('no_authoritative_source');
  } else if (coverage === 'inaccessible' || coverage === 'unknown') {
    reasons.push('document_coverage_unknown');
  } else {
    // complete | complete_for_this_notice | partial
    // no_authoritative_source is reserved for "OP listed NO authoritative doc"; a doc that IS listed but not yet
    // reviewed (downloaded or manually attested) is authoritative_package_unreviewed — it exists, it needs review.
    if (base.length === 0) reasons.push('no_authoritative_source');
    else if (!base.some(reviewed) || !amendments.every(reviewed)) reasons.push('authoritative_package_unreviewed');
  }
  return { sufficient: reasons.length === 0, reasons };
}

/**
 * DECOUPLED (discovery-ZIP) coverage: the uploaded solicitation ZIP is the evidence of record (there is NO OP
 * snapshot). Sufficient to approve a pursuit only when the reviewer has established >=1 applicable requirement AND
 * attested the ZIP (a recorded, non-empty server sha256). Missing evidence never silently passes: empty established
 * → `no_requirements_established` (an empty list is not "no requirements"); no attested ZIP → `no_zip_attested`.
 * Both reasons can accumulate. Pure, total, never throws.
 */
export function evaluateZipCoverage(
  establishedRequirements: any[] | null | undefined,
  reviewedDocuments: any[] | null | undefined,
): EvidenceCoverage {
  const reasons: string[] = [];
  const established = Array.isArray(establishedRequirements) ? establishedRequirements : [];
  if (established.length === 0) reasons.push('no_requirements_established');
  const docs = Array.isArray(reviewedDocuments) ? reviewedDocuments : [];
  const hasZip = docs.some((d) => d && d.method === 'solicitation_zip' && typeof d.sha256 === 'string' && d.sha256.length > 0);
  if (!hasZip) reasons.push('no_zip_attested');
  return { sufficient: reasons.length === 0, reasons };
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

export interface CreateDecoupledQualificationInput {
  tenantId: string; organizationId?: string | null; biddingEntity: string;
  gwsKey: string; reviewerIdentityId: string;
  provenance: { uuid: string; title: string | null; agency: string | null };
}

/**
 * Create a pending_review qualification for a DECOUPLED (discovery-ZIP) workspace — NOT bound to an OP source
 * snapshot. The uploaded ZIP is the evidence source; pursuit approval + evidence attestation are later, gated
 * slices (canApprove stays false on this path). Idempotent per (gwsKey, bidding_entity).
 */
export async function createDecoupledQualification(input: CreateDecoupledQualificationInput): Promise<any> {
  const existing = await loadCurrent(input.gwsKey, input.biddingEntity);
  if (existing) return existing.get ? existing.get() : existing;
  const { default: GovQualification } = await import('../../models/GovQualification');
  const evaluation = evaluateRequirements([]);
  const row: any = await GovQualification.create({
    tenant_id: input.tenantId, organization_id: input.organizationId ?? null, bidding_entity: input.biddingEntity,
    canonical_opportunity_id: input.gwsKey, delivery_project_id: null,
    reviewer_identity_id: input.reviewerIdentityId, decision: 'pending_review',
    requirements_json: { requirements: [], evaluation, workspace_kind: 'discovery_zip', provenance: input.provenance },
    source_snapshot: null, source_snapshot_version: null, source_available: false,
    status: 'active', version: 1,
    content_sha256: contentHash(`${input.gwsKey}:${input.biddingEntity}:1`, input.provenance),
  });
  return row.get ? row.get() : row;
}

/**
 * The read view for a DECOUPLED (discovery-ZIP) workspace: NO OP source re-fetch (source is null). The uploaded ZIP
 * is the evidence source. Coverage + canApprove are computed from the established requirements AND whether the ZIP
 * has been attested (evaluateZipCoverage) — so pursuit approval is offered ONLY when requirements are established,
 * the ZIP is attested, and no requirement blocks. No OP snapshot is ever fabricated.
 */
export async function getDecoupledWorkspace(tenantId: string, gwsKey: string, biddingEntity?: string): Promise<any> {
  const { default: GovQualification } = await import('../../models/GovQualification');
  const where: any = { canonical_opportunity_id: gwsKey, tenant_id: tenantId, status: 'active' };
  if (biddingEntity) where.bidding_entity = biddingEntity;
  const record: any = await GovQualification.findOne({ where, order: [['version', 'DESC']] });
  const recordJson = record ? record.get() : null;
  const established = (recordJson && recordJson.requirements_json && recordJson.requirements_json.established) || [];
  const provenance = (recordJson && recordJson.requirements_json && recordJson.requirements_json.provenance) || null;
  const reviewedDocuments = (recordJson && recordJson.requirements_json && recordJson.requirements_json.reviewedDocuments) || [];
  const zipAttestation = (Array.isArray(reviewedDocuments) ? reviewedDocuments : []).find((d: any) => d && d.method === 'solicitation_zip') || null;
  const evaluation = evaluateRequirements(established);
  const coverage = evaluateZipCoverage(established, reviewedDocuments);
  // Daily-tracking: surface the last sync + any flagged change (never throws / blocks the workspace).
  let sync: any = null;
  try { const { getGovSyncEntry } = await import('./govOpportunitySync'); sync = await getGovSyncEntry(gwsKey); } catch { sync = null; }
  return {
    canonicalOpportunityId: gwsKey,
    sourceLive: false,
    sourceState: 'zip_workspace',
    sourceStateLabel: 'ZIP workspace',
    sourceAvailable: false,
    sourceSnapshotVersion: null,
    snapshotRecorded: false,
    source: null,
    evaluation,
    coverage,
    qualification: recordJson,
    provenance,
    zipAttestation,
    changedSource: false,
    lastSyncedAt: sync ? sync.syncedAt : null,
    syncChange: sync && sync.change && sync.change.kind !== 'none' ? sync.change : null,
    canApprove: evaluation.canApprovePursuit && coverage.sufficient,
  };
}

export interface RecordZipAttestationInput {
  gwsKey: string; biddingEntity: string; expectedVersion: number; reviewerIdentityId: string;
  mode: 'add' | 'revoke'; filename?: string | null; sha256?: string | null; sizeBytes?: number | null;
}

/**
 * Attest (or revoke) the uploaded solicitation ZIP as the EVIDENCE OF RECORD for a DECOUPLED (gws) qualification.
 * Unlike recordDocumentReview (which validates each coveredDocId against the OP snapshot), a decoupled record has NO
 * OP snapshot — the uploaded ZIP IS the authoritative package — so there is no docId check: it records ONE synthetic
 * `solicitation_zip` reviewedDocuments entry (the server-computed sha256 + filename; bytes are NEVER stored),
 * idempotent (re-attest overwrites), with 'revoke' as the recovery path. Fork-on-edit preserves established/provenance.
 */
export async function recordZipAttestation(input: RecordZipAttestationInput): Promise<any> {
  const current = await loadCurrent(input.gwsKey, input.biddingEntity);
  if (!current) throw new QualificationNotFoundError();
  if (current.version !== input.expectedVersion) throw new QualificationConflictError(current.version);
  const existing: any[] = (current.requirements_json && Array.isArray(current.requirements_json.reviewedDocuments))
    ? current.requirements_json.reviewedDocuments : [];
  const kept = existing.filter((e) => e && e.method !== 'solicitation_zip'); // single synthetic ZIP entry (idempotent)
  const reviewedDocuments = input.mode === 'revoke' ? kept : [...kept, {
    docId: 'solicitation_zip', role: 'solicitation_zip', method: 'solicitation_zip',
    filename: input.filename ?? null, sha256: input.sha256 ?? null, sizeBytes: input.sizeBytes ?? null,
    reviewedBy: input.reviewerIdentityId, reviewedAt: new Date().toISOString(),
  }];
  return forkNewVersion(current, {
    reviewer_identity_id: input.reviewerIdentityId,
    requirements_json: { ...(current.requirements_json || {}), reviewedDocuments },
  });
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
  /** The reviewer-ESTABLISHED, cited applicable requirements (same shape as source requirements). Stored in
   *  requirements_json.established; this is what pursuit approval evaluates (OP supplies none for live v2). */
  establishedRequirements?: any[];
}

/** Record a NON-approval decision (needs_evidence / no_bid / pending_review) and/or the reviewer-established
 *  requirements. Approval decisions (approved_bid_pursuit / rfi_response) must go through approveGovQualification
 *  (source-snapshot bound). Fork-on-edit preserves the prior version's evidence. */
export async function recordDecision(input: RecordDecisionInput): Promise<any> {
  if (!QUALIFICATION_DECISIONS.includes(input.decision)) throw new Error(`unknown decision ${input.decision}`);
  if (APPROVAL_DECISIONS.includes(input.decision)) throw new Error('approval decisions must use approveGovQualification');
  const current = await loadCurrent(input.canonicalOpportunityId, input.biddingEntity);
  if (!current) throw new QualificationNotFoundError();
  if (current.version !== input.expectedVersion) throw new QualificationConflictError(current.version);
  const requirements_json = input.establishedRequirements
    ? { ...(current.requirements_json || {}), established: input.establishedRequirements }
    : current.requirements_json;
  return forkNewVersion(current, {
    decision: input.decision, rationale: input.rationale ?? null, reviewer_identity_id: input.reviewerIdentityId,
    requirements_json,
    evidence_json: input.evidence ?? current.evidence_json, effort_cap: input.effortCap ?? current.effort_cap,
    reassessment_conditions: input.reassessmentConditions ?? current.reassessment_conditions,
  });
}

const AUTHORITATIVE_ROLES = new Set(['solicitation', 'final_pws_sow', 'amendment']);

/** The set of authoritative docIds a record has had MANUALLY reviewed (from requirements_json.reviewedDocuments). */
export function reviewedDocIdsFrom(record: any): Set<string> {
  const entries = (record && record.requirements_json && record.requirements_json.reviewedDocuments) || [];
  return new Set((Array.isArray(entries) ? entries : []).map((e: any) => String(e.docId)));
}

export interface RecordDocumentReviewInput {
  canonicalOpportunityId: string; biddingEntity: string; expectedVersion: number; reviewerIdentityId: string;
  mode: 'add' | 'revoke';
  coveredDocIds: string[];
  /** For mode 'add': the uploaded ZIP's attestation metadata (server-computed sha256; bytes are NOT stored). */
  filename?: string | null; sha256?: string | null; sizeBytes?: number | null;
}

/**
 * Record (or revoke) a MANUAL document review: the reviewer downloaded the Bonfire ZIP by hand and attests that
 * the authoritative documents are in hand. NON-WEAKENING by construction:
 *  - each coveredDocId MUST be an authoritative item (role ∈ solicitation/final_pws_sow/amendment) that the
 *    source snapshot actually LISTED — otherwise DocumentNotListedError (a human can't invent an authoritative
 *    doc, and can't attest to a non-authoritative attachment);
 *  - it only affects the document-coverage sub-check; the established-requirements gate + requirement-blocking +
 *    reviewer≠approver + CAS + changed-source all still apply at approval;
 *  - fork-on-edit keeps every prior version, and 'revoke' removes an erroneous attestation (recovery) by forking
 *    a new version without it — nothing is destructively mutated.
 * The sha256 is computed server-side (see the route); this stores the attestation metadata, never the bytes.
 */
export async function recordDocumentReview(input: RecordDocumentReviewInput): Promise<any> {
  const current = await loadCurrent(input.canonicalOpportunityId, input.biddingEntity);
  if (!current) throw new QualificationNotFoundError();
  if (current.version !== input.expectedVersion) throw new QualificationConflictError(current.version);

  const items: any[] = (current.source_snapshot && Array.isArray(current.source_snapshot.documents?.items))
    ? current.source_snapshot.documents.items : [];
  const authoritativeById = new Map<string, any>(
    items.filter((it) => AUTHORITATIVE_ROLES.has(String(it?.role))).map((it) => [String(it.docId), it]),
  );
  const covered = Array.isArray(input.coveredDocIds) ? input.coveredDocIds.map(String) : [];
  const notListed = covered.filter((id) => !authoritativeById.has(id));
  if (notListed.length > 0) throw new DocumentNotListedError(notListed);

  const existing: any[] = (current.requirements_json && Array.isArray(current.requirements_json.reviewedDocuments))
    ? current.requirements_json.reviewedDocuments : [];

  let reviewedDocuments: any[];
  if (input.mode === 'revoke') {
    const drop = new Set(covered);
    reviewedDocuments = existing.filter((e) => !drop.has(String(e.docId)));
  } else {
    const drop = new Set(covered); // replace any prior entry for the same docId (idempotent re-attest)
    const kept = existing.filter((e) => !drop.has(String(e.docId)));
    const added = covered.map((id) => ({
      docId: id, role: authoritativeById.get(id).role, method: 'manual_upload',
      filename: input.filename ?? null, sha256: input.sha256 ?? null, sizeBytes: input.sizeBytes ?? null,
      reviewedBy: input.reviewerIdentityId, reviewedAt: new Date().toISOString(),
    }));
    reviewedDocuments = [...kept, ...added];
  }

  return forkNewVersion(current, {
    reviewer_identity_id: input.reviewerIdentityId,
    requirements_json: { ...(current.requirements_json || {}), reviewedDocuments },
  });
}

export interface ApproveQualificationInput {
  canonicalOpportunityId: string; biddingEntity: string; expectedVersion: number;
  decision: 'approved_bid_pursuit' | 'rfi_response'; approverIdentityId: string;
  rationale?: string | null; evidence?: any; effortCap?: string | null; reassessmentConditions?: string | null;
}

/**
 * Server-side approval bound to an immutable source snapshot. ORDERED gate — every check runs server-side so a
 * caller hitting the route directly (UI bypass) cannot bind an approval to non-authoritative source:
 *  1. CAS on expectedVersion (stale review -> QualificationConflictError 409).
 *  2. Separation of duties: reviewer may not approve their own pursuit (SelfApprovalError 403).
 *  3. RE-RESOLVE OP detail by canonical id (server-side, never browser-supplied). unavailable/auth_failed/
 *     malformed -> FAIL CLOSED (SourceUnavailableError 503).
 *  4. Present-but-not-approvable: degraded last-known snapshot OR a snapshot the producer never recorded ->
 *     SourceNotApprovableError 409 (renewed review once current; not a blind retry).
 *  5. The HONEST snapshot version (meta) != the reviewed source_snapshot_version -> ChangedSourceError 409.
 *  6. Evidence sufficiency: document coverage + the ESTABLISHED (reviewer-cited) requirements must be sufficient
 *     (EvidenceInsufficientError 422) and carry no blocking requirement (QualificationBlockedError 422). OP's own
 *     requirements[] is always empty, so approval evaluates the reviewer's established set, not OP's.
 *  7. Fork a new approved version, binding the resolved snapshot + HONEST version + the approver identity.
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

  const resolved = await resolveGovOpportunityDetail(input.canonicalOpportunityId);
  if (resolved.state === 'unavailable' || resolved.state === 'auth_failed' || resolved.state === 'malformed') {
    throw new SourceUnavailableError();                                              // fail closed
  }
  if (resolved.state === 'degraded') throw new SourceNotApprovableError('degraded');
  if (resolved.state === 'snapshot_unrecorded' || !resolved.snapshotRecorded) throw new SourceNotApprovableError('snapshot_unrecorded');
  const detail = resolved.detail;
  if (resolved.sourceSnapshotVersion !== current.source_snapshot_version) {
    throw new ChangedSourceError(current.source_snapshot_version ?? null, resolved.sourceSnapshotVersion as number);
  }

  // Effective requirements = the reviewer's ESTABLISHED (cited) set if present, else the source's (always [] for
  // live v2). Coverage AND blocking are both enforced; missing evidence never silently passes.
  const established = (current.requirements_json && current.requirements_json.established) || (detail && detail.requirements) || [];
  // Manually-reviewed authoritative docIds (the reviewer downloaded the Bonfire ZIP by hand) count toward coverage.
  const coverage = evaluateEvidenceCoverage(detail, established, reviewedDocIdsFrom(current));
  if (!coverage.sufficient) throw new EvidenceInsufficientError(coverage.reasons);
  const evaluation = evaluateRequirements(established);
  // PURSUIT (research) bar: block only on true disqualifiers (unknown applicability / un-evidenced dismissal).
  // Un-evidenced submission prerequisites are carried as open items, not blockers — the full bar gates submission.
  if (!evaluation.canApprovePursuit) throw new QualificationBlockedError(evaluation.pursuitBlocking.map((b) => `${b.id}:${b.reason}`));

  return forkNewVersion(current, {
    decision: input.decision, reviewer_identity_id: current.reviewer_identity_id,
    // Bind the approval to the SERVER-resolved snapshot + the HONEST version + the evaluated evidence.
    source_snapshot: detail, source_snapshot_version: resolved.sourceSnapshotVersion, source_available: true,
    requirements_json: { ...(current.requirements_json || {}), source: detail && detail.requirements, established, evaluation, coverage },
    rationale: input.rationale ?? current.rationale,
    // Capture the approver in the immutable evidence, distinct from the reviewer, so the record shows WHO approved.
    evidence_json: { ...(input.evidence ?? current.evidence_json ?? {}), approvedBy: input.approverIdentityId },
    effort_cap: input.effortCap ?? current.effort_cap, reassessment_conditions: input.reassessmentConditions ?? current.reassessment_conditions,
  });
}

export interface ApproveDecoupledQualificationInput {
  gwsKey: string; biddingEntity: string; expectedVersion: number;
  decision: 'approved_bid_pursuit' | 'rfi_response'; approverIdentityId: string;
  rationale?: string | null; reviewedZipSha256?: string | null;
}

/**
 * Pursuit approval for a DECOUPLED (gws) ZIP workspace — the SAME ordered gate as approveGovQualification, but the
 * EVIDENCE is the attested ZIP, not a re-fetched OP snapshot (a decoupled record has none). NEVER calls the OP
 * resolver and NEVER fabricates a source snapshot. Ordered gate:
 *   1. CAS on expectedVersion (a re-attest/re-establish forks a new version → stale → QualificationConflictError 409,
 *      which drives the "Review changes" re-review — this is the primary changed-evidence guard);
 *   2. separation of duties: the reviewer may not approve their own pursuit (SelfApprovalError 403);
 *   3. optional attested-hash check: if the caller passed the ZIP hash it reviewed and it no longer matches →
 *      ChangedSourceError 409 (belt-and-suspenders on top of the CAS);
 *   4. ZIP coverage sufficient — established >=1 AND the ZIP attested — else EvidenceInsufficientError 422;
 *   5. no blocking requirement (evaluateRequirements) else QualificationBlockedError 422;
 *   6. fork an approved version bound to the attested ZIP sha256 + the established set + the approver identity;
 *      source stays null (source_available:false) — honest, no OP snapshot invented.
 * Authorizes RESEARCH only — a build still needs a SEPARATE (held) build authorization.
 */
export async function approveDecoupledQualification(input: ApproveDecoupledQualificationInput): Promise<any> {
  if (!APPROVAL_DECISIONS.includes(input.decision)) throw new Error('approveDecoupledQualification only records approval decisions');
  const current = await loadCurrent(input.gwsKey, input.biddingEntity);
  if (!current) throw new QualificationNotFoundError();
  if (current.version !== input.expectedVersion) throw new QualificationConflictError(current.version);
  if (input.approverIdentityId && current.reviewer_identity_id && input.approverIdentityId === current.reviewer_identity_id) {
    throw new SelfApprovalError();
  }
  const established = (current.requirements_json && current.requirements_json.established) || [];
  const reviewedDocuments = (current.requirements_json && current.requirements_json.reviewedDocuments) || [];
  const zip = (Array.isArray(reviewedDocuments) ? reviewedDocuments : []).find((d: any) => d && d.method === 'solicitation_zip' && d.sha256) || null;
  if (input.reviewedZipSha256 && zip && input.reviewedZipSha256 !== zip.sha256) {
    throw new ChangedSourceError(null, 0); // the attested ZIP changed after review — renewed review required
  }
  const coverage = evaluateZipCoverage(established, reviewedDocuments);
  if (!coverage.sufficient) throw new EvidenceInsufficientError(coverage.reasons);
  const evaluation = evaluateRequirements(established);
  // PURSUIT (research) bar: disqualifiers only. Un-evidenced submission prerequisites are open items, not blockers.
  if (!evaluation.canApprovePursuit) throw new QualificationBlockedError(evaluation.pursuitBlocking.map((b) => `${b.id}:${b.reason}`));
  return forkNewVersion(current, {
    decision: input.decision, reviewer_identity_id: current.reviewer_identity_id,
    source_snapshot: null, source_snapshot_version: null, source_available: false, // decoupled: no OP snapshot invented
    requirements_json: { ...(current.requirements_json || {}), established, evaluation, coverage },
    rationale: input.rationale ?? current.rationale,
    evidence_json: { ...(current.evidence_json ?? {}), approvedBy: input.approverIdentityId, attestedZipSha256: zip ? zip.sha256 : null },
  });
}
