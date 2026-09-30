/**
 * studentHealthAssessment/types — Reese Agentic AI Employee mission,
 * Checkpoint D (Capability 4: evidence-grounded assessment engine). Pure
 * types, no I/O. See StudentAssessment.ts for the persisted-row shape;
 * these are the module's working types used before/around persistence.
 */
import {
  StudentAssessmentConfidenceBand, StudentAssessmentRootCause, StudentAssessmentStatus,
} from '../../models/StudentAssessment';

export type { StudentAssessmentConfidenceBand, StudentAssessmentRootCause, StudentAssessmentStatus };

export const ROOT_CAUSES: StudentAssessmentRootCause[] = [
  'technical_blocker', 'conceptual_misunderstanding', 'environment_setup_problem',
  'time_management_problem', 'motivation_confidence_decline', 'missing_prerequisite',
  'instructor_dependency', 'project_scope_problem', 'certification_readiness_gap',
  'data_quality_uncertainty', 'unknown_conversation_required',
];

export const ASSESSMENT_STATUSES: StudentAssessmentStatus[] = ['on_track', 'watch', 'at_risk', 'critical', 'unknown'];

/**
 * The 5 signals this slice can honestly derive from a single point-in-time
 * StudentSuccessSnapshot. 'return_after_inactivity' and
 * 'consistent_weekly_progress' genuinely require comparing across multiple
 * assessment runs over time — deliberately NOT computed yet (never a guessed
 * true/false) until assessment history accumulates enough rows to compare
 * against. Extending to those 2 is real future scope, not a gap hidden here.
 */
export type PositiveMomentumSignal =
  | 'first_milestone' | 'improving_assessment_trend' | 'peer_contribution'
  | 'certification_readiness_milestone' | 'portfolio_ready_artifact';

/** The categories of getStudentSuccessSnapshot() this engine reasons over
 * (identity is structural context, not evidence; agreedNextSteps is always
 * not_applicable — both excluded from the evidence set). */
export const EVIDENCE_CATEGORIES = [
  'attendance', 'timelineProgress', 'assessmentTrend', 'reflectionCompletion',
  'competencyEvidence', 'projectProgress', 'certReadiness', 'artifactsEvidence',
  'communityActivity', 'ticketsInterventions', 'previousReeseCommunications', 'instructorFeedback',
] as const;
export type EvidenceCategory = typeof EVIDENCE_CATEGORIES[number];

export interface EvidenceCitation {
  category: EvidenceCategory;
  summary: string;
  sourceSystem: string;
  sourceRecordIds: string[];
  observedAt: string | null;
}

export interface ExcludedEvidence {
  category: EvidenceCategory;
  status: string;
  reliabilityReason: string | null;
}

/** Deterministic, code-computed inputs handed to the LLM prompt step — every
 * fact here is real (drawn from 'known' snapshot fields only); the LLM never
 * sees or is asked to invent evidence, only to interpret/select from this. */
export interface AssembledEvidence {
  enrollmentId: string;
  usable: EvidenceCitation[];
  excluded: ExcludedEvidence[];
  knownCount: number;
  totalRelevant: number;
  confidenceScore: number;
  confidenceBand: StudentAssessmentConfidenceBand;
  meetsMinimumBar: boolean;
  positiveMomentumSignals: PositiveMomentumSignal[];
}

/** The LLM's own contribution — an interpretation over already-real evidence,
 * never a source of new facts. Validated defensively before use; see
 * assessmentPrompt.ts's parseAssessmentResponse(). */
export interface LlmAssessmentJudgment {
  status: StudentAssessmentStatus;
  primaryRootCause: StudentAssessmentRootCause | null;
  secondaryRootCause: StudentAssessmentRootCause | null;
  supportingCategories: EvidenceCategory[];
  contradictingCategories: EvidenceCategory[];
  unansweredQuestions: string[];
  recommendedIntervention: string | null;
  requiresHumanReview: boolean;
}

export interface StudentAssessmentResult {
  id: string;
  enrollmentId: string;
  status: StudentAssessmentStatus;
  confidenceScore: number;
  confidenceBand: StudentAssessmentConfidenceBand;
  primaryRootCause: StudentAssessmentRootCause | null;
  secondaryRootCause: StudentAssessmentRootCause | null;
  supportingEvidence: EvidenceCitation[];
  contradictingEvidence: EvidenceCitation[];
  excludedEvidence: ExcludedEvidence[];
  positiveMomentumSignals: PositiveMomentumSignal[];
  unansweredQuestions: string[];
  recommendedIntervention: string | null;
  requiresHumanReview: boolean;
  reassessmentDate: string | null;
  rulesVersion: string;
  model: string | null;
  llmCostUsd: number | null;
  createdAt: string;
}
