// Shared TypeScript contracts for the Inbox Intel — Case Resolution Engine.
// This is the single source of truth for the case state machine, disposition
// set, action taxonomy, and match-scoring vocabulary. Sequelize models,
// Zod schemas, services, and the frontend api client all derive from these
// types so a contract change is a one-file diff, not a hunt across the tree.

export type CaseMode = 'PERSON' | 'TOPIC';

export const CASE_STATES = [
  'DISCOVERING',
  'ASSESSING',
  'NEEDS_ALI',
  'READY_TO_PLAN',
  'AWAITING_APPROVAL',
  'EXECUTING',
  'WAITING',
  'DELEGATED',
  'RESOLVED',
  'FAILED',
  'REOPENED',
] as const;
export type CaseState = (typeof CASE_STATES)[number];

// Valid forward transitions. REOPENED can fall back into ASSESSING via a
// separate explicit reopen operation (see caseStateMachine.ts) rather than
// being reachable through this table, since reopening is a special reset,
// not a normal workflow step.
export const CASE_STATE_TRANSITIONS: Record<CaseState, CaseState[]> = {
  DISCOVERING: ['ASSESSING', 'FAILED'],
  ASSESSING: ['NEEDS_ALI', 'READY_TO_PLAN', 'FAILED'],
  NEEDS_ALI: ['ASSESSING', 'READY_TO_PLAN', 'FAILED'],
  READY_TO_PLAN: ['AWAITING_APPROVAL', 'NEEDS_ALI', 'FAILED'],
  AWAITING_APPROVAL: ['EXECUTING', 'READY_TO_PLAN', 'FAILED'],
  EXECUTING: ['WAITING', 'DELEGATED', 'RESOLVED', 'FAILED'],
  WAITING: ['ASSESSING', 'RESOLVED', 'REOPENED', 'FAILED'],
  DELEGATED: ['ASSESSING', 'RESOLVED', 'REOPENED', 'FAILED'],
  RESOLVED: ['REOPENED'],
  // EXECUTING added so a failed action's "Retry Failed" can actually
  // retry — without it, one transient action failure (e.g. a Gmail rate
  // limit) permanently locked the case out of ever executing again,
  // since FAILED had no path back into EXECUTING.
  FAILED: ['ASSESSING', 'READY_TO_PLAN', 'EXECUTING'],
  REOPENED: ['ASSESSING'],
};

export const ITEM_DISPOSITIONS = [
  'RESOLVED',
  'WAITING',
  'DELEGATED',
  'NEEDS_ALI',
  'SILENT_HOLD',
  'NO_ACTION',
  'PROTECTED',
  'FAILED',
] as const;
export type ItemDisposition = (typeof ITEM_DISPOSITIONS)[number];

export const ITEM_INCLUSION_STATUSES = ['INCLUDED', 'CANDIDATE', 'EXCLUDED'] as const;
export type ItemInclusionStatus = (typeof ITEM_INCLUSION_STATUSES)[number];

// AI's advisory fit verdict for a CANDIDATE item, produced by Run
// Assessment's "deeper look" — never auto-applied to inclusion_status.
export const AI_ITEM_RECOMMENDATIONS = ['INCLUDE', 'EXCLUDE'] as const;
export type AiItemRecommendation = (typeof AI_ITEM_RECOMMENDATIONS)[number];

export const CASE_SOURCE_TYPES = [
  'email',
  'sent_email',
  'basecamp_todo',
  'basecamp_comment',
  'basecamp_message',
  'attachment',
] as const;
export type CaseSourceType = (typeof CASE_SOURCE_TYPES)[number];

export const CASE_PROVIDERS = ['gmail_colaberry', 'gmail_personal', 'hotmail', 'basecamp'] as const;
export type CaseProvider = (typeof CASE_PROVIDERS)[number];

export const ACTION_TYPES = [
  'EMAIL_DRAFT',
  'EMAIL_SEND',
  'EMAIL_ARCHIVE',
  'EMAIL_LABEL',
  'BASECAMP_COMMENT',
  'BASECAMP_UPDATE_TODO',
  'BASECAMP_COMPLETE_TODO',
  'BASECAMP_CREATE_TODO',
  'BASECAMP_ASSIGN_TODO',
  'CREATE_FOLLOWUP',
  'MARK_WAITING',
  'MARK_DELEGATED',
  'NO_ACTION',
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

// Actions that always require individual (non-bundled) approval regardless
// of autonomy level, per root directive section 10.
export const ALWAYS_INDIVIDUAL_APPROVAL: ActionType[] = [
  'EMAIL_SEND',
  'BASECAMP_COMMENT',
  'BASECAMP_UPDATE_TODO',
  'BASECAMP_COMPLETE_TODO',
  'BASECAMP_CREATE_TODO',
  'BASECAMP_ASSIGN_TODO',
];

// Archive/label actions must execute LAST among a case's approved actions,
// and only after every non-archive action they depend on has verified.
export const ARCHIVE_ACTION_TYPES: ActionType[] = ['EMAIL_ARCHIVE', 'EMAIL_LABEL'];

export const ACTION_STATUSES = [
  'PROPOSED',
  'APPROVED',
  'REJECTED',
  'EXECUTING',
  'SUCCEEDED',
  'VERIFIED',
  'FAILED',
  'SKIPPED',
  'COMPENSATED',
] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

export const ACTION_STATE_TRANSITIONS: Record<ActionStatus, ActionStatus[]> = {
  PROPOSED: ['APPROVED', 'REJECTED', 'SKIPPED'],
  APPROVED: ['EXECUTING', 'REJECTED', 'SKIPPED'],
  REJECTED: [],
  EXECUTING: ['SUCCEEDED', 'FAILED'],
  SUCCEEDED: ['VERIFIED', 'FAILED'],
  VERIFIED: ['COMPENSATED'],
  FAILED: ['EXECUTING', 'SKIPPED', 'COMPENSATED'],
  SKIPPED: [],
  COMPENSATED: [],
};

export const ACTION_RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type ActionRiskLevel = (typeof ACTION_RISK_LEVELS)[number];

export const ALIAS_TYPES = ['email', 'display_name', 'company_domain', 'basecamp_person_id', 'name_variation'] as const;
export type AliasType = (typeof ALIAS_TYPES)[number];

export const QUESTION_STATUSES = ['OPEN', 'ANSWERED', 'SKIPPED'] as const;
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];

export const AUTONOMY_LEVELS = ['READ_ONLY', 'PREPARE', 'EXECUTE_APPROVED', 'TRUSTED_LOW_RISK_RULES'] as const;
export type AutonomyLevel = (typeof AUTONOMY_LEVELS)[number];

// Production-safe default per root directive section 10.
export const DEFAULT_AUTONOMY_LEVEL: AutonomyLevel = 'EXECUTE_APPROVED';

export type MatchReasonKind =
  | 'exact_thread_id'
  | 'exact_message_id_reference'
  | 'exact_basecamp_url'
  | 'exact_basecamp_recording_id'
  | 'exact_email_address'
  | 'exact_basecamp_person_id'
  | 'exact_normalized_company_or_project'
  | 'same_participants'
  | 'same_normalized_subject'
  | 'name_alias'
  | 'close_date'
  | 'matching_attachment_name'
  | 'same_basecamp_project'
  | 'semantic_similarity'
  | 'generic_terminology'
  | 'ambiguous_first_name_only';

export interface MatchReason {
  kind: MatchReasonKind;
  detail: string;
  /** Signed contribution to the match score, 0-1 scale. */
  weight: number;
}

// Evidence-tier thresholds, per root directive section 6 ("Connect").
export const MATCH_THRESHOLD_AUTO_INCLUDE = 0.85;
export const MATCH_THRESHOLD_CANDIDATE = 0.65;

export function bandForScore(score: number): ItemInclusionStatus {
  if (score >= MATCH_THRESHOLD_AUTO_INCLUDE) return 'INCLUDED';
  if (score >= MATCH_THRESHOLD_CANDIDATE) return 'CANDIDATE';
  return 'EXCLUDED';
}

export type DiscoveryWindow = '7d' | '30d' | '90d' | '1y' | 'all';

export const DISCOVERY_WINDOW_DAYS: Record<DiscoveryWindow, number | null> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '1y': 365,
  all: null,
};

// ---- Assessment (Assess/Teach/Ask) structured output ----

export interface EvidenceRef {
  item_id: string;
  source_type: CaseSourceType;
  quote?: string;
}

export interface TimelineEntry {
  occurred_at: string;
  summary: string;
  evidence: EvidenceRef[];
}

export interface CaseAssessment {
  objective: string;
  current_state: string;
  summary: string;
  timeline: TimelineEntry[];
  confirmed_facts: Array<{ statement: string; evidence: EvidenceRef[] }>;
  assumptions: Array<{ statement: string; confidence: number; evidence: EvidenceRef[] }>;
  contradictions: Array<{ statement: string; evidence: EvidenceRef[] }>;
  root_cause_assessment: string | null;
  impact: string;
  people_involved: Array<{ name: string; role: string }>;
  current_owner: string | null;
  commitments_made: Array<{ statement: string; owner: string; evidence: EvidenceRef[] }>;
  deadlines: Array<{ description: string; due_at: string | null; evidence: EvidenceRef[] }>;
  blockers: string[];
  missing_information: string[];
  decisions_required: string[];
  recommended_next_actions: string[];
  confidence: number;
}

export interface TeachMeBrief {
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

export interface QuestionChoice {
  label: string;
  consequence: string;
}

export interface CaseQuestionPayload {
  question: string;
  why_required: string;
  choices: QuestionChoice[];
  recommended_answer: string | null;
  blocks_action_ids: string[];
}
