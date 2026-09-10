import api from '../utils/api';

/** Admin client for the AI Internship review queue. */

export type QueueBucket =
  | 'awaiting_review'
  | 'information_requested'
  | 'waitlisted'
  | 'interview_incomplete'
  | 'calls_failed'
  | 'approved_awaiting_documents'
  | 'all_open';

export interface QueueRow {
  application_id: string;
  enrollment_id: string;
  full_name: string | null;
  email: string | null;
  state: string;
  interview_channel: string | null;
  submitted_at: string | null;
  created_at: string;
  progress: { resolved: number; total: number };
  blocking_count: number;
}

export interface QueueResponse {
  counts: Record<QueueBucket, number>;
  rows: QueueRow[];
  total: number;
  bucket: QueueBucket;
}

export interface RecommendationFactor {
  code: string;
  detail: string;
  severity: 'blocking' | 'attention' | 'note';
  question_key?: string;
  evidence?: string;
}

export interface ProfileSignal {
  key: string;
  label: string;
  value: string | number | null;
  source: string;
  observed_at: string | null;
  reliability: 'reliable' | 'unknown';
  reason?: string;
}

export interface SummaryLine {
  question_key: string;
  section_title: string;
  question: string;
  answer_display: string;
  state: string;
  answered_via: string | null;
  is_confirmation: boolean;
}

export interface ApplicationDetail {
  application: {
    id: string;
    state: string;
    interview_channel: string | null;
    submitted_at: string | null;
    decided_at: string | null;
    attests_not_employed_fulltime: boolean;
    commitment_acknowledged_at: string | null;
    converted_from_existing_intern: boolean;
    created_at: string;
  };
  person: { full_name: string | null; email: string | null };
  intake: Record<string, any> | null;
  summary: SummaryLine[];
  progress: { total: number; resolved: number; remaining: number; complete: boolean };
  sessions: Array<{
    id: string;
    channel: string;
    status: string;
    scheduled_for: string | null;
    completed_at: string | null;
    failure_reason: string | null;
    transcript: string | null;
    transcript_withheld: boolean;
  }>;
  recommendation: {
    suggested_action: string;
    factors: RecommendationFactor[];
    completeness: { total: number; resolved: number; unresolved_keys: string[] };
    excluded_signals: Array<{ signal: string; reason: string }>;
    requires_human_decision: boolean;
  };
  signals: ProfileSignal[];
  decisions: Array<Record<string, any>>;
  timeline: Array<{
    from_state: string | null;
    to_state: string;
    actor_type: string;
    actor_id: string | null;
    reason: string | null;
    evidence_source: string | null;
    at: string;
  }>;
  reason_options: Array<{ code: string; label: string; applies_to: string[] }>;
}

export type ReviewerDecision =
  | 'approve' | 'approve_with_conditions' | 'reject'
  | 'waitlist' | 'request_information' | 'schedule_human_follow_up';

export async function fetchInternshipQueue(bucket: QueueBucket): Promise<QueueResponse> {
  const { data } = await api.get<QueueResponse>('/api/admin/internship/queue', { params: { bucket } });
  return data;
}

export async function fetchInternshipApplication(id: string): Promise<ApplicationDetail> {
  const { data } = await api.get<ApplicationDetail>(`/api/admin/internship/applications/${id}`);
  return data;
}

export async function decideInternshipApplication(id: string, body: {
  decision: ReviewerDecision;
  reason_code: string;
  student_message?: string | null;
  reviewer_notes?: string | null;
  conditions?: string | null;
}): Promise<{ ok: boolean; decision_id: string; state: string; email: { attempted: boolean; outcome: string | null } }> {
  const { data } = await api.post(`/api/admin/internship/applications/${id}/decide`, body);
  return data;
}

// ── Documents ───────────────────────────────────────────────────────────────

export interface AdminDocumentRow {
  id: string;
  document_type: string;
  kind: 'generated' | 'signed_upload';
  revision: number;
  status: string;
  original_filename: string | null;
  mime_type: string | null;
  byte_size: number | null;
  checksum_short: string | null;
  document_public_id: string | null;
  verified_by: string | null;
  verified_at: string | null;
  rejection_reason: string | null;
  created_at: string;
}

export interface AdminDocumentsView {
  requirements: Array<{
    document_type: string;
    title: string;
    requires_signature: boolean;
    generated: boolean;
    latest_upload_revision: number | null;
    verified: boolean;
    correction_requested: boolean;
    rejection_reason: string | null;
  }>;
  all_verified: boolean;
  documents: AdminDocumentRow[];
}

export async function fetchInternshipDocumentsAdmin(applicationId: string): Promise<AdminDocumentsView> {
  const { data } = await api.get<AdminDocumentsView>(`/api/admin/internship/applications/${applicationId}/documents`);
  return data;
}

/** The reviewer has to actually look at the page before accepting it. */
export function internshipDocumentFileUrl(documentId: string): string {
  const base = process.env.REACT_APP_API_URL || '';
  return `${base}/api/admin/internship/documents/${documentId}/file`;
}

export async function verifyInternshipDocument(documentId: string, body: {
  accept: boolean;
  rejection_reason?: string | null;
}): Promise<{ ok: boolean; all_verified: boolean; state: string }> {
  const { data } = await api.post(`/api/admin/internship/documents/${documentId}/verify`, body);
  return data;
}

// ── Phase 7: KPIs, profile, conversion ──────────────────────────────────────

export interface InternshipKpi {
  key: string;
  label: string;
  count: number;
  drilldown: { bucket?: string; state?: string };
  reliability: 'reliable' | 'unknown';
  reason?: string;
}

export async function fetchInternshipKpis(): Promise<{ kpis: InternshipKpi[] }> {
  const { data } = await api.get('/api/admin/internship/kpis');
  return data;
}

export interface TrackedMetric {
  key: string;
  label: string;
  value: string | number | boolean | null;
  source: string;
  observed_at: string | null;
  reliability: 'reliable' | 'unknown';
  reason?: string;
}

export interface InternshipProfileSection {
  has_internship: boolean;
  application: null | Record<string, any>;
  membership: null | {
    cohort_id: string; status: string; joined_at: string | null;
    week: number | null; training_cohort_id: string | null;
  };
  metrics: TrackedMetric[];
  excluded_from_assessment: Array<{ signal: string; reason: string }>;
  documents: { all_verified: boolean; requirements: Array<Record<string, any>> };
  requirements_acknowledged: Array<{ requirement_key: string; state: string; verified_at: string | null }>;
}

export async function fetchInternshipProfile(enrollmentId: string): Promise<InternshipProfileSection> {
  const { data } = await api.get(`/api/admin/internship/profile/${enrollmentId}`);
  return data;
}

export interface ConversionInternInput {
  email: string;
  full_name?: string | null;
  interview_grandfathered?: boolean;
  documents_already_verified?: boolean;
}

export interface ConversionPlanRow {
  email: string;
  outcome: 'no_match' | 'ambiguous_match' | 'already_converted' | 'will_convert';
  enrollment_id: string | null;
  full_name: string | null;
  candidate_enrollment_ids: string[];
  existing_application_state: string | null;
  already_in_cohort: boolean;
  requirements: null | { interview: string; documents: string; tool_acknowledgement: string };
  actions: string[];
  blocked_reason: string | null;
  preserved: null | {
    started_on: string | null; projects: number;
    attendance_records: number; certification_snapshots: number;
  };
}

export interface ConversionPlan {
  dry_run: true;
  generated_at: string;
  cohort_exists: boolean;
  rows: ConversionPlanRow[];
  summary: Record<string, number>;
}

export interface ConversionReport {
  dry_run: false;
  committed_at: string;
  rows: Array<{
    email: string; ok: boolean; state: string | null;
    added_to_cohort: boolean; skipped_already_converted: boolean; error: string | null;
  }>;
  summary: { converted: number; skipped: number; failed: number };
}

export async function planInternshipConversion(interns: ConversionInternInput[]): Promise<ConversionPlan> {
  const { data } = await api.post('/api/admin/internship/conversion/plan', { interns });
  return data;
}

/** `confirm: true` is required by the server so a commit cannot be a mis-click. */
export async function commitInternshipConversion(interns: ConversionInternInput[]): Promise<ConversionReport> {
  const { data } = await api.post('/api/admin/internship/conversion/commit', { interns, confirm: true });
  return data;
}
