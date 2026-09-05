import StudentAssessment from '../../models/StudentAssessment';
import { assessStudentHealth } from './assessStudentHealth';
import { EvidenceCitation, ExcludedEvidence, StudentAssessmentResult } from './types';

function toResult(row: StudentAssessment): StudentAssessmentResult {
  return {
    id: row.id,
    enrollmentId: row.enrollment_id,
    status: row.status,
    confidenceScore: row.confidence_score,
    confidenceBand: row.confidence_band,
    primaryRootCause: row.primary_root_cause,
    secondaryRootCause: row.secondary_root_cause,
    supportingEvidence: row.supporting_evidence as unknown as EvidenceCitation[],
    contradictingEvidence: row.contradicting_evidence as unknown as EvidenceCitation[],
    excludedEvidence: row.excluded_evidence as unknown as ExcludedEvidence[],
    positiveMomentumSignals: row.positive_momentum_signals as any,
    unansweredQuestions: row.unanswered_questions as any,
    recommendedIntervention: row.recommended_intervention,
    requiresHumanReview: row.requires_human_review,
    reassessmentDate: row.reassessment_date ? row.reassessment_date.toISOString() : null,
    rulesVersion: row.rules_version,
    model: row.model,
    llmCostUsd: row.llm_cost_usd != null ? Number(row.llm_cost_usd) : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Read-only, cheap DB lookup — the most recent assessment for one student, or
 * null if none has ever been run. No LLM call, safe to call from a hot path
 * (e.g. building a live prompt) without adding latency. */
export async function getLatestStudentAssessment(enrollmentId: string): Promise<StudentAssessmentResult | null> {
  const row = await StudentAssessment.findOne({ where: { enrollment_id: enrollmentId }, order: [['created_at', 'DESC']] });
  return row ? toResult(row) : null;
}

/**
 * Opportunistic, cost-bounded refresh. Real trigger for Checkpoint D's engine
 * now that it's wired into Reese's reply pipeline (reeseReplyService.ts) as a
 * fire-and-forget call after a real reply is sent — Ali explicitly chose not
 * to add a dedicated reassessment cron for this slice, so real student
 * activity (messaging Reese) is what keeps assessment history current.
 *
 * Only calls the expensive assessStudentHealth() (a real LLM call) when
 * genuinely due: no assessment exists yet, or the existing one's own
 * reassessment_date has already passed. The cadence set by the LAST
 * assessment's own severity (critical:+3d .. on_track:+30d,
 * evidenceAssembly.ts's REASSESSMENT_DAYS) is what naturally rate-limits
 * this — a healthy, frequently-messaging student is not reassessed on every
 * single message.
 */
export async function maybeRefreshStudentAssessment(enrollmentId: string): Promise<void> {
  const latest = await StudentAssessment.findOne({
    where: { enrollment_id: enrollmentId },
    order: [['created_at', 'DESC']],
    attributes: ['reassessment_date'],
  });
  if (latest?.reassessment_date && latest.reassessment_date.getTime() > Date.now()) return;
  await assessStudentHealth(enrollmentId);
}
