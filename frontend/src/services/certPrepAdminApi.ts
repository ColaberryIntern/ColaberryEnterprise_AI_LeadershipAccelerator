import api from '../utils/api';

/**
 * certPrepAdminApi — the client for /api/admin/cert-prep.
 *
 * This is the ONE Cert Prep surface that handles answer data, and it does so on
 * purpose: a reviewer cannot approve a question without reading its key and its
 * rationale. Everything else in the feature is built so answers cannot leak —
 * `certPrepApi.ts`'s `CertQuestionItem` structurally has no `correct_keys`, and
 * `certAnalytics.sanitize()` strips them from telemetry. The review queue is the
 * deliberate exception, behind `requireAdmin` and the 'program' management
 * section, and nothing from it is ever handed to a student-facing component.
 *
 * Types mirror `backend/src/services/certPrep/certAdminService.ts` and the route
 * handlers in `backend/src/routes/admin/certPrepAdminRoutes.ts`. Keep them in
 * sync by hand — there is no shared-types package yet.
 *
 * There is deliberately no bulk-approve call here, because there is no
 * bulk-approve endpoint. Approving forty questions with one click is not review.
 */

// ── cohort operations ────────────────────────────────────────────────────────

export interface AdminCohort {
  id: string;
  name: string;
  status: string;
  start_date?: string | null;
}

export interface CohortReadinessRow {
  enrollment_id: string;
  full_name: string | null;
  email: string | null;
  /** 'not_measured' | 'building' | 'approaching' | 'sustained' */
  overall_state: string;
  overall_scaled: number | null;
  knowledge_scaled: number | null;
  sample_confidence: number | null;
  evidence_coverage_pct: number | null;
  answered_total: number;
  computed_at: string | null;
}

export interface DomainWeakness {
  domain_id: string;
  answered: number;
  correct: number;
  pct: number;
  students: number;
}

export interface NotStartedStudent {
  enrollment_id: string;
  full_name: string | null;
  email: string | null;
}

export async function fetchCohorts(): Promise<AdminCohort[]> {
  const { data } = await api.get<{ cohorts: AdminCohort[] }>('/api/admin/cohorts');
  return data.cohorts ?? [];
}

export async function fetchCohortReadiness(cohortId: string): Promise<CohortReadinessRow[]> {
  const { data } = await api.get<{ rows: CohortReadinessRow[] }>(
    `/api/admin/cert-prep/cohorts/${encodeURIComponent(cohortId)}/readiness`,
  );
  return data.rows ?? [];
}

export async function fetchCohortWeakness(cohortId: string): Promise<DomainWeakness[]> {
  const { data } = await api.get<{ domains: DomainWeakness[] }>(
    `/api/admin/cert-prep/cohorts/${encodeURIComponent(cohortId)}/weakness`,
  );
  return data.domains ?? [];
}

export async function fetchNotStarted(cohortId: string): Promise<NotStartedStudent[]> {
  const { data } = await api.get<{ students: NotStartedStudent[] }>(
    `/api/admin/cert-prep/cohorts/${encodeURIComponent(cohortId)}/not-started`,
  );
  return data.students ?? [];
}

// ── bank health and item quality ─────────────────────────────────────────────

export interface BankHealth {
  blueprint_version: string;
  total_questions: number;
  by_status: Record<string, number>;
  approved_by_domain: Record<string, number>;
  /** The silent cause of short forms: a domain the form planner cannot fill. */
  domains_with_no_approved: string[];
}

export interface ItemStatistic {
  question_key: string;
  revision: number;
  domain_id: string;
  difficulty: string;
  exposures: number;
  correct: number;
  p_value: number;
  /** null below MIN_EXPOSURES — a statistic from three answers is worse than none. */
  discrimination: number | null;
  flags: string[];
}

export async function fetchBankHealth(): Promise<BankHealth> {
  const { data } = await api.get<BankHealth>('/api/admin/cert-prep/bank');
  return data;
}

export async function fetchItemStatistics(blueprintVersion?: string): Promise<ItemStatistic[]> {
  const { data } = await api.get<{ items: ItemStatistic[] }>('/api/admin/cert-prep/items', {
    params: blueprintVersion ? { blueprint_version: blueprintVersion } : undefined,
  });
  return data.items ?? [];
}

// ── question review ──────────────────────────────────────────────────────────

export type ReviewStatus = 'draft' | 'in_review' | 'approved' | 'retired';

export interface QuestionOption {
  key: string;
  text: string;
}

/**
 * A revision as the review queue returns it — WITH the answer key and rationale,
 * because that is what review means. Never pass one of these to a student view.
 */
export interface QuestionRevision {
  question_key: string;
  revision: number;
  domain_id: string;
  objective_id: string | null;
  blueprint_version: string;
  difficulty: string;
  stem: string;
  options: QuestionOption[];
  correct_keys: string[];
  rationale: string | null;
  distractor_rationales: Record<string, string> | null;
  review_status: ReviewStatus;
  reviewer: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export async function fetchReviewQueue(status: ReviewStatus): Promise<QuestionRevision[]> {
  const { data } = await api.get<{ questions: QuestionRevision[] }>('/api/admin/cert-prep/questions', {
    params: { status },
  });
  return data.questions ?? [];
}

/**
 * Move ONE revision through the lifecycle. The reviewer is taken server-side
 * from the authenticated admin — there is no reviewer parameter here, and adding
 * one would be a way to attribute an approval to somebody who never read it.
 */
export async function setQuestionStatus(
  questionKey: string, revision: number, status: ReviewStatus,
): Promise<{ question_key: string; revision: number; review_status: ReviewStatus; reviewer: string | null }> {
  const { data } = await api.post(
    `/api/admin/cert-prep/questions/${encodeURIComponent(questionKey)}/${revision}/status`,
    { status },
  );
  return data;
}

// ── evidence verification ────────────────────────────────────────────────────

export type MappingState = 'pending' | 'verified' | 'rejected';

export interface EvidenceMapping {
  id: string;
  enrollment_id: string;
  track_id: string;
  blueprint_version: string;
  domain_id: string;
  objective_id: string | null;
  source_type: string;
  source_id: string;
  mapping_state: MappingState;
  mapping_rationale: string | null;
  auto_matched: boolean;
  verified_by: string | null;
  verified_at: string | null;
  rejected_reason: string | null;
  created_at: string;
}

/**
 * Pending evidence is scoped to a set of enrollments rather than fetched
 * globally — an instructor reviews the cohort in front of them, and the server
 * returns nothing at all for an empty id list.
 */
export async function fetchPendingEvidence(enrollmentIds: string[]): Promise<EvidenceMapping[]> {
  if (enrollmentIds.length === 0) return [];
  const { data } = await api.get<{ pending: EvidenceMapping[] }>('/api/admin/cert-prep/evidence/pending', {
    params: { enrollment_ids: enrollmentIds.join(',') },
  });
  return data.pending ?? [];
}

export async function setEvidenceState(
  id: string, state: 'verified' | 'rejected', reason?: string,
): Promise<{ id: string; mapping_state: MappingState; verified_by: string | null; verified_at: string | null }> {
  const { data } = await api.post(
    `/api/admin/cert-prep/evidence/${encodeURIComponent(id)}/state`,
    { state, ...(reason ? { reason } : {}) },
  );
  return data;
}

// ── audit ────────────────────────────────────────────────────────────────────

/**
 * Both kinds of human decision: a question approved, and evidence verified or
 * rejected. Those are the only two moments where a named person changes what a
 * student sees.
 */
export interface AuditEntry {
  kind: 'question_review' | 'evidence_decision';
  actor: string;
  at: string;
  question_key?: string;
  revision?: number;
  status?: string;
  mapping_id?: string;
  enrollment_id?: string;
  domain_id?: string;
  objective_id?: string | null;
  source_type?: string;
  state?: string;
  reason?: string | null;
}

export async function fetchAuditTrail(): Promise<AuditEntry[]> {
  const { data } = await api.get<{ entries: AuditEntry[] }>('/api/admin/cert-prep/audit');
  return data.entries ?? [];
}
