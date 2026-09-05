import { chatJson } from '../runtime/runtimeAi';
import { DEFAULT_MODEL } from '../components/costEstimationService';
import { getStudentSuccessSnapshot } from '../studentSuccessSnapshot';
import StudentAssessment from '../../models/StudentAssessment';
import { assembleEvidence } from './evidenceAssembly';
import { buildAssessmentSystemPrompt, buildAssessmentUserPrompt, parseAssessmentResponse } from './assessmentPrompt';
import { EvidenceCitation, LlmAssessmentJudgment, StudentAssessmentResult } from './types';

/**
 * studentHealthAssessment — Reese Agentic AI Employee mission, Checkpoint D
 * (Capability 4: evidence-grounded assessment engine). Confirmed absent
 * anywhere in this codebase at discovery — the only prior art,
 * `agents/departments/education/studentSuccessAgent.ts`, checks
 * `Enrollment.progress` and `Enrollment.updated_at`, neither of which exist
 * on that model (`timestamps: false`, no `progress` column); both checks are
 * dead code that silently never fires. Not reused, not extended.
 *
 * Design: evidenceAssembly.ts deterministically partitions
 * getStudentSuccessSnapshot() into usable ('known') vs excluded evidence and
 * computes a REAL confidence score from evidence coverage — never an LLM
 * self-reported number (LLMs are poorly calibrated on their own confidence;
 * CLAUDE.md's own governing principle is "LLMs are probabilistic, production
 * systems must be deterministic"). The LLM's only job is to interpret
 * already-real, pre-vetted evidence into a status/root-cause judgment; it
 * never authors evidence text, and every field of its response is validated
 * against a fixed enum or dropped (assessmentPrompt.ts's
 * parseAssessmentResponse()). Below a minimum evidence bar, no LLM call is
 * made at all — the mission's own rule applies verbatim: "insufficient
 * evidence must return unknown; do not manufacture confidence."
 *
 * ONE IMMUTABLE ROW PER RUN (StudentAssessment.ts) — this is a point-in-time
 * judgment, not a living record; assessment HISTORY is the point.
 *
 * Kept in its own file (not index.ts) so latestAssessment.ts can import
 * assessStudentHealth() without index.ts <-> latestAssessment.ts forming a
 * circular re-export — CLAUDE.md forbids circular module dependencies.
 */

const RULES_VERSION = 'checkpoint-d-v1';

const REASSESSMENT_DAYS: Record<string, number> = {
  critical: 3, at_risk: 7, watch: 14, on_track: 30, unknown: 7,
};

function computeReassessmentDate(status: string): Date {
  const days = REASSESSMENT_DAYS[status] ?? 7;
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

function resolveEvidenceCitations(categories: string[], usable: EvidenceCitation[]): EvidenceCitation[] {
  const byCategory = new Map(usable.map((e) => [e.category, e]));
  return categories.map((c) => byCategory.get(c as any)).filter((e): e is EvidenceCitation => !!e);
}

export async function assessStudentHealth(enrollmentId: string): Promise<StudentAssessmentResult> {
  const snapshot = await getStudentSuccessSnapshot(enrollmentId);
  const evidence = assembleEvidence(snapshot);

  let judgment: LlmAssessmentJudgment;
  let model: string | null = null;
  let llmCostUsd: number | null = null;

  if (!evidence.meetsMinimumBar) {
    judgment = {
      status: 'unknown',
      primaryRootCause: 'unknown_conversation_required',
      secondaryRootCause: null,
      supportingCategories: [],
      contradictingCategories: [],
      unansweredQuestions: ['Not enough known evidence exists yet for a real assessment — a direct conversation with the student is the fastest way to close this gap.'],
      recommendedIntervention: null,
      requiresHumanReview: false,
    };
  } else {
    try {
      const { parsed, cost_usd } = await chatJson(
        'student_health_assessment',
        buildAssessmentSystemPrompt(),
        buildAssessmentUserPrompt(evidence),
        DEFAULT_MODEL,
      );
      judgment = parseAssessmentResponse(parsed, evidence);
      model = DEFAULT_MODEL;
      llmCostUsd = cost_usd;
    } catch {
      judgment = parseAssessmentResponse(null, evidence);
    }
  }

  const supportingEvidence = resolveEvidenceCitations(judgment.supportingCategories, evidence.usable);
  const contradictingEvidence = resolveEvidenceCitations(judgment.contradictingCategories, evidence.usable);
  const reassessmentDate = computeReassessmentDate(judgment.status);

  const row = await StudentAssessment.create({
    enrollment_id: enrollmentId,
    status: judgment.status,
    confidence_score: evidence.confidenceScore,
    confidence_band: evidence.confidenceBand,
    primary_root_cause: judgment.primaryRootCause,
    secondary_root_cause: judgment.secondaryRootCause,
    supporting_evidence: supportingEvidence,
    contradicting_evidence: contradictingEvidence,
    excluded_evidence: evidence.excluded,
    positive_momentum_signals: evidence.positiveMomentumSignals,
    unanswered_questions: judgment.unansweredQuestions,
    recommended_intervention: judgment.recommendedIntervention,
    requires_human_review: judgment.requiresHumanReview,
    reassessment_date: reassessmentDate,
    rules_version: RULES_VERSION,
    model,
    llm_cost_usd: llmCostUsd,
  });

  return {
    id: row.id,
    enrollmentId,
    status: row.status,
    confidenceScore: row.confidence_score,
    confidenceBand: row.confidence_band,
    primaryRootCause: row.primary_root_cause,
    secondaryRootCause: row.secondary_root_cause,
    supportingEvidence,
    contradictingEvidence,
    excludedEvidence: evidence.excluded,
    positiveMomentumSignals: evidence.positiveMomentumSignals,
    unansweredQuestions: judgment.unansweredQuestions,
    recommendedIntervention: judgment.recommendedIntervention,
    requiresHumanReview: judgment.requiresHumanReview,
    reassessmentDate: reassessmentDate.toISOString(),
    rulesVersion: RULES_VERSION,
    model,
    llmCostUsd,
    createdAt: row.createdAt.toISOString(),
  };
}
