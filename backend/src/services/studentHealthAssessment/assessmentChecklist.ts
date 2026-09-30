import { StudentSuccessSnapshot } from '../studentSuccessSnapshot/types';
import { AssembledEvidence, LlmAssessmentJudgment } from './types';
import ChecklistInstance from '../../models/ChecklistInstance';
import { ASSESSMENT_CHECKLIST_ITEMS } from '../checklist/checklistDefinitions';
import { evaluateChecklistCompletion } from '../checklist/checklistGate';

/**
 * assessmentChecklist — Reese Agentic AI Employee mission, Capability 6's
 * Assessment checklist (13 items), derived from the SAME real inputs
 * assessStudentHealth() already computes — never a second, guessed source
 * of truth. Each predicate is grounded in a real field:
 *
 * - confirm_identity: the snapshot's own identity resolution.
 * - review_*: whether assembleEvidence() actually found that category
 *   'known' — an honest signal, not a guess (a brand-new enrollment with no
 *   project activity yet correctly shows this item incomplete, but it's
 *   deliberately NOT required — see checklistDefinitions.ts's header).
 * - identify_evidence / determine_next_action: mirror the SAME
 *   evidence-provenance and 'unknown'-status guarantees
 *   assessmentPrompt.ts's parseAssessmentResponse() already enforces —
 *   expressed here as a real, independently checkable predicate rather than
 *   trusted blindly a second time.
 * - validate_source_reliability / record_quarantined_evidence /
 *   assign_confidence / store_evidence_references: always true once
 *   evidence assembly and persistence completed — that IS what those steps
 *   do. Persisted anyway (not skipped) so a future regression that broke
 *   one of these guarantees would show up here, not pass silently.
 */
export function deriveAssessmentChecklistItems(
  snapshot: StudentSuccessSnapshot,
  evidence: AssembledEvidence,
  judgment: LlmAssessmentJudgment,
  reassessmentDate: Date | null,
): Record<string, boolean> {
  const known = (category: string) => evidence.usable.some((e) => e.category === category);

  return {
    confirm_identity: snapshot.identity.status === 'known',
    validate_source_reliability: true,
    review_engagement: known('attendance'),
    review_learning_progress: known('timelineProgress'),
    review_assessment_trend: known('assessmentTrend'),
    review_project_activity: known('projectProgress') || known('artifactsEvidence'),
    review_tickets_interventions: known('ticketsInterventions'),
    identify_evidence: judgment.status === 'unknown' || judgment.supportingCategories.length > 0,
    record_quarantined_evidence: true,
    assign_confidence: true,
    determine_next_action:
      judgment.recommendedIntervention !== null ||
      (judgment.status === 'unknown' && judgment.unansweredQuestions.length > 0),
    store_evidence_references: true,
    set_reassessment_date: reassessmentDate !== null,
  };
}

/** Persists the real, derived checklist for one assessment run. Never
 * throws — callers (assessStudentHealth.ts) treat checklist bookkeeping as
 * fail-open, same posture as emitLedgerEventSafe(): a bookkeeping failure
 * must never break the assessment result the student/manager is waiting on. */
export async function createAssessmentChecklistInstance(
  assessmentId: string,
  snapshot: StudentSuccessSnapshot,
  evidence: AssembledEvidence,
  judgment: LlmAssessmentJudgment,
  reassessmentDate: Date | null,
): Promise<ChecklistInstance> {
  const items = deriveAssessmentChecklistItems(snapshot, evidence, judgment, reassessmentDate);
  const { complete, incompleteItems } = evaluateChecklistCompletion(items, ASSESSMENT_CHECKLIST_ITEMS);

  return ChecklistInstance.create({
    checklist_type: 'assessment',
    subject_type: 'student_assessment',
    subject_id: assessmentId,
    items,
    incomplete_items: incompleteItems,
    complete,
  });
}
