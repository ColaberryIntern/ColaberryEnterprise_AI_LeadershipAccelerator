/**
 * checklistDefinitions — Reese Agentic AI Employee mission, Capability 6
 * ("Stateful work plans and mandatory checklists"). Pure data, verbatim from
 * the mission's own Assessment checklist (13 items). Outreach and Closure
 * checklists are also named in the mission text but are real, separately
 * scoped future slices — not defined here ahead of their own wiring (this
 * repo's own "don't build for hypothetical future requirements" rule).
 *
 * `required: false` items are tracked and displayed but never gate — they
 * cover evidence categories that legitimately vary by real data
 * availability (e.g. a brand-new enrollment has no project activity yet),
 * so treating their absence as a process failure would block Reese's own
 * assessment awareness for ordinary data sparsity, not an actual defect.
 * `required: true` items cover identity and the assessment engine's own
 * structural guarantees (evidence-provenance, confidence assignment,
 * reassessment scheduling) — these should never legitimately be false for a
 * completed run today, so persisting them as real checked items is
 * defensive: if a future code change ever broke one of those guarantees,
 * this is what would catch and disclose it, not silently pass.
 */

export type ChecklistType = 'assessment';

export interface ChecklistItemDefinition {
  key: string;
  label: string;
  required: boolean;
}

export const ASSESSMENT_CHECKLIST_ITEMS: ChecklistItemDefinition[] = [
  { key: 'confirm_identity', label: 'Confirm student/cohort identity', required: true },
  { key: 'validate_source_reliability', label: 'Validate source freshness and reliability', required: true },
  { key: 'review_engagement', label: 'Review engagement', required: false },
  { key: 'review_learning_progress', label: 'Review learning progress', required: false },
  { key: 'review_assessment_trend', label: 'Review assessment trend', required: false },
  { key: 'review_project_activity', label: 'Review project/repository activity', required: false },
  { key: 'review_tickets_interventions', label: 'Review open tickets and prior interventions', required: false },
  { key: 'identify_evidence', label: 'Identify supporting and conflicting evidence', required: true },
  { key: 'record_quarantined_evidence', label: 'Record quarantined evidence', required: true },
  { key: 'assign_confidence', label: 'Assign confidence', required: true },
  { key: 'determine_next_action', label: 'Determine authorized next action', required: true },
  { key: 'store_evidence_references', label: 'Store evidence references', required: true },
  { key: 'set_reassessment_date', label: 'Set reassessment date', required: true },
];

export const CHECKLIST_DEFINITIONS: Record<ChecklistType, ChecklistItemDefinition[]> = {
  assessment: ASSESSMENT_CHECKLIST_ITEMS,
};
