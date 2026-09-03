import portalApi from '../utils/portalApi';

/**
 * certPrepApi — the client for /api/portal/cert-prep.
 *
 * The types here mirror what the server actually sends, and they deliberately do
 * NOT include answer data on the pre-submission shapes. `CertQuestionItem` has no
 * `correct_keys` and no `rationale`, because the server does not send them until
 * an item is answered — if you find yourself wanting to add those fields to it,
 * the bug is upstream, not here.
 *
 * Nothing in this module sends an enrollment id, a program week, a score or a
 * correctness flag. The server resolves all of that from the session token.
 */

export type CertMode = 'diagnostic' | 'practice' | 'mock';
export type CertSessionStatus = 'in_progress' | 'completed' | 'expired' | 'abandoned';
export type CertReadinessState = 'not_measured' | 'building' | 'approaching' | 'sustained';
export type CertAvailabilityReason =
  | 'available' | 'before_start_week' | 'not_started'
  | 'no_cohort_start' | 'no_active_track' | 'error';

export interface CertAvailability {
  available: boolean;
  programWeek: number | null;
  startWeek: number | null;
  trackId: string | null;
  reason: CertAvailabilityReason;
}

export interface CertDomainReadiness {
  domain_id: string;
  knowledge_pct: number | null;
  answered: number;
  evidence_verified: number;
  objectives_total: number;
  objectives_evidenced: number;
}

export interface CertReadiness {
  track_id: string;
  blueprint_version: string;
  readiness_policy_version: string;
  knowledge_scaled: number | null;
  evidence_coverage_pct: number;
  sample_confidence: number;
  overall_scaled: number | null;
  overall_state: CertReadinessState;
  weights_available: boolean;
  domain_breakdown: CertDomainReadiness[];
  qualifying_sittings: number;
  answered_total: number;
}

export interface CertTrackInfo {
  track_id: string;
  display_name: string;
  issuer: string;
  blueprint_version: string;
  blueprint_source: 'official' | 'community' | 'unverified';
  exam_item_count: number | null;
  exam_duration_minutes: number | null;
  passing_scaled_score: number | null;
}

export interface CertDomain {
  domain_id: string;
  label: string;
  description: string | null;
  weight_pct: number | null;
  weight_source: string;
  display_order: number;
  objectives: { objective_id: string; label: string }[];
  state: CertDomainReadiness | null;
}

/** What a student may see BEFORE answering. No answer key, by construction. */
export interface CertQuestionItem {
  question_key: string;
  revision: number;
  domain_id: string;
  objective_id: string | null;
  stem: string;
  options: { key: string; text: string }[];
  /** How many options to select — the real exam always states this. */
  select_count: number;
  difficulty: 'easy' | 'medium' | 'hard';
}

/** What comes back AFTER submitting one item. */
export interface CertRevealedItem extends CertQuestionItem {
  correct_keys: string[];
  rationale: string;
  distractor_rationales: Record<string, string>;
  your_selection: string[];
  is_correct: boolean;
}

export interface CertSession {
  id: string;
  mode: CertMode;
  status: CertSessionStatus;
  track_id: string;
  blueprint_version: string;
  scoring_policy_version: string;
  question_keys: { question_key: string; revision: number }[];
  time_limit_seconds: number | null;
  started_at: string;
  expires_at: string | null;
  completed_at: string | null;
  scaled_score: number | null;
  correct_count: number | null;
  total_count: number | null;
  domain_results: { domain_id: string; correct: number; total: number; pct: number }[] | null;
}

export interface CertSessionView {
  session: CertSession;
  items: CertQuestionItem[];
  answered: Record<string, { selected_keys: string[]; is_correct: boolean | null }>;
  expired: boolean;
}

export interface CertObjectiveEvidence {
  domain_id: string;
  objective_id: string;
  label: string;
  state: 'verified' | 'pending' | 'missing';
  sources: { source_type: string; source_id: string; mapping_state: string; rationale: string | null }[];
  recommended_action: { kind: 'build'; label: string; detail: string } | null;
}

export interface CertEvidenceMap {
  objectives: CertObjectiveEvidence[];
  verified: number;
  pending: number;
  total: number;
}

export interface CertPointAward {
  event: string;
  awarded: boolean;
  points: number;
}

/** Availability + readiness. Answers for pre-Week-7 students too. */
export const getCertPrepSummary = (): Promise<{
  data: { availability: CertAvailability; readiness: CertReadiness | null };
}> => portalApi.get('/api/portal/cert-prep');

export const getCertDomains = (): Promise<{ data: { track: CertTrackInfo; domains: CertDomain[] } }> =>
  portalApi.get('/api/portal/cert-prep/domains');

export const getCertEvidence = (): Promise<{ data: CertEvidenceMap }> =>
  portalApi.get('/api/portal/cert-prep/evidence');

export const refreshCertEvidence = (): Promise<{
  data: { proposed: number; considered: number; map: CertEvidenceMap | null };
}> => portalApi.post('/api/portal/cert-prep/evidence/refresh');

export const listCertSessions = (): Promise<{ data: { sessions: CertSession[] } }> =>
  portalApi.get('/api/portal/cert-prep/sessions');

export const startCertSession = (input: {
  mode: CertMode;
  domain_ids?: string[];
  item_count?: number;
  idempotency_key?: string;
}): Promise<{ data: CertSessionView }> => portalApi.post('/api/portal/cert-prep/sessions', input);

export const resumeCertSession = (sessionId: string): Promise<{ data: CertSessionView }> =>
  portalApi.get(`/api/portal/cert-prep/sessions/${sessionId}`);

/** Submit one answer. Sends the selection only; the server decides correctness. */
export const submitCertResponse = (
  sessionId: string,
  input: { question_key: string; selected_keys: string[]; time_ms?: number },
): Promise<{ data: CertRevealedItem }> =>
  portalApi.post(`/api/portal/cert-prep/sessions/${sessionId}/responses`, input);

export const completeCertSession = (
  sessionId: string,
): Promise<{ data: { session: CertSession; points: CertPointAward[]; readiness: CertReadiness | null } }> =>
  portalApi.post(`/api/portal/cert-prep/sessions/${sessionId}/complete`);

// ── presentation helpers ─────────────────────────────────────────────────────

/**
 * The label for a readiness state.
 *
 * Never says "ready to pass" or anything predictive about the real exam. This is
 * a Colaberry readiness estimate on the same axis as the exam, not a forecast of
 * Anthropic's own scaled score — see certScoring.ts on the backend.
 */
export function readinessLabel(state: CertReadinessState): string {
  switch (state) {
    case 'sustained': return 'Sustained';
    case 'approaching': return 'Approaching';
    case 'building': return 'Building';
    default: return 'Not measured';
  }
}

/** A short, honest explanation of what the state means. */
export function readinessExplanation(readiness: CertReadiness | null): string {
  if (!readiness || readiness.overall_state === 'not_measured') {
    return 'Take the baseline diagnostic to create your first readiness picture.';
  }
  if (readiness.overall_state === 'sustained') {
    return 'You have held this level across more than one full sitting, with broad coverage.';
  }
  if (readiness.overall_state === 'approaching') {
    return readiness.qualifying_sittings < 2
      ? 'You have cleared the line once. Hold it across another full sitting.'
      : 'You are at the line, but your practice has not covered every domain yet.';
  }
  return 'Keep practising — your weakest domains will move this fastest.';
}
