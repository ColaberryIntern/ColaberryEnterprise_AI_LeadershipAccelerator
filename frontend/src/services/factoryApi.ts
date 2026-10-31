/**
 * factoryApi — the Command Center's data access. Thin typed wrappers over the shared axios `api`
 * client (which attaches the admin_token and bounces to /admin/login on 401). The view-model types
 * mirror the backend's factoryProjectView output + the route's approval envelope; kept here because
 * the frontend cannot import backend types across the workspace boundary.
 */
import api from '../utils/api';

export interface GateCheck { code: string; label: string; ok: boolean; }
export interface CcTrack {
  trackType: string;
  status: string;
  owner: string | null;
  requirementIds: string[];
  linkedStudentProjectId: string | null;
}
export interface CcFlowNode {
  id: string;
  title: string;
  kind: 'START' | 'TASK' | 'DECISION' | 'END';
  executorType: string | null;
  performerRole: string | null;
  accountableRole: string | null;
  method: string;
  confidence: number | null;
  sourceEvidence: string[];
}
export interface CcFlowEdge { from: string; to: string; condition: string | null; isRework: boolean; }
export interface CcAllocation {
  taskId: string;
  taskTitle: string;
  executionClass: string;
  performer: string | null;
  accountable: string | null;
  rationale: string;
}
export interface CcRole {
  roleId: string;
  name: string;
  definition: string;
  executorType: string | null;
  isAgent: boolean;
  accountableHuman: string | null;
}
export interface CcRequirement {
  id: string;
  statement: string;
  kind: string;
  priority: string;
  evidenceState: string;
  tracks: string[];
  citedBy: string[];
}
export interface CcRoleMap { previousFunction: string; aiContribution: string; newRole: string; retained: string[]; }

export interface FactoryApprovalInfo {
  status: string;
  level: string | null;
  version: number;
  trackType: string;
  enrichmentStatus: string | null;
  contentHash: string | null;
}

export interface FactoryCommandCenterView {
  deliveryProjectId: string;
  contractName: string;
  isSample: boolean;
  gate: { ok: boolean; errorCount: number; checks: GateCheck[] };
  process: { id: string; businessOutcome: string; successCriterion: string } | null;
  tracks: CcTrack[];
  flow: { nodes: CcFlowNode[]; edges: CcFlowEdge[] };
  allocation: CcAllocation[];
  roster: CcRole[];
  compliance: CcRequirement[];
  roleMap: CcRoleMap[];
  workforce: { people: number; agents: number };
  approval: FactoryApprovalInfo | null;
}

/** The day-one fixture (the Phase-1 sample), always available. */
export async function getFactorySample(): Promise<FactoryCommandCenterView> {
  const { data } = await api.get<FactoryCommandCenterView>('/api/admin/factory/sample');
  return data;
}

/** A real delivery contract's decomposition; rejects (404) until one has been generated. */
export async function getFactoryContract(deliveryProjectId: string): Promise<FactoryCommandCenterView> {
  const { data } = await api.get<FactoryCommandCenterView>(`/api/admin/factory/contract/${encodeURIComponent(deliveryProjectId)}`);
  return data;
}

// ── Phase 4 write actions ────────────────────────────────────────────────────
export interface FactoryContractListItem {
  deliveryProjectId: string;
  name: string | null;
  trackType: string;
  status: string;
  version: number;
}
export interface ApproveContractBody {
  trackType: string;
  expectedVersion: number;
  level: 'documented' | 'full';
  enrichmentStatus: 'pending' | 'partial' | 'resolved';
}
export interface RequestChangesBody { trackType: string; reviewedVersion: number; reason: string; }
export interface ApprovalResult { id: string; version: number; status: string; approval_level: string; approved_at: string; }

/** Delivery contracts that have a persisted decomposition, so the page can default to a real one. */
export async function listFactoryContracts(): Promise<FactoryContractListItem[]> {
  const { data } = await api.get<{ contracts: FactoryContractListItem[] }>('/api/admin/factory/contracts');
  return data.contracts;
}

/** Approve a contract's decomposition (transactional, gate-checked, CAS-guarded). */
export async function approveFactoryContract(deliveryProjectId: string, body: ApproveContractBody): Promise<ApprovalResult> {
  const { data } = await api.post<ApprovalResult>(`/api/admin/factory/contract/${encodeURIComponent(deliveryProjectId)}/approve`, body);
  return data;
}

/** Record a "request changes" review against the version the reviewer looked at. */
export async function requestFactoryChanges(deliveryProjectId: string, body: RequestChangesBody): Promise<{ id: string; decision: string }> {
  const { data } = await api.post<{ id: string; decision: string }>(`/api/admin/factory/contract/${encodeURIComponent(deliveryProjectId)}/request-changes`, body);
  return data;
}

// ── Gov-entry (Phase 5 slice 1; qualification Phase 1) ───────────────────────
export type PursuitStatus = 'none' | 'pursuing' | 'submitted' | 'declined';
export interface VetVerdict {
  status?: string | null;
  label?: string | null;
  reason?: string | null;
  disqualifier?: string | null;
  /** 'title_regex' is weak evidence; 'document_deep_vet' | 'manual' | 'auto_signal'. */
  method?: string | null;
  /** null => asserted without evidence. */
  evidence?: string | null;
}
export type ValueBasis = 'published_ceiling' | 'estimated' | 'unverified';
export interface GovOpportunity {
  uuid: string;
  /** Stable upstream source id when provided (may be a title-derived alias, not a canonical key). */
  externalId?: string | null;
  title: string;
  agency: string;
  /** Display date (YYYY-MM-DD). */
  closeDate: string | null;
  /** Full source close timestamp — verify against the portal (OP flagged a tz-stripping parser). */
  closeAt?: string | null;
  fitScore: number | null;
  priorityScore?: number | null;
  estimatedValue: number | null;
  /** Provenance of estimatedValue; absent/'unverified' => show "Value unverified", never forecast revenue. */
  valueBasis?: ValueBasis | null;
  category?: string | null;
  sourceUrl: string | null;
  /** Full pursuit status; 'declined' stays distinct from 'none'. */
  pursuitStatus?: PursuitStatus | null;
  pursued?: boolean;
  /** OP's vetting verdict object, or null when present-but-unassessed. */
  vetVerdict?: VetVerdict | null;
  /** true => the verdict field was returned (even if null); false => absent. null verdict = unassessed. */
  vetVerdictPresent?: boolean;
  freshness?: { enrichedAt: string | null; attachmentsFetchedAt: string | null } | null;
  /**
   * OP's PRELIMINARY, UNVERIFIED project blurb (from overview/strategy), display-only in the Details popup. Shown
   * labeled "preliminary, unverified — not confirmed requirements"; NEVER a requirement. null when none supplied.
   */
  preliminarySummary?: string | null;
  /** Where this opportunity sits on the qualification/approval ladder, joined server-side by canonical 'gws:'+uuid.
   *  Absent/null => not yet qualified (read as not_vetted). */
  vetting?: OpportunityVetting | null;
}
export type VettingStage = 'not_vetted' | 'in_review' | 'needs_requirements' | 'awaiting_approval' | 'rfi' | 'vetted' | 'no_bid';
export interface OpportunityVetting { stage: VettingStage; decision: string | null; approvalStatus: string | null; }
export type SnapshotReason = 'not_configured' | 'source_failed';
export interface GovOpportunityFeed {
  opportunities: GovOpportunity[];
  /** 'live' = pulled from Opportunity Pulse; 'snapshot' = the labeled in-app fallback. */
  source: 'live' | 'snapshot';
  snapshotDate: string | null;
  /** When snapshot: 'not_configured' (dark) vs 'source_failed' (configured feed that errored). */
  snapshotReason?: SnapshotReason | null;
  /** How many the source reported in total (best-fit caps ~50); null when unknown. Used for "showing N of M". */
  totalAvailable?: number | null;
  /** How many returned rows were hidden by active team dismissals this request; 0 if none. */
  dismissedCount?: number | null;
}
export interface StartOpportunityResult { deliveryProjectId: string; created: boolean; }

/** The discovered government candidates (live from Opportunity Pulse, or the labeled snapshot). */
export async function listGovOpportunities(): Promise<GovOpportunityFeed> {
  const { data } = await api.get<GovOpportunityFeed>('/api/admin/factory/opportunities');
  return data;
}

/** One discovery opportunity's display details (the Details-popup data) for the decoupled Qualify workspace, so it
 *  can show why-it-surfaced + the project overview + the Source link without going back. 404 (aged out of the feed,
 *  or feed degraded dark) → { opportunity: null } so the caller renders an honest empty state instead of throwing. */
export async function getGovOpportunityDetail(uuid: string): Promise<{ opportunity: GovOpportunity | null; source: 'live' | 'snapshot'; snapshotDate: string | null; snapshotReason?: SnapshotReason | null }> {
  try {
    const { data } = await api.get(`/api/admin/factory/opportunities/${encodeURIComponent(uuid)}`);
    return data;
  } catch (err: any) {
    if (err?.response?.status === 404) return { opportunity: null, source: 'snapshot', snapshotDate: null };
    throw err;
  }
}

/** A persisted team dismissal row (one per tenant+opportunity). restoredAt null => active (hidden). */
export interface GovOpportunityDismissal {
  opportunity_key: string;
  title?: string | null;
  agency?: string | null;
  reason?: string | null;
  dismissed_by?: string | null;
  dismissed_at?: string | null;
  restored_at?: string | null;
}

/** Hide a discovered candidate from the WHOLE team's feed (reversible). Idempotent; keyed on OP's stable uuid. */
export async function dismissGovOpportunity(
  key: string,
  body: { reason?: string; title?: string; agency?: string } = {},
): Promise<{ dismissed: GovOpportunityDismissal }> {
  const { data } = await api.post<{ dismissed: GovOpportunityDismissal }>(
    `/api/admin/factory/opportunities/${encodeURIComponent(key)}/dismiss`, body,
  );
  return data;
}

/** Un-hide a previously dismissed candidate (recovery). Idempotent. */
export async function restoreGovOpportunity(key: string): Promise<{ restored: GovOpportunityDismissal | null }> {
  const { data } = await api.post<{ restored: GovOpportunityDismissal | null }>(
    `/api/admin/factory/opportunities/${encodeURIComponent(key)}/restore`, {},
  );
  return data;
}

// ── Our Services catalog ─────────────────────────────────────────────────────
/** A Colaberry service offering — the catalog an opportunity is later matched against. Retired, never deleted. */
export interface ServiceOffering {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  keywords?: string[];
  naicsCodes?: string[];
  pscCodes?: string[];
  pastPerformance?: string | null;
  owner?: string | null;
  /** 'growth' = in development; excluded from fit matching, kept in reporting (P3). */
  status: 'active' | 'growth' | 'retired';
  createdBy?: string | null;
  createdAt?: string;
  updatedAt?: string;
}
/** The editable fields of a service offering (what the add/edit form submits). */
export interface ServiceOfferingInput {
  name: string;
  description?: string;
  category?: string;
  keywords?: string[];
  naicsCodes?: string[];
  pscCodes?: string[];
  pastPerformance?: string;
  owner?: string;
  /** Create as 'growth' (in development) instead of the default 'active'. */
  status?: 'active' | 'growth';
}

/** List the team's service offerings (active by default, or growth only, or every status). */
export async function listServiceOfferings(status: 'active' | 'growth' | 'all' = 'active'): Promise<ServiceOffering[]> {
  const { data } = await api.get<{ services: ServiceOffering[] }>(`/api/admin/factory/services?status=${status}`);
  return data.services;
}

/** Add a service offering. */
export async function createServiceOffering(body: ServiceOfferingInput): Promise<ServiceOffering> {
  const { data } = await api.post<{ service: ServiceOffering }>('/api/admin/factory/services', body);
  return data.service;
}

/** Edit a service offering. */
export async function updateServiceOffering(id: string, patch: Partial<ServiceOfferingInput>): Promise<ServiceOffering> {
  const { data } = await api.patch<{ service: ServiceOffering }>(`/api/admin/factory/services/${encodeURIComponent(id)}`, patch);
  return data.service;
}

/** Soft-retire a service offering (status flip; reversible by editing it back to active is not exposed — retire is one-way in the UI). */
export async function retireServiceOffering(id: string): Promise<ServiceOffering> {
  const { data } = await api.post<{ service: ServiceOffering }>(`/api/admin/factory/services/${encodeURIComponent(id)}/retire`, {});
  return data.service;
}

/** Flip a service to 'growth' (in development; excluded from fit matching, kept in reporting). Idempotent. */
export async function markGrowthServiceOffering(id: string): Promise<ServiceOffering> {
  const { data } = await api.post<{ service: ServiceOffering }>(`/api/admin/factory/services/${encodeURIComponent(id)}/growth`, {});
  return data.service;
}

// ── Opportunity → services matcher (advisory, deterministic) ─────────────────
export type MatchStrength = 'strong' | 'moderate' | 'weak';
/** A suggested service for an opportunity. ADVISORY ("suggested — confirm"), never a verified fit; the reason names the overlap. */
export interface ServiceMatch {
  id: string;
  name: string;
  category: string | null;
  score: number;
  strength: MatchStrength;
  reason: string;
  matchedKeywords: string[];
  categoryMatched: boolean;
  matchedNaics: string[];
}
export interface MatchSignals {
  category?: string | null;
  title?: string | null;
  summary?: string | null;
  requirements?: string[];
  naics?: string[];
}
/** Suggested services for an opportunity, ranked. Advisory only — writes nothing, gates nothing. */
export async function matchServicesToOpportunity(signals: MatchSignals): Promise<{ matches: ServiceMatch[]; catalogSize: number }> {
  const { data } = await api.post<{ matches: ServiceMatch[]; catalogSize: number }>('/api/admin/factory/opportunities/match', signals);
  return data;
}

// ── Step 3 "Fit": capability assessment vs Our Services (advisory) ────────────
export type FitAssessment = 'have' | 'partial' | 'new';
/** A capability the scope needs, assessed against the active service catalog. Advisory; matchedServiceId is a real id or null. */
export interface CapabilityItem {
  id: string;
  name: string;
  why: string;
  assessment: FitAssessment;
  matchedServiceId: string | null;
  rationale: string;
  whatItIs?: string;
  whatThisBidGivesUs?: string;
  toDeliver?: string;
}
export interface CapabilityFitResult { capabilities: CapabilityItem[]; cached: boolean; generatedAt: string; error?: string }

/** ADVISORY: derive the capabilities the scope needs and assess each against the ACTIVE catalog (have/partial/new).
 *  Growth services are excluded. Fails soft server-side (no key / upstream → the service returns an error). */
export async function assessCapabilityFit(
  canonicalOpportunityId: string,
  body: { requirements: { id: string; text: string }[]; title?: string | null; buyer?: string | null },
): Promise<CapabilityFitResult> {
  const { data } = await api.post<CapabilityFitResult>(qUrl(canonicalOpportunityId, '/capability-fit'), body);
  return data;
}

/** The reviewer's Step 3 decisions, persisted on the record (advisory; sets no gate). */
export interface CapabilityDecision {
  id: string;
  name: string;
  assessment: FitAssessment;
  matchedServiceId: string | null;
  action?: 'none' | 'updated_service' | 'added_growth' | 'find_partner';
}
export interface CapabilityDecisionsPayload {
  decisions: CapabilityDecision[];
  /** ids of ticked eligibility GapItems. */
  eligibilityResolved: string[];
  savedAt: string;
}

/** Persist the Step 3 capability decisions (requirements_json.capabilities). Returns the forked qualification. */
export async function recordCapabilityDecisions(
  canonicalOpportunityId: string,
  body: { biddingEntity: string; expectedVersion: number; capabilities: CapabilityDecisionsPayload },
): Promise<{ qualification: unknown }> {
  const { data } = await api.post<{ qualification: unknown }>(qUrl(canonicalOpportunityId, '/capability-decisions'), body);
  return data;
}

/** Mark the pursuit software vs services (requirements_json.pursuitKind). 'services' = a consulting bid with no
 *  software to build -> proposal track only + the Build machinery hidden. Returns the forked qualification. */
export async function setGovPursuitKind(
  canonicalOpportunityId: string,
  body: { biddingEntity: string; expectedVersion: number; pursuitKind: 'software' | 'services' },
): Promise<{ qualification: unknown }> {
  const { data } = await api.post<{ qualification: unknown }>(qUrl(canonicalOpportunityId, '/pursuit-kind'), body);
  return data;
}

/**
 * Phase 1: reachability of an EXISTING gov project only. New pursuits now require qualification, so the server
 * returns 409 { qualificationRequired } and creates nothing; the entry page no longer offers a create action.
 */
export async function startGovOpportunity(uuid: string, body: { title?: string; agency?: string } = {}): Promise<StartOpportunityResult> {
  const { data } = await api.post<StartOpportunityResult>(`/api/admin/factory/opportunities/${encodeURIComponent(uuid)}/start`, body);
  return data;
}

export interface IngestProposalResult { requirements: number; blocks: number; fileName: string; }

/** Upload a solicitation .zip; the factory extracts source-cited requirements and replaces the shell. */
export async function ingestProposal(deliveryProjectId: string, file: File): Promise<IngestProposalResult> {
  const form = new FormData();
  form.append('proposal', file);
  const { data } = await api.post<IngestProposalResult>(
    `/api/admin/factory/contract/${encodeURIComponent(deliveryProjectId)}/ingest-proposal`, form,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return data;
}

export interface GenerateDecompositionResult { accepted: boolean; errorCount: number; }

/** Run the generation engine on the contract's requirements -> a task graph (approvable when gate-clean). */
export async function generateDecomposition(deliveryProjectId: string): Promise<GenerateDecompositionResult> {
  const { data } = await api.post<GenerateDecompositionResult>(
    `/api/admin/factory/contract/${encodeURIComponent(deliveryProjectId)}/generate`, {});
  return data;
}

// ── Gov Qualification Workspace (Phase 2) ────────────────────────────────────
/** One evaluated requirement: the server decides whether it BLOCKS a bid pursuit (missing evidence never passes). */
export interface QualRequirementEval { id: string; dueStage: string; applicability: string; blocking: boolean; reason: string | null; }
export interface QualRequirementsEvaluation {
  evals: QualRequirementEval[];
  blocking: QualRequirementEval[];
  /** Disqualifiers that block a PURSUIT decision (unknown applicability / un-evidenced dismissal). */
  pursuitBlocking?: QualRequirementEval[];
  /** Applicable submission requirements still needing evidence — block SUBMISSION, not the pursuit. */
  openSubmissionRequirements?: QualRequirementEval[];
  deliveryObligations: QualRequirementEval[];
  byDueStage: Record<string, QualRequirementEval[]>;
  /** Submission-ready bar (every requirement evidenced). */
  canApproveBid: boolean;
  /** Pursuit/research bar — no disqualifier (un-evidenced submission prerequisites are expected here). */
  canApprovePursuit?: boolean;
}
/** The server-authoritative source detail (a gov-opportunity.v1 subset). Advisory-only fields (legacy fit,
 *  legacyVerdict) are shown labeled as advisory — the qualification depends on evidence, not on OP's verdict. */
export interface QualSourceDetail {
  canonicalOpportunityId: string;
  sourceSnapshotVersion: number;
  isFixture?: boolean;
  notice: { noticeType: { value: string; isBindingSolicitation: boolean }; procurementType: { value: string }; contractVehicle: string | null };
  publisher: { leadBuyer: { name: string; jurisdiction: string }; officialSourceUrl: string | null };
  deadline: { originalText: string | null; utc: string | null; utcConfidence: string; conflicts: Array<{ originalText: string; utc: string | null; source: string }> };
  value: { published: { amountMinorUnits: number | null; currency: string; valueType: string } | null; modelEstimate: { amountMinorUnits: number | null; currency: string; notForRevenuePlanning: boolean } | null };
  documents: { coverage: string; counts: { listed: number; downloaded: number; parsed: number; inaccessible: number }; items?: Array<{ docId: string; filename: string; role: string; retrieval: { status: string } }> };
  requirements: Array<{ id: string; text: string; category: string; applicability: string; responsibleParty: string; dueStage: string; bindingStatus: string; evidenceRef?: { docId: string } | null }>;
  sourceAssessment: { legacyVerdict: { status: string | null; method: string | null; evidence: string | null } | null };
  legacy: { fitScore: number | null; priorityScore: number | null; pursuitStatus: string | null };
}
export interface QualEvidenceCoverage { sufficient: boolean; reasons: string[]; }
export interface ReviewedDocument { docId: string; role: string; method: string; filename: string | null; sha256: string | null; reviewedBy: string | null; reviewedAt: string | null; }
/** P4 Decide: the establisher's brief for the approver. ADVISORY (sets no gate); an opaque bag the UI owns. */
export interface GovDecisionBrief {
  proposedDecision?: 'approved_bid_pursuit' | 'rfi_response' | 'no_bid' | 'needs_evidence';
  summary?: string;
  rationale?: string;
  [k: string]: unknown;
}
/** P4 Decide: the request/approve/send-back state machine (advisory; the real gate is approveGovQualification). */
export interface GovApprovalState {
  status: 'requested' | 'sent_back';
  requestedBy?: string;
  approverIdentityId?: string;
  requestedAt?: string;
  sentBackBy?: string;
  sentBackNote?: string | null;
  sentBackAt?: string;
}
export interface QualificationRecord {
  id: string; bidding_entity: string; decision: string; version: number;
  rationale: string | null; source_snapshot_version: number | null; reviewer_identity_id: string | null;
  requirements_json?: {
    established?: EstablishedRequirement[]; reviewedDocuments?: ReviewedDocument[];
    approval?: GovApprovalState | null; decisionBrief?: GovDecisionBrief | null;
    /** The Step 3 Fit decisions, persisted here (advisory). */
    capabilities?: CapabilityDecisionsPayload | null;
  } | null;
}
/** The resolved, honest source state (mirrors the server gate). */
export type QualSourceState = 'available' | 'degraded' | 'snapshot_unrecorded' | 'unavailable' | 'auth_failed' | 'malformed' | 'zip_workspace';
export interface GovQualificationWorkspace {
  canonicalOpportunityId: string;
  /** false today: OP's live v2 detail endpoint is not wired, so the source is a labeled fixture. */
  sourceLive: boolean;
  sourceState: QualSourceState;
  sourceStateLabel: string;
  sourceAvailable: boolean;
  sourceSnapshotVersion: number | null;
  snapshotRecorded: boolean;
  source: QualSourceDetail | null;
  evaluation: QualRequirementsEvaluation | null;
  coverage: QualEvidenceCoverage | null;
  qualification: QualificationRecord | null;
  changedSource: boolean;
  /** Daily-tracking (decoupled): ISO timestamp of the last sync run that saw this opportunity, or null. */
  lastSyncedAt?: string | null;
  /** Daily-tracking (decoupled): the last flagged change (deadline moved / dropped from feed), or null. */
  syncChange?: { kind: string; detail: string } | null;
  /** Server's verdict on whether an approval is currently permitted (source approvable + current + covered + unblocked). */
  canApprove: boolean;
  /** Decoupled (discovery-ZIP) workspace only: the clicked discovery row's title/agency (display). Null on the canonical path. */
  provenance?: { title: string | null; agency: string | null } | null;
  /** Decoupled workspace only: the attested solicitation ZIP (evidence of record), or null if not yet attested. */
  zipAttestation?: { sha256: string | null; filename: string | null; reviewedBy: string | null; reviewedAt: string | null } | null;
  /** Decoupled workspace only: opportunity dossier parsed from the ZIP at attest (contacts/meetings/key-dates/NAICS).
   *  "Detected — verify", never authoritative; reference info that gates nothing. Null until a ZIP is attested. */
  dossier?: GovDossier | null;
  /** Advisory "have we pursued this agency before?" — prior active qualifications for the same agency. Suggestion,
   *  never authoritative (agency names are free text); gates nothing. Null when the lookup is unavailable. */
  relationship?: GovRelationship | null;
  /** The proposal response checklist — one cited slot per established requirement the bid must answer. Each slot
   *  is read-only `unanswered` today (authoring is a later phase); the citation anchor is the requirement's own
   *  evidence doc reference. Mirrors the backend `deriveResponseSlots`. */
  responseSlots?: GovResponseSlot[];
  /** The Build-track plan (releases → stories → prompts) for the solution_build requirements. Mirrors the
   *  backend `deriveGovBuildPlan`; absent on older records / when no build requirements exist. */
  build?: GovBuildPlan;
  /** software vs services. 'services' (a consulting bid) has no software to build: the delivery project got a
   *  proposal track only and the Build machinery is hidden. Defaults to 'software'. */
  pursuitKind?: 'software' | 'services';
  /** The dates/messages/amendment inbox (P4). An amendment's `affects` invalidates affected responses. */
  amendments?: GovProposalAmendment[];
  /** The submission + outcome state (P5). */
  submission?: GovSubmission | null;
  /** Whether the proposal is ready to export/submit (all responses approved + covered + nothing blocking). */
  submissionReadiness?: GovSubmissionReadiness;
}

/** Whether the proposal can be exported/submitted, with the blocking reasons when not. */
export interface GovSubmissionReadiness { ready: boolean; blocking: string[]; warnings?: string[] }

/** The submission + outcome state for a gov project (P5). Candidates are PRIVATE and never published. */
export interface GovSubmission {
  status: 'preparing' | 'needs_review' | 'ready' | 'exported' | 'externally_submitted' | 'acknowledged';
  outcome: 'pending' | 'won' | 'lost' | 'withdrawn' | 'no_bid' | 'unknown';
  exportManifest: { exportedAt: string; projectName: string; responseCount: number; items: any[] } | null;
  exportedAt: string | null;
  externalRef: string | null;
  externallySubmittedAt: string | null;
  acknowledgedRef: string | null;
  acknowledgedAt: string | null;
  outcomeNote: string | null;
  outcomeRecordedAt: string | null;
  caseStudyCandidate: any | null;
  serviceCapabilityCandidate: any | null;
}

/** A figure attached to a proposal response, bound to the git commit it was captured at (provenance). */
export interface GovResponseFigure { commit: string; ref: string; caption: string }

/** One line of the proposal response checklist — cites the requirement it answers; carries the authored response. */
/** P5 Draft-with-AI: a gap the draft could not ground. A `filler` resolution blocks export server-side. */
export interface GovResponseGap {
  id: string;
  question: string;
  suggestions: string[];
  resolution: 'open' | 'answered' | 'filler';
  answer?: string;
}

export interface GovResponseSlot {
  requirementId: string;
  statement: string;
  sourceRef: string | null;
  /** `unanswered` until authored; then the response's lifecycle. `filler` (P5) blocks export. */
  status: 'unanswered' | 'draft' | 'reviewed' | 'approved' | 'revision_required' | 'filler';
  /** Which of the 8 submittal categories this response belongs to (groups the flat checklist into <=10). Optional
   *  for resilience against older payloads; the UI defaults a missing bucket to `technical`. */
  bucket?: 'admin' | 'certs' | 'technical' | 'management' | 'experience' | 'price' | 'financial' | 'socioeconomic';
  /** True when the requirement's own text says missing it REJECTS the bid (non-responsive / disqualified /
   *  pass-fail). Advisory flag the UI pins/badges; never gates export. */
  eliminationRisk?: boolean;
  content?: string;
  figures?: GovResponseFigure[];
  /** P5 Draft-with-AI gaps on this response; a `filler` gap blocks export. */
  gaps?: GovResponseGap[];
  authoredByIdentityId?: string | null;
  reviewedByIdentityId?: string | null;
  updatedAt?: string | null;
}

/** One entry in the dates/messages/amendment inbox. `amendment` with `affects` invalidates; `message` is context. */
export interface GovProposalAmendment {
  id: string;
  amendmentKey: string;
  kind: 'amendment' | 'message';
  summary: string;
  affects: string[];
  provenance: string | null;
  observedAt: string | null;
  invalidatedCount: number;
  createdAt: string | null;
}

/** One Build-track story — a solution_build requirement turned into buildable work, citing the requirement. */
export interface GovBuildStory {
  id: string;
  requirementId: string;
  title: string;
  statement: string;
  release: string;
  acceptance: string[];
  /** Derived `unassigned`; a persisted assignment overlay (admin) moves it to `assigned`. Never a fabricated built state. */
  status: 'unassigned' | 'assigned';
  /** The assignee's identity id — present only on the ADMIN workspace (the student view never carries it). */
  assigneeIdentityId?: string | null;
  assignedAt?: string | null;
  /** True when the story's requirement left the established set but it still carries assignment/evidence — preserved. */
  orphaned?: boolean;
  /** The student's Claude Code prompt for this story (deterministic, cites the requirement). */
  prompt?: string;
}
export interface GovBuildRelease { key: string; name: string; storyIds: string[] }
/** A delivery-project member a story can be assigned to (holds story.execute). Admin picker source. */
export interface GovAssignableBuilder { identityId: string; email: string | null; roles: string[] }
/** The Build-track plan: releases → stories → prompts, a deterministic projection of solution_build requirements. */
export interface GovBuildPlan {
  releases: GovBuildRelease[];
  stories: GovBuildStory[];
  buildStoryCount: number;
  /** Stories whose requirement left the established set but which carry persisted work — surfaced, never dropped. */
  orphanedStories?: GovBuildStory[];
  /** The delivery project this plan was approved into, or null before approval (assignment needs it). */
  deliveryProjectId?: string | null;
  /** The builders a story can be assigned to (admin workspace only; empty before approval). */
  assignableBuilders?: GovAssignableBuilder[];
}

/** A procurement code detected in the ZIP, tagged with its code SYSTEM (never assume NAICS). */
export interface GovDossierCode { system: 'naics' | 'nigp'; code: string; sourceDocument: string }

/** A detected meeting / key-date line. `time`/`timezone` are only present when literally stated — a non-null
 *  `time` with a null `timezone` means the deadline's zone was NOT stated and must be verified (a missed-by-zone
 *  deadline loses the bid). Never inferred. */
export interface GovDossierLine { text: string; date: string | null; time?: string | null; timezone?: string | null; sourceDocument: string }

/** A submission-mechanics obligation stated in the solicitation body (not on the response checklist): a required
 *  separate cost file, a required redacted copy, or a stated offer-validity period. Each cites a literal quote. */
export type GovComplianceRuleKind = 'separate_cost_file' | 'redacted_copy' | 'validity_period';
export interface GovComplianceRule { kind: GovComplianceRuleKind; quote: string; days?: number }

/** How the solicitation is scored — detected from the evaluation section. Advisory, source-cited. */
export type GovAwardBasis = 'lpta' | 'trade_off' | 'best_value' | 'qualifications' | 'low_price';
export interface GovEvaluationFactor { label: string; points?: number; percent?: number; quote: string }
export interface GovEvaluationCriteria {
  basis: GovAwardBasis | null;
  basisQuote: string | null;
  totalPoints: number | null;
  factors: GovEvaluationFactor[];
}

/** An opportunity dossier detected from the solicitation ZIP — deterministic, source-cited, "detected — verify". */
export interface GovDossier {
  contacts: { kind: 'email' | 'phone'; value: string; sourceDocument: string }[];
  /** Legacy bare NAICS strings, retained for compat; `codes` is the forward, system-tagged model. */
  naics: string[];
  /** Every detected procurement code, each tagged with its system (naics | nigp). May be absent on older records. */
  codes?: GovDossierCode[];
  meetings: GovDossierLine[];
  keyDates: GovDossierLine[];
  /** Submission-mechanics rules detected in the solicitation body. Absent on records extracted before this shipped. */
  complianceRules?: GovComplianceRule[];
  /** How the solicitation is scored (award basis, weighted factors, total points). Absent/null when not detected. */
  evaluation?: GovEvaluationCriteria | null;
}

/** Prior pursuits of the same agency — advisory "possible prior work — verify". */
export interface GovRelationship {
  agency: string | null;
  priorCount: number;
  pursuits: { canonicalOpportunityId: string; title: string | null; agency: string | null; decision: string; date: string | null }[];
}

/** A reviewer-established, cited applicable requirement (same shape the server coverage/blocking gate evaluates). */
export interface EstablishedRequirement {
  id: string; text: string; category?: string;
  /** Downstream tracks. Only a `scope` item carries `solution_build` (becomes a build story); others are ['proposal']. */
  tracks?: string[];
  applicability: 'always' | 'conditional' | 'not_applicable' | 'unknown';
  applicabilityEvidenceRef?: { docId: string } | null;
  responsibleParty?: string;
  dueStage: 'submission' | 'award' | 'delivery' | 'unknown';
  bindingStatus: string;
  evidenceRef?: { docId: string } | null;
}

/** The read-only qualification workspace for one opportunity (source facts + requirement evaluation + record). */
export async function getGovQualificationWorkspace(canonicalOpportunityId: string, biddingEntity?: string): Promise<GovQualificationWorkspace> {
  const q = biddingEntity ? `?biddingEntity=${encodeURIComponent(biddingEntity)}` : '';
  const { data } = await api.get<GovQualificationWorkspace>(`/api/admin/factory/qualification/${encodeURIComponent(canonicalOpportunityId)}${q}`);
  return data;
}

const qUrl = (canonicalOpportunityId: string, suffix = ''): string =>
  `/api/admin/factory/qualification/${encodeURIComponent(canonicalOpportunityId)}${suffix}`;

/** Open (create) a pending_review qualification. Canonical path: bound to the re-fetched source snapshot. Decoupled
 *  (gws) path: bound to no snapshot; `from`/`agency` carry the clicked discovery row's provenance. Idempotent. */
export async function createGovQualification(canonicalOpportunityId: string, body: { biddingEntity: string; deliveryProjectId?: string; from?: string; agency?: string }): Promise<{ qualification: QualificationRecord }> {
  const { data } = await api.post(qUrl(canonicalOpportunityId), body);
  return data;
}

/** Assign a Build story to a project builder (P3-T2). The server requires the assignee to hold story.execute on
 *  the resolved delivery project (422 otherwise), and 404s if the opportunity has no project yet. Idempotent. */
export async function assignGovBuildStory(canonicalOpportunityId: string, storyId: string, assigneeIdentityId: string): Promise<GovBuildStory & { assigneeIdentityId: string }> {
  const { data } = await api.post(qUrl(canonicalOpportunityId, `/build-stories/${encodeURIComponent(storyId)}/assign`), { assigneeIdentityId });
  return data;
}

/** Remove a Build story's assignment (back to unassigned). Idempotent. */
export async function unassignGovBuildStory(canonicalOpportunityId: string, storyId: string): Promise<{ ok: true; removed: number }> {
  const { data } = await api.delete(qUrl(canonicalOpportunityId, `/build-stories/${encodeURIComponent(storyId)}/assign`));
  return data;
}

const rUrl = (canonicalOpportunityId: string, requirementId: string, suffix = ''): string =>
  qUrl(canonicalOpportunityId, `/responses/${encodeURIComponent(requirementId)}${suffix}`);

/** Author/edit the proposal response for one requirement. Any edit resets its status to `draft` (server-side). */
export async function saveGovProposalResponse(canonicalOpportunityId: string, requirementId: string, content: string): Promise<GovResponseSlot> {
  const { data } = await api.post(rUrl(canonicalOpportunityId, requirementId), { content });
  return data;
}

/** Advance the response lifecycle. The server enforces the order (no draft→approved jump); 409 on an illegal step. */
export async function reviewGovProposalResponse(canonicalOpportunityId: string, requirementId: string, decision: 'reviewed' | 'approved' | 'revision_required'): Promise<GovResponseSlot> {
  const { data } = await api.post(rUrl(canonicalOpportunityId, requirementId, '/review'), { decision });
  return data;
}

/** Attach a commit-bound figure to a response. The server refuses a figure with no commit (422). */
export async function addGovProposalFigure(canonicalOpportunityId: string, requirementId: string, figure: GovResponseFigure): Promise<GovResponseSlot> {
  const { data } = await api.post(rUrl(canonicalOpportunityId, requirementId, '/figures'), figure);
  return data;
}

/** Remove a figure by its ref. */
export async function removeGovProposalFigure(canonicalOpportunityId: string, requirementId: string, ref: string): Promise<GovResponseSlot> {
  const { data } = await api.delete(rUrl(canonicalOpportunityId, requirementId, `/figures?ref=${encodeURIComponent(ref)}`));
  return data;
}

/** P5: persist a Draft-with-AI result (content + typed gaps). Lands as `draft`; a filler gap marks it `filler`. */
export async function saveGovProposalDraft(canonicalOpportunityId: string, requirementId: string, content: string, gaps: GovResponseGap[]): Promise<GovResponseSlot> {
  const { data } = await api.post(rUrl(canonicalOpportunityId, requirementId, '/draft'), { content, gaps });
  return data;
}

/** P5: resolve one Draft-with-AI gap. `filler` blocks export server-side until replaced. */
export async function resolveGovProposalGap(canonicalOpportunityId: string, requirementId: string, gapId: string, resolution: 'open' | 'answered' | 'filler', answer?: string): Promise<GovResponseSlot> {
  const { data } = await api.post(rUrl(canonicalOpportunityId, requirementId, `/gaps/${encodeURIComponent(gapId)}`), { resolution, answer });
  return data;
}

/**
 * P5: ADVISORY "Draft with AI". The server drafts a grounded response to this requirement and returns typed gaps for
 * any fact it would have to invent; it persists the result as `draft` (never resolves a gap). Throws 503 if the AI is
 * unavailable. The returned slot carries `generatedAt`/`cached` advisory metadata alongside the usual fields.
 */
export async function draftGovProposalWithAI(canonicalOpportunityId: string, requirementId: string, requirementText: string, title?: string | null, buyer?: string | null): Promise<GovResponseSlot & { generatedAt?: string; cached?: boolean }> {
  const { data } = await api.post(rUrl(canonicalOpportunityId, requirementId, '/draft-ai'), { requirementText, title, buyer });
  return data;
}

/** P5 Team & access: how much of the proposal a member may see. */
export type ProposalShareLevel = 'none' | 'view' | 'comment' | 'edit';
export interface ProposalShareGrant { deliveryProjectId: string; memberIdentityId: string; level: ProposalShareLevel; updatedAt: string | null; }

/** The per-member proposal share grants on this pursuit's delivery project. */
export async function listGovProposalShare(canonicalOpportunityId: string): Promise<{ grants: ProposalShareGrant[] }> {
  const { data } = await api.get(qUrl(canonicalOpportunityId, '/proposal-share'));
  return data;
}

/** Set (or clear with 'none') a member's proposal share level — a per-member grant, never a role change. */
export async function setGovProposalShare(canonicalOpportunityId: string, memberIdentityId: string, level: ProposalShareLevel): Promise<{ grant: ProposalShareGrant }> {
  const { data } = await api.post(qUrl(canonicalOpportunityId, '/proposal-share'), { memberIdentityId, level });
  return data;
}

/** Record an amendment/message in the inbox. An amendment's `affects` invalidates affected responses (server-side). */
export async function recordGovProposalAmendment(canonicalOpportunityId: string, body: {
  amendmentKey: string; kind?: 'amendment' | 'message'; summary: string; affects?: string[]; provenance?: string | null; observedAt?: string | null;
}): Promise<GovProposalAmendment> {
  const { data } = await api.post(qUrl(canonicalOpportunityId, '/amendments'), body);
  return data;
}

/** Assemble + mark the submission package exported. Server refuses (409 not_ready + blocking) unless every response is approved. */
export async function exportGovSubmission(canonicalOpportunityId: string): Promise<GovSubmission> {
  const { data } = await api.post(qUrl(canonicalOpportunityId, '/submission/export'), {});
  return data;
}

/** Download the real submission package (zip) — fetched with auth, then handed to the browser as a file. */
export async function downloadGovSubmissionPackage(canonicalOpportunityId: string): Promise<void> {
  const { data } = await api.get(qUrl(canonicalOpportunityId, '/submission/package'), { responseType: 'blob' });
  const url = URL.createObjectURL(data as Blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'proposal-package.zip';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

/** Record the MANUAL external-submission receipt (exported ≠ submitted; server 409 if not exported). */
export async function recordGovSubmissionReceipt(canonicalOpportunityId: string, externalRef: string): Promise<GovSubmission> {
  const { data } = await api.post(qUrl(canonicalOpportunityId, '/submission/receipt'), { externalRef });
  return data;
}

/** Record the agency's acknowledgement (server 409 unless externally_submitted first). */
export async function acknowledgeGovSubmission(canonicalOpportunityId: string, acknowledgedRef: string): Promise<GovSubmission> {
  const { data } = await api.post(qUrl(canonicalOpportunityId, '/submission/acknowledge'), { acknowledgedRef });
  return data;
}

/** Reopen the submission to `preparing` (e.g. after a material amendment reopened a response). */
export async function reopenGovSubmission(canonicalOpportunityId: string): Promise<GovSubmission> {
  const { data } = await api.post(qUrl(canonicalOpportunityId, '/submission/reopen'), {});
  return data;
}

/** Record the win/loss outcome. won/lost also generate PRIVATE case-study + service-capability candidates (server-side). */
export async function recordGovOutcome(canonicalOpportunityId: string, outcome: GovSubmission['outcome'], note?: string | null): Promise<GovSubmission> {
  const { data } = await api.post(qUrl(canonicalOpportunityId, '/outcome'), { outcome, note: note ?? null });
  return data;
}

/** AI advisory (strictly downstream of the deterministic bid engine — it explains, never scores). */
export interface GovRiskNarrative { narrative: string; generatedAt: string; cached: boolean; }
export interface GovRiskNarrativeFacts {
  band: 'bid' | 'bid_with_conditions' | 'no_bid';
  pwin: number | null; preliminary: boolean; expectedValue: number | null; daysLeft: number | null;
  knockouts: { category: string; text: string; status: 'pass' | 'conditional' | 'hard_fail' }[];
  factors: { label: string; score: number | null; weight: number }[];
  buyer?: string | null; title?: string | null;
}
/** Generate a plain-English read of a bid decision the deterministic engine already produced. */
export async function getGovRiskNarrative(canonicalOpportunityId: string, facts: GovRiskNarrativeFacts): Promise<GovRiskNarrative> {
  const { data } = await api.post(qUrl(canonicalOpportunityId, '/risk-narrative'), facts);
  return data;
}

export interface GovProposalSummary { whatTheyWant: string; whatWedBuild: string; generatedAt: string; cached: boolean; }
/** Generate a "what they want / what we'd build" summary from the established requirement statements. */
export async function getGovProposalSummary(
  canonicalOpportunityId: string,
  body: { requirements: { id: string; text: string }[]; title?: string | null; buyer?: string | null; synopsis?: string | null },
): Promise<GovProposalSummary> {
  const { data } = await api.post(qUrl(canonicalOpportunityId, '/proposal-summary'), body);
  return data;
}

export interface GovClarificationQuestion { requirementId: string; ambiguity: string; question: string; }
export interface GovClarificationDraft { questions: GovClarificationQuestion[]; email: string; generatedAt: string; cached: boolean; }
/**
 * "Ask the buyer": advisory clarification questions for the ambiguous requirements, each citing a REAL requirement,
 * plus a ready-to-send email assembled from them. Grounded only in the established requirements; changes no gate.
 */
export async function getGovClarificationQuestions(
  canonicalOpportunityId: string,
  body: { requirements: { id: string; text: string }[]; title?: string | null; buyer?: string | null },
): Promise<GovClarificationDraft> {
  const { data } = await api.post(qUrl(canonicalOpportunityId, '/clarification-questions'), body);
  return data;
}

/** AI build spec + advisory buyer-system research (post-approval Build step). Advisory only — gates nothing;
 *  `research` is LLM-knowledge-based and labelled "likely / verify" (the backend has no live web search). */
export interface GovBuildSpec { spec: string; research: string; generatedAt: string; cached: boolean; }
export async function getGovBuildSpec(
  canonicalOpportunityId: string,
  body: { requirements: { id: string; text: string }[]; title?: string | null; buyer?: string | null; daysLeft?: number | null },
): Promise<GovBuildSpec> {
  const { data } = await api.post(qUrl(canonicalOpportunityId, '/build-spec'), body);
  return data;
}

/** ADVISORY, DATED build plan for the Build-step Gantt — SBP decompose + schedule. Advisory only (gates
 *  nothing, creates no build); the deterministic requirement-cited build track stays the record. */
export interface GovDatedStory {
  id: string; release: string; title: string; narrative: string;
  fulfills: string[]; acceptance: string[]; taskGuidance: string; failurePaths: string[];
  blockedBy: string[]; ownerAgent: string; dueDate: string;
}
export interface GovDatedRelease {
  key: string; name: string; goal: string; demo: string;
  startDate: string; endDate: string; isDemoRelease: boolean; isRoadmap: boolean;
}
export interface GovDatedPlan {
  projectName: string; descriptor: string;
  releases: GovDatedRelease[]; stories: GovDatedStory[]; unscheduled: boolean;
}
export interface GovBuildPlanAI { plan: GovDatedPlan | null; verdict: string; generatedAt: string; cached: boolean; }
export async function getGovBuildPlanAI(
  canonicalOpportunityId: string,
  body: { requirements: { id: string; text: string }[]; title?: string | null; buyer?: string | null; buildSpec?: string | null; deadline?: string | null },
): Promise<GovBuildPlanAI> {
  const { data } = await api.post(qUrl(canonicalOpportunityId, '/build-plan-ai'), body);
  return data;
}

/** Materialize the authorized build into a REAL monitored student project owned by the assigned intern's
 *  enrollment (idempotent; reuses the pursuit's linked project if one exists). A write — surfaces typed errors. */
export interface GovMaterializeResult {
  projectId: string; created: boolean; enrollmentId: string;
  lists: number; tasks: number; releaseCount: number; storyCount: number;
}
export async function materializeGovBuildProject(
  canonicalOpportunityId: string,
  body: { deliveryProjectId: string; assigneeIdentityId: string; requirements: { id: string; text: string }[]; title?: string | null; buyer?: string | null; buildSpec?: string | null; deadline?: string | null; projectName?: string | null },
): Promise<GovMaterializeResult> {
  const { data } = await api.post(qUrl(canonicalOpportunityId, '/materialize-build-project'), body);
  return data;
}

/** An active intern the gov build can be assigned to at materialization (not limited to this project's builders). */
export interface ActiveInternOption { identityId: string; email: string | null; name: string; hasProject: boolean }
/** All active interns, UNASSIGNED (no project) first — the people available to staff onto this build. */
export async function listActiveInterns(): Promise<ActiveInternOption[]> {
  const { data } = await api.get<{ interns: ActiveInternOption[] }>('/api/admin/factory/active-interns');
  return Array.isArray(data?.interns) ? data.interns : [];
}

/** Record a NON-approval decision and/or the reviewer-established cited requirements. */
export async function recordGovQualificationDecision(canonicalOpportunityId: string, body: {
  biddingEntity: string; expectedVersion: number; decision: 'pending_review' | 'needs_evidence' | 'no_bid';
  rationale?: string; establishedRequirements?: EstablishedRequirement[];
}): Promise<{ qualification: QualificationRecord }> {
  const { data } = await api.post(qUrl(canonicalOpportunityId, '/decision'), body);
  return data;
}

/** Record a pursuit APPROVAL (server-side, source-snapshot bound; approver != reviewer enforced server-side). */
export async function approveGovQualification(canonicalOpportunityId: string, body: {
  biddingEntity: string; expectedVersion: number; decision: 'approved_bid_pursuit' | 'rfi_response'; rationale?: string;
}): Promise<{ qualification: QualificationRecord }> {
  const { data } = await api.post(qUrl(canonicalOpportunityId, '/approve'), body);
  return data;
}

/** Record a SEPARATE build authorization (a pursuit approval is not a build authorization). */
export async function authorizeGovBuild(canonicalOpportunityId: string, body: {
  deliveryProjectId: string; scope: string; resourceLimit: string; rationale?: string; govQualificationId?: string;
}): Promise<{ buildAuthorization: { id: string } }> {
  const { data } = await api.post(qUrl(canonicalOpportunityId, '/authorize-build'), body);
  return data;
}

/** P4 Decide: the establisher routes the pursuit to a DIFFERENT program-capable admin for approval, attaching a
 *  decision brief. ADVISORY — the un-bypassable gate is still approveGovQualification (approver != establisher). */
export async function requestGovApproval(canonicalOpportunityId: string, body: {
  biddingEntity: string; expectedVersion: number; approverIdentityId: string; decisionBrief: GovDecisionBrief;
}): Promise<{ qualification: QualificationRecord }> {
  const { data } = await api.post(qUrl(canonicalOpportunityId, '/request-approval'), body);
  return data;
}

/** P4 Decide: the requested approver returns the pursuit to the establisher for revision, with a note. */
export async function sendBackGovApproval(canonicalOpportunityId: string, body: {
  biddingEntity: string; expectedVersion: number; note?: string;
}): Promise<{ qualification: QualificationRecord }> {
  const { data } = await api.post(qUrl(canonicalOpportunityId, '/send-back'), body);
  return data;
}

/** P4 Decide: a gov qualification with an OPEN approval request (for the opportunities-list pending flag). */
export interface PendingGovApproval {
  canonicalOpportunityId: string; biddingEntity: string;
  approverIdentityId: string | null; requestedBy: string | null; requestedAt: string | null;
}
/** List the active gov qualifications waiting on a second-admin approval. */
export async function listPendingGovApprovals(): Promise<{ pending: PendingGovApproval[] }> {
  const { data } = await api.get('/api/admin/factory/qualification/pending-approvals');
  return data;
}

/** An admin community member row (for the Decide approver picker). */
export interface AdminMemberRow {
  id: string; enrollment_id: string | null; display_name: string; email: string | null;
  role: string; signed_up_at: string | null; free_access: boolean; mgmt_role: string | null;
  org: { id: string; name: string; membership: 'manager' | 'member' } | null;
}

/** List admin community members. The Decide approver picker filters these to program-capable mgmt_roles
 *  (owner/admin/curriculum) and excludes the establisher by email; the server still enforces the real gate. */
export async function listAdminMembers(search?: string): Promise<{ members: AdminMemberRow[] }> {
  const { data } = await api.get('/api/admin/community/members', { params: search ? { search } : undefined });
  return data;
}

/** Record ('add') or revoke a MANUAL document review — the reviewer uploads the manually-downloaded Bonfire ZIP
 *  (add) and attests to the authoritative docIds it covers, so the coverage gate can clear; the server computes
 *  the sha256. 'revoke' removes an attestation (no file needed). */
export async function reviewGovQualificationDocuments(canonicalOpportunityId: string, args: {
  biddingEntity: string; expectedVersion: number; mode: 'add' | 'revoke'; coveredDocIds: string[]; file?: File | null;
}): Promise<{ qualification: QualificationRecord }> {
  const form = new FormData();
  form.append('biddingEntity', args.biddingEntity);
  form.append('expectedVersion', String(args.expectedVersion));
  form.append('mode', args.mode);
  form.append('coveredDocIds', JSON.stringify(args.coveredDocIds));
  if (args.file) form.append('document', args.file);
  const { data } = await api.post(qUrl(canonicalOpportunityId, '/review-documents'), form, { headers: { 'Content-Type': 'multipart/form-data' } });
  return data;
}

/** DECOUPLED (gws) workspace: attest ('add') or revoke the uploaded solicitation ZIP as the evidence of record. The
 *  server computes the sha256 (bytes never stored). This is what lets pursuit approval clear on the ZIP path. */
export async function attestSolicitationZip(canonicalOpportunityId: string, args: {
  biddingEntity: string; expectedVersion: number; mode: 'add' | 'revoke'; file?: File | null;
}): Promise<{ qualification: QualificationRecord }> {
  const form = new FormData();
  form.append('biddingEntity', args.biddingEntity);
  form.append('expectedVersion', String(args.expectedVersion));
  form.append('mode', args.mode);
  if (args.file) form.append('document', args.file);
  const { data } = await api.post(qUrl(canonicalOpportunityId, '/attest-zip'), form, { headers: { 'Content-Type': 'multipart/form-data' } });
  return data;
}

/** One requirement the deterministic extractor found in the uploaded solicitation ZIP. A CANDIDATE only — it becomes
 *  an established (gate-bearing) requirement solely when the reviewer confirms it via the establish/decision path. */
export interface ExtractedRequirementCandidate {
  id: string; text: string; extractedText?: string | null;
  sourceDocument?: string | null; section?: string | null; kind?: string | null; priority?: string | null;
}

/** P2: a candidate requirement grouped into one of four categories, citing its source fragment(s). Advisory and
 *  deterministic (the server builds it from the extracted text); confirming an item establishes the underlying
 *  requirement through the normal decision path. */
export type ReqItemCategory = 'submit' | 'rule' | 'scope' | 'after_award';
export interface RequirementItemFragment { reqId: string; text: string; doc: string; section?: string; }
export interface RequirementItem {
  id: string;
  category: ReqItemCategory;
  title: string;
  definition: string;
  sourceFragments: RequirementItemFragment[];
  links: string[];
  inferred: boolean;
  checkNote?: string;
  status: 'candidate' | 'confirmed';
  dueAt?: string | null;
}

/** Per-file extraction outcome — the server's "honesty rail": one row per file in the ZIP so nothing is silently
 *  dropped. Mirrors the backend ExtractedFileOutcome; lets the UI explain WHY an extraction yielded no candidates. */
export interface ExtractedFileOutcome {
  name: string;
  status: 'extracted' | 'empty' | 'unsupported' | 'unreadable' | 'image_only_pdf' | 'skipped_budget';
  chars: number;
  truncated: boolean;
  warning: string | null;
}

/** READ-ONLY: upload the solicitation ZIP and get back the extractor's candidate requirements for the reviewer to
 *  confirm. Persists nothing server-side — establishment stays the deliberate, confirmed write. `items` is the same
 *  candidates grouped into the 4-category map; `candidates` stays the Raw/Checklist view. `files` is the per-file
 *  outcome rail (optional for back-compat), used to explain a zero-candidate extraction. */
/** The AI-comprehension pass's outcome (T4). `deterministic` when the flag is off (no AI ran); `deterministic+ai`
 *  when it did — `aiKept` quote-verified rows were added, `aiDropped` were dropped for not citing the source. */
export interface GovExtractionMeta { mode: 'deterministic' | 'deterministic+ai'; model: string | null; aiKept: number; aiDropped: number; aiError: string | null }
export async function extractGovQualificationRequirements(canonicalOpportunityId: string, file: File): Promise<{ candidates: ExtractedRequirementCandidate[]; items?: RequirementItem[]; fileCount: number; files?: ExtractedFileOutcome[]; extraction?: GovExtractionMeta }> {
  const form = new FormData();
  form.append('document', file);
  const { data } = await api.post(qUrl(canonicalOpportunityId, '/extract-requirements'), form, { headers: { 'Content-Type': 'multipart/form-data' } });
  return data;
}

export interface GovCandidate { canonicalOpportunityId: string; title: string | null; agency: string | null; noticeType: string | null; }
export interface GovCandidatesResult { available: boolean; reason?: 'not_configured' | 'source_failed'; candidates: GovCandidate[]; sourceLive: boolean; }

/** The TRUSTED discovery→canonical mapping (OP v2 list). When unavailable, `available:false` + reason — the UI
 *  surfaces the gap and never derives a canonical id from a title. */
export async function getGovOpportunityCandidates(): Promise<GovCandidatesResult> {
  const { data } = await api.get<GovCandidatesResult>('/api/admin/factory/qualification-candidates');
  return data;
}
