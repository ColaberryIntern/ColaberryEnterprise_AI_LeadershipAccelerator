import api from '../utils/api';
import { FieldStatus } from './studentSuccessSnapshotApi';

// Mirrors backend/src/services/studentHealthAssessment/types.ts — redeclared
// here rather than imported across the frontend/backend boundary (matches
// this codebase's own convention, see studentSuccessSnapshotApi.ts).

export type AssessmentStatus = 'on_track' | 'watch' | 'at_risk' | 'critical' | 'unknown';
export type ConfidenceBand = 'high' | 'moderate' | 'low' | 'insufficient_evidence';
export type RootCause =
  | 'technical_blocker' | 'conceptual_misunderstanding' | 'environment_setup_problem'
  | 'time_management_problem' | 'motivation_confidence_decline' | 'missing_prerequisite'
  | 'instructor_dependency' | 'project_scope_problem' | 'certification_readiness_gap'
  | 'data_quality_uncertainty' | 'unknown_conversation_required';
export type PositiveMomentumSignal =
  | 'first_milestone' | 'improving_assessment_trend' | 'return_after_inactivity'
  | 'consistent_weekly_progress' | 'peer_contribution' | 'certification_readiness_milestone'
  | 'portfolio_ready_artifact';

// The evidence category keys getStudentSuccessSnapshot() assembles evidence
// from — reused here by name only (a plain string on the wire), not imported.
export type EvidenceCategory = string;

export interface EvidenceCitation {
  category: EvidenceCategory;
  summary: string;
  sourceSystem: string;
  sourceRecordIds: string[];
  observedAt: string | null;
}

export interface ExcludedEvidence {
  category: EvidenceCategory;
  status: FieldStatus;
  reliabilityReason: string | null;
}

export interface StudentAssessment {
  id: string;
  enrollmentId: string;
  status: AssessmentStatus;
  confidenceScore: number;
  confidenceBand: ConfidenceBand;
  primaryRootCause: RootCause | null;
  secondaryRootCause: RootCause | null;
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

export async function fetchAssessmentHistory(enrollmentId: string): Promise<StudentAssessment[]> {
  const { data } = await api.get<{ assessments: StudentAssessment[] }>(
    `/api/admin/accelerator/enrollments/${enrollmentId}/assessment-history`,
  );
  return data.assessments;
}
