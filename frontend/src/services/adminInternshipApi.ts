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
