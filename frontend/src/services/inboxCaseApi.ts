import api from '../utils/api';

// Frontend API client for the Inbox Intel — Case Resolution Engine, following
// the services/missedOpportunitiesApi.ts convention (a typed client module,
// not inline fetch calls in components) rather than the older inline
// utils/api pattern the Decisions/Drafts/Rules tabs use.

const BASE = '/api/admin/inbox/cases';
const STATS_URL = '/api/admin/inbox/case-stats';

export type CaseMode = 'PERSON' | 'TOPIC';
export type CaseState =
  | 'DISCOVERING' | 'ASSESSING' | 'NEEDS_ALI' | 'READY_TO_PLAN' | 'AWAITING_APPROVAL'
  | 'EXECUTING' | 'WAITING' | 'DELEGATED' | 'RESOLVED' | 'FAILED' | 'REOPENED';
export type ItemInclusionStatus = 'INCLUDED' | 'CANDIDATE' | 'EXCLUDED';
export type ItemDisposition = 'RESOLVED' | 'WAITING' | 'DELEGATED' | 'NEEDS_ALI' | 'SILENT_HOLD' | 'NO_ACTION' | 'PROTECTED' | 'FAILED';
export type ActionStatus = 'PROPOSED' | 'APPROVED' | 'REJECTED' | 'EXECUTING' | 'SUCCEEDED' | 'VERIFIED' | 'FAILED' | 'SKIPPED' | 'COMPENSATED';
export type ActionRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type DiscoveryWindow = '7d' | '30d' | '90d' | '1y' | 'all';

export interface MatchReason { kind: string; detail: string; weight: number }

export interface InboxCaseRecord {
  id: string;
  title: string;
  mode: CaseMode;
  normalized_query: string;
  state: CaseState;
  objective: string | null;
  summary: string | null;
  teaching_brief: TeachingBrief | null;
  assessment: CaseAssessment | null;
  recommendation: string | null;
  confidence: number | null;
  opened_by: string;
  opened_at: string;
  closed_at: string | null;
  last_verified_at: string | null;
  reopen_count: number;
}

export interface TeachingBrief {
  what_is_happening: string;
  why_it_matters: string;
  what_ali_is_deciding: string;
  root_cause: string | null;
  confirmed_vs_inferred: string;
  risk_of_acting: string;
  risk_of_delaying: string;
  recommended_decision: string;
  rationale: string;
}

export interface CaseAssessment {
  objective: string;
  current_state: string;
  summary: string;
  timeline: Array<{ occurred_at: string; summary: string; evidence: any[] }>;
  confirmed_facts: Array<{ statement: string; evidence: any[] }>;
  assumptions: Array<{ statement: string; confidence: number; evidence: any[] }>;
  contradictions: Array<{ statement: string; evidence: any[] }>;
  root_cause_assessment: string | null;
  impact: string;
  people_involved: Array<{ name: string; role: string }>;
  current_owner: string | null;
  commitments_made: Array<{ statement: string; owner: string; evidence: any[] }>;
  deadlines: Array<{ description: string; due_at: string | null; evidence: any[] }>;
  blockers: string[];
  missing_information: string[];
  decisions_required: string[];
  recommended_next_actions: string[];
  confidence: number;
}

export interface InboxCaseItemRecord {
  id: string;
  case_id: string;
  source_type: string;
  source_id: string;
  provider: string;
  source_url: string | null;
  title: string;
  occurred_at: string;
  match_score: string | number;
  match_reasons: MatchReason[];
  inclusion_status: ItemInclusionStatus;
  disposition: ItemDisposition | null;
  disposition_reason: string | null;
  snapshot: Record<string, any>;
  // AI's advisory verdict on a CANDIDATE item from the assessment's
  // "deeper look" — never auto-applied, informs but never replaces
  // Ali's own Include/Exclude call.
  ai_recommendation: 'INCLUDE' | 'EXCLUDE' | null;
  ai_recommendation_reason: string | null;
}

export interface InboxCaseQuestionRecord {
  id: string;
  case_id: string;
  question: string;
  why_required: string;
  choices: Array<{ label: string; consequence: string }>;
  recommended_answer: string | null;
  blocks_action_ids: string[];
  status: 'OPEN' | 'ANSWERED' | 'SKIPPED';
  answer: string | null;
}

export interface InboxCaseActionRecord {
  id: string;
  case_id: string;
  item_id: string | null;
  action_type: string;
  target_source: string;
  target_id: string | null;
  preview: string;
  payload: Record<string, any>;
  risk_level: ActionRiskLevel;
  requires_individual_approval: boolean;
  status: ActionStatus;
  depends_on_action_ids: string[];
  error_class: string | null;
  error_message: string | null;
}

export interface CaseDetail {
  case: InboxCaseRecord;
  items: InboxCaseItemRecord[];
  questions: InboxCaseQuestionRecord[];
  actions: InboxCaseActionRecord[];
  // The Tickets-board ticket tracking this case's work — every case gets
  // one, walked through backlog/todo/in_progress/in_review/done as the case
  // progresses (Ali: "All work should be done in a ticket by the agents").
  ticket_id: string | null;
}

export interface DiscoveredCaseSummary {
  caseId: string;
  title: string;
  itemCount: number;
  includedCount: number;
  candidateCount: number;
}

export interface AutoSyncResult {
  newCasesCreated: number;
  itemsAdded: number;
  emailsSkippedUnclassified: number;
}

export type SyncStage = 'fetching_email' | 'fetching_basecamp' | 'classifying' | 'clustering_and_removing_stale' | null;

export interface SyncStatus {
  inProgress: boolean;
  stage: SyncStage;
  startedAt: string | null;
  lastCompletedAt: string | null;
  lastResult: AutoSyncResult | null;
}

export const SYNC_STAGE_LABELS: Record<Exclude<SyncStage, null>, string> = {
  fetching_email: 'Checking your email…',
  fetching_basecamp: 'Checking Basecamp…',
  classifying: 'Filtering to what needs your attention…',
  clustering_and_removing_stale: 'Grouping related items and clearing anything deleted…',
};

export interface CaseStats {
  total: number;
  resolved: number;
  needs_ali: number;
  waiting: number;
  failed: number;
  state_breakdown: Array<{ state: string; count: number }>;
}

export interface InboxCaseEventRecord {
  id: string;
  case_id: string;
  item_id: string | null;
  action_id: string | null;
  event_type: string;
  actor_type: string;
  actor_id: string;
  previous_state: string | null;
  new_state: string | null;
  details: Record<string, any>;
  correlation_id: string;
  created_at: string;
}

// Plain-English labels for the case's real event history — grounded in
// every event_type actually emitted by backend/src/services/inboxCase/*
// and backend/src/controllers/inboxCaseController.ts. Anything not listed
// here (a future event type, or a one-off manual DB entry) falls back to
// a title-cased version of the raw event_type rather than being hidden.
const EVENT_LABELS: Record<string, string> = {
  case_discovery_started: 'Discovery started',
  case_discovery_completed: 'Discovery completed',
  assessment_completed: 'Assessment complete',
  assessment_failed: 'Assessment could not be generated automatically',
  question_answered: 'A blocking question was answered',
  candidate_included: 'A candidate item was included',
  candidate_excluded: 'A candidate item was excluded',
  candidate_manually_adjusted: 'An item was manually adjusted',
  item_disposition_changed: 'An item disposition was set',
  case_ready_to_plan_after_last_question_answered: 'Ready to plan — last question answered',
  plan_generated: 'Action plan generated',
  action_proposed: 'An action was proposed',
  action_approved: 'An action was approved',
  action_rejected: 'An action was rejected',
  action_execution_started: 'Execution started',
  action_execution_succeeded: 'An action succeeded',
  action_execution_failed: 'An action failed',
  action_execution_skipped_dependency_failed: 'An action was skipped (a dependency failed)',
  action_execution_reconciled_as_retryable: 'A stuck action was reset to retry safely',
  action_execution_reconciled_as_succeeded: 'A stuck action was confirmed already succeeded',
  case_execution_failed: 'Execution run had at least one failure',
  action_verified: 'An action was verified',
  case_verification_completed: 'Verification completed',
  case_resolved: 'Case closed',
  case_reopened: 'Case reopened',
  case_reassessing_after_reopen: 'Re-assessing after reopen',
  closure_blocked: 'Close Case was blocked — see the checklist',
  prompt_injection_signals_flagged: 'Unusual instruction-like text was flagged in the evidence (informational only)',
  knowledge_base_entry_proposed: 'A knowledge base entry was proposed from your answer',
  item_quick_resolved: 'An item was marked Handled/Ignore',
  action_override_applied: 'Your instruction replaced the proposed action(s)',
  action_override_failed: 'Your instruction could not be applied — the AI response was invalid',
  item_auto_dispositioned: 'An item was automatically marked resolved after its action was verified',
  item_removed_at_source: 'An item was removed — its source message was deleted from your inbox',
  case_dismissed: 'Case dismissed — not worth responding to',
};

export function humanizeCaseEvent(event: InboxCaseEventRecord): string {
  return EVENT_LABELS[event.event_type] || event.event_type.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

const ACTION_EVENT_TYPES = new Set([
  'action_proposed', 'action_approved', 'action_rejected', 'action_execution_started',
  'action_execution_succeeded', 'action_execution_failed', 'action_execution_skipped_dependency_failed',
  'action_execution_reconciled_as_retryable', 'action_execution_reconciled_as_succeeded', 'action_verified',
]);
const ITEM_EVENT_TYPES = new Set([
  'candidate_included', 'candidate_excluded', 'candidate_manually_adjusted', 'item_disposition_changed',
  'item_quick_resolved', 'item_auto_dispositioned', 'item_removed_at_source',
]);

/** Every case's Activity feed is correctly scoped to that case already (each
 *  event's `case_id` is real and distinct) — but `humanizeCaseEvent` alone
 *  produces a generic lifecycle-stage string that reads identically across
 *  DIFFERENT cases going through the same stages. This cross-references the
 *  event's `item_id`/`action_id` against the case's own already-loaded
 *  `items`/`actions` (no extra network call) plus `event.details`, so two
 *  cases' Activity lists read distinguishably instead of like a template.
 *  Falls back to `humanizeCaseEvent` whenever the referenced item/action
 *  can't be found (e.g. deleted) rather than throwing. */
export function describeCaseEvent(
  event: InboxCaseEventRecord,
  items: InboxCaseItemRecord[],
  actions: InboxCaseActionRecord[]
): string {
  const base = humanizeCaseEvent(event);
  const item = event.item_id ? items.find((i) => i.id === event.item_id) : undefined;
  const action = event.action_id ? actions.find((a) => a.id === event.action_id) : undefined;

  if (ACTION_EVENT_TYPES.has(event.event_type) && action) {
    const target = item ? ` for "${item.title}"` : '';
    const reason = typeof event.details?.reason === 'string' ? ` — ${event.details.reason}` : '';
    return `${base}: ${action.action_type}${target}${reason}`;
  }
  if (ITEM_EVENT_TYPES.has(event.event_type) && item) {
    return `${base}: "${item.title}"`;
  }
  if (event.event_type === 'case_discovery_started' && event.details?.mode && event.details?.query) {
    return `${base} — ${String(event.details.mode).toLowerCase()} search: "${event.details.query}"`;
  }
  if ((event.event_type === 'action_override_applied' || event.event_type === 'action_override_failed') && typeof event.details?.instruction === 'string') {
    const reason = event.event_type === 'action_override_failed' && typeof event.details?.reason === 'string' ? ` (${event.details.reason})` : '';
    return `${base}: "${event.details.instruction}"${reason}`;
  }
  return base;
}

export interface LastRunInfo {
  status: 'never' | 'success' | 'failed';
  at: string | null;
}

/** Most recent event matching either set of types, for a real "last run"
 *  indicator on a manual lifecycle step (Assess/Plan/Execute). There is no
 *  scheduled job for any of these — confirmed no cron references this system
 *  in schedulerService.ts, every step is a button click — so the events log
 *  is the only record of "when did this actually last run." `failureTypes`
 *  lets the caller show a distinct failed-attempt light rather than treating
 *  every matching event as a success. */
export function lastRunInfo(events: InboxCaseEventRecord[], successTypes: string[], failureTypes: string[] = []): LastRunInfo {
  const relevant = events.filter((e) => successTypes.includes(e.event_type) || failureTypes.includes(e.event_type));
  if (relevant.length === 0) return { status: 'never', at: null };
  const latest = relevant.reduce((a, b) => (new Date(a.created_at).getTime() >= new Date(b.created_at).getTime() ? a : b));
  return { status: failureTypes.includes(latest.event_type) ? 'failed' : 'success', at: latest.created_at };
}

export const inboxCaseApi = {
  discover: (mode: CaseMode, query: string, window: DiscoveryWindow = '90d') =>
    api.post<{ cases: DiscoveredCaseSummary[] }>(`${BASE}/discover`, { mode, query, window }).then((r) => r.data),

  list: (params: { state?: CaseState; mode?: CaseMode; page?: number; limit?: number; include_resolved?: boolean } = {}) =>
    api.get<{ total: number; cases: InboxCaseRecord[] }>(BASE, { params }).then((r) => r.data),

  syncNow: () => api.post<AutoSyncResult>(`${BASE}/sync-now`).then((r) => r.data),

  getSyncStatus: () => api.get<SyncStatus>(`${BASE}/sync-status`).then((r) => r.data),

  stats: () => api.get<CaseStats>(STATS_URL).then((r) => r.data),

  get: (caseId: string) => api.get<CaseDetail>(`${BASE}/${caseId}`).then((r) => r.data),

  assess: (caseId: string) => api.post(`${BASE}/${caseId}/assess`).then((r) => r.data),

  updateItem: (caseId: string, itemId: string, patch: { inclusion_status?: ItemInclusionStatus; disposition?: ItemDisposition; disposition_reason?: string }) =>
    api.patch(`${BASE}/${caseId}/items/${itemId}`, patch).then((r) => r.data),

  answerQuestion: (caseId: string, questionId: string, body: { answer?: string; accept_recommended?: boolean }) =>
    api.post(`${BASE}/${caseId}/questions/${questionId}/answer`, body).then((r) => r.data),

  generatePlan: (caseId: string) => api.post(`${BASE}/${caseId}/plan`).then((r) => r.data),

  approveAction: (caseId: string, actionId: string, editedPayload?: Record<string, any>) =>
    api.post(`${BASE}/${caseId}/actions/${actionId}/approve`, { edited_payload: editedPayload }).then((r) => r.data),

  rejectAction: (caseId: string, actionId: string, reason: string) =>
    api.post(`${BASE}/${caseId}/actions/${actionId}/reject`, { reason }).then((r) => r.data),

  approveLowRisk: (caseId: string) => api.post(`${BASE}/${caseId}/actions/approve-low-risk`).then((r) => r.data),

  execute: (caseId: string) => api.post(`${BASE}/${caseId}/execute`).then((r) => r.data),

  verify: (caseId: string) => api.post(`${BASE}/${caseId}/verify`).then((r) => r.data),

  close: (caseId: string) => api.post(`${BASE}/${caseId}/close`).then((r) => r.data),

  // One-click "not worth responding to" from the case list — clears every
  // blocker it safely can, then defers to the same real closeCase() guard
  // /close uses. On a 409 the caller's catch block reads
  // err.response.data.blockers, same shape /close already returns.
  dismiss: (caseId: string) => api.post<{ closed: boolean }>(`${BASE}/${caseId}/dismiss`).then((r) => r.data),

  reopen: (caseId: string, reason: string) => api.post(`${BASE}/${caseId}/reopen`, { reason }).then((r) => r.data),

  audit: (caseId: string) => api.get<{ events: InboxCaseEventRecord[] }>(`${BASE}/${caseId}/audit`).then((r) => r.data),

  quickResolve: (caseId: string, itemId: string, resolution: 'HANDLED' | 'IGNORE') =>
    api.post<{ dispositionSet: ItemDisposition; actionProposed: string | null }>(`${BASE}/${caseId}/items/${itemId}/quick-resolve`, { resolution }).then((r) => r.data),

  overrideActions: (caseId: string, instruction: string) =>
    api.post<{ rejected: string[]; proposed: string | null; failed?: boolean; failureReason?: string }>(`${BASE}/${caseId}/actions/override`, { instruction }).then((r) => r.data),
};
