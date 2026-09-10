import portalApi from '../utils/portalApi';

/**
 * Client for the participant internship endpoints.
 *
 * Note what is absent: no function here takes an application id. The server
 * derives it from the session, so there is no id for this client to hold, pass,
 * or get wrong.
 */

export type InternshipCardState =
  | 'none'
  | 'eligible'
  | 'started'
  | 'interview_choice'
  | 'call_scheduled'
  | 'interview_in_progress'
  | 'under_review'
  | 'information_requested'
  | 'approved_documents_pending'
  | 'documents_uploaded'
  | 'payment_pending'
  | 'activation_pending'
  | 'active'
  | 'rejected'
  | 'waitlisted';

export interface InternshipStatus {
  card_state: InternshipCardState;
  render: boolean;
  may_pulse: boolean;
  actionable: boolean;
  title: string;
  cta: string | null;
  application: null | {
    id: string;
    state: string;
    interview_channel: 'form' | 'phone' | null;
    submitted_at: string | null;
    is_terminal: boolean;
  };
}

export async function fetchInternshipStatus(): Promise<InternshipStatus> {
  const { data } = await portalApi.get<InternshipStatus>('/api/portal/internship/status');
  return data;
}

export async function startInternshipApplication(): Promise<{ application_id: string; state: string; created: boolean }> {
  const { data } = await portalApi.post('/api/portal/internship/application', {});
  return data;
}

/** Group A only. The server rejects anything else, including a stray API key. */
export async function saveInternshipIntake(values: Record<string, unknown>): Promise<InternshipStatus> {
  const { data } = await portalApi.put<InternshipStatus>('/api/portal/internship/intake', values);
  return data;
}

export async function selectInternshipChannel(channel: 'form' | 'phone'): Promise<InternshipStatus> {
  const { data } = await portalApi.post<InternshipStatus>('/api/portal/internship/interview/channel', { channel });
  return data;
}

// ── The interview (both channels) ───────────────────────────────────────────

export interface InterviewQuestionView {
  question_key: string;
  section: string;
  section_title: string;
  prompt: string;
  answer_type: 'text' | 'long_text' | 'yes_no' | 'choice';
  options: string[] | null;
  required: boolean;
  is_confirmation: boolean;
}

export interface InterviewProgressView {
  version: number;
  total: number;
  resolved: number;
  remaining: number;
  complete: boolean;
}

export interface InterviewView {
  state: string;
  channel: 'form' | 'phone' | null;
  progress: InterviewProgressView;
  scheduled_call: { session_id: string; scheduled_for: string } | null;
  questions: InterviewQuestionView[];
}

export interface SummaryLineView {
  question_key: string;
  section: string;
  section_title: string;
  question: string;
  answer_display: string;
  state: string;
  answered_via: string | null;
  is_confirmation: boolean;
}

export interface SummaryView {
  state: string;
  progress: InterviewProgressView;
  needs_confirmation: string[];
  lines: SummaryLineView[];
}

export interface AnswerPayload {
  question_key: string;
  answer_text?: string | null;
  answer_value?: boolean | string | null;
  state?: 'answered' | 'skipped';
}

export async function fetchInterview(): Promise<InterviewView> {
  const { data } = await portalApi.get<InterviewView>('/api/portal/internship/interview');
  return data;
}

export async function saveInterviewAnswers(
  answers: AnswerPayload[],
  isCorrection = false,
): Promise<{ saved: string[]; rejected: string[]; progress: InterviewProgressView; state: string }> {
  const { data } = await portalApi.put('/api/portal/internship/interview/answers', {
    answers, is_correction: isCorrection,
  });
  return data;
}

export async function fetchInterviewSummary(): Promise<SummaryView> {
  const { data } = await portalApi.get<SummaryView>('/api/portal/internship/interview/summary');
  return data;
}

export async function confirmInterviewSummary(): Promise<{ confirmed: number; interview_complete: boolean; state: string }> {
  const { data } = await portalApi.post('/api/portal/internship/interview/summary/confirm', { confirmed: true });
  return data;
}

export async function submitInternshipApplication(): Promise<InternshipStatus> {
  const { data } = await portalApi.post<InternshipStatus>('/api/portal/internship/submit', {});
  return data;
}

/**
 * Ask for the call now.
 *
 * A refusal comes back as 200 with `placed: false` and a human-readable `message`
 * — no permission to call, no phone, nothing left to ask, cooldown, or calls
 * unavailable. None of those are errors, so the caller shows the message rather
 * than an error state.
 */
export async function requestInternshipCall(): Promise<
  | { placed: true; session_id: string; remaining: number }
  | { placed: false; reason: string; message: string }
> {
  const { data } = await portalApi.post('/api/portal/internship/interview/call', {});
  return data;
}

export async function scheduleInternshipCall(scheduledFor: string): Promise<{ session_id: string; scheduled_for: string }> {
  const { data } = await portalApi.post('/api/portal/internship/interview/call/schedule', { scheduled_for: scheduledFor });
  return data;
}

export async function cancelInternshipCall(): Promise<{ cancelled: boolean }> {
  const { data } = await portalApi.post('/api/portal/internship/interview/call/cancel', {});
  return data;
}

// ── The offer-letter package ────────────────────────────────────────────────

export interface OfferDocument {
  id: string;
  document_type: string;
  title: string;
  document_public_id: string;
  revision: number;
  byte_size: number;
  requires_signature: boolean;
  why: string;
}

export interface DocumentRequirement {
  document_type: string;
  title: string;
  requires_signature: boolean;
  generated: boolean;
  latest_upload_revision: number | null;
  verified: boolean;
  correction_requested: boolean;
  rejection_reason: string | null;
}

export interface DocumentsView {
  state: string;
  documents: OfferDocument[];
  requirements: DocumentRequirement[];
  all_verified: boolean;
}

export async function fetchInternshipDocuments(): Promise<DocumentsView> {
  const { data } = await portalApi.get<DocumentsView>('/api/portal/internship/documents');
  return data;
}

/**
 * Download a generated document.
 *
 * Fetched as a blob through the authed client rather than linked directly: the
 * endpoint requires the participant JWT, so a plain <a href> would 401. The object
 * URL is revoked immediately after the click to avoid leaking it for the page's
 * lifetime.
 */
export async function downloadInternshipDocument(documentId: string, filename: string): Promise<void> {
  const res = await portalApi.get(`/api/portal/internship/documents/${documentId}/download`, {
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export async function uploadSignedInternshipDocument(
  documentType: string,
  file: File,
): Promise<{ document_id: string; revision: number; state: string }> {
  const form = new FormData();
  form.append('document', file);
  const { data } = await portalApi.post(
    `/api/portal/internship/documents/${documentType}/signed`,
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return data;
}

// ── Activation and onboarding ───────────────────────────────────────────────

export interface ChecklistStep {
  key: string;
  order: number;
  label: string;
  detail: string;
  actor: 'student' | 'colaberry';
  blocking_activation: boolean;
  complete: boolean;
  waiting_on: string | null;
}

export interface MembershipCheck {
  requires_subscription: boolean;
  has_active_subscription: boolean;
  has_active_comp: boolean;
  ok: boolean;
}

export interface OnboardingView {
  state: string;
  is_active: boolean;
  cohort_id: string | null;
  joined_at: string | null;
  week: number | null;
  minimum_weekly_hours: number;
  max_active_projects: number;
  required_meetings: Array<{ day: string; kind: string }>;
  checklist: ChecklistStep[];
  progress: { done: number; total: number };
  next_action: ChecklistStep | null;
  membership: MembershipCheck;
}

export type RequirementKey = 'claude_code_account' | 'own_api_key_with_billing' | 'never_share_credentials';
export type AcknowledgementState =
  | 'acknowledged_requirement'
  | 'self_attested_ready'
  | 'setup_verified_without_secret_collection';

export async function fetchInternshipOnboarding(): Promise<OnboardingView> {
  const { data } = await portalApi.get<OnboardingView>('/api/portal/internship/onboarding');
  return data;
}

/**
 * Record a tool-readiness acknowledgement.
 *
 * Note there is NO key parameter and no field for one. `verification_method` says
 * HOW it was checked, never what was seen.
 */
export async function recordInternshipAcknowledgement(body: {
  requirement_key: RequirementKey;
  state: AcknowledgementState;
  verification_method?: string | null;
}): Promise<OnboardingView> {
  const { data } = await portalApi.post<OnboardingView>('/api/portal/internship/acknowledgements', body);
  return data;
}

export async function dismissInternshipCard(days = 14): Promise<void> {
  await portalApi.post('/api/portal/internship/card/dismiss', { days });
}

/**
 * Fire-and-forget analytics. Deliberately swallows its own errors: a metrics
 * call that rejects must never surface as a broken card, and an unhandled
 * rejection in a render effect is exactly how that happens.
 */
export function recordInternshipCardImpression(cardState: string): void {
  portalApi.post('/api/portal/internship/card/impression', { card_state: cardState })
    .catch(() => { /* analytics is best-effort */ });
}

export function recordInternshipCardOpened(cardState: string): void {
  portalApi.post('/api/portal/internship/card/opened', { card_state: cardState })
    .catch(() => { /* analytics is best-effort */ });
}
