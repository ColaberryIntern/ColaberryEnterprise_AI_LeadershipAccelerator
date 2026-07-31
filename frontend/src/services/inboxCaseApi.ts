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

export interface CaseStats {
  total: number;
  resolved: number;
  needs_ali: number;
  waiting: number;
  failed: number;
  state_breakdown: Array<{ state: string; count: number }>;
}

export const inboxCaseApi = {
  discover: (mode: CaseMode, query: string, window: DiscoveryWindow = '90d') =>
    api.post<{ cases: DiscoveredCaseSummary[] }>(`${BASE}/discover`, { mode, query, window }).then((r) => r.data),

  list: (params: { state?: CaseState; mode?: CaseMode; page?: number; limit?: number } = {}) =>
    api.get<{ total: number; cases: InboxCaseRecord[] }>(BASE, { params }).then((r) => r.data),

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

  reopen: (caseId: string, reason: string) => api.post(`${BASE}/${caseId}/reopen`, { reason }).then((r) => r.data),

  audit: (caseId: string) => api.get(`${BASE}/${caseId}/audit`).then((r) => r.data),
};
