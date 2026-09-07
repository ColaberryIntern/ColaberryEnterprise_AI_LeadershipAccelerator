/**
 * checklistDefinitions — Reese Agentic AI Employee mission, Capability 6
 * ("Stateful work plans and mandatory checklists"). Pure data, verbatim from
 * the mission's own Assessment (13 items) and Outreach (10 items)
 * checklists. Closure is also named in the mission text but is a real,
 * separately scoped future slice — not defined here ahead of its own wiring
 * (this repo's own "don't build for hypothetical future requirements"
 * rule); it touches a distinct chokepoint (ticket closure) that needs its
 * own scoping pass.
 *
 * `required: false` items are tracked and displayed but never gate.
 * Assessment: the 5 "review X" items cover evidence categories that
 * legitimately vary by real data availability (e.g. a brand-new enrollment
 * has no project activity yet), so treating their absence as a process
 * failure would block Reese's own assessment awareness for ordinary data
 * sparsity, not an actual defect. Outreach: `validate_evidence_reliability`
 * is honestly, always incomplete today — see outreachChecklist.ts's own
 * header for the real, disclosed gap this documents rather than papers
 * over.
 *
 * `required: true` items cover identity/eligibility and each engine's own
 * structural guarantees — these should never legitimately be false for a
 * completed run today, so persisting them as real checked items is
 * defensive: if a future code change ever broke one of those guarantees,
 * this is what would catch and disclose it, not silently pass.
 */

export type ChecklistType = 'assessment' | 'outreach';

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

export const OUTREACH_CHECKLIST_ITEMS: ChecklistItemDefinition[] = [
  { key: 'confirm_eligible_population', label: 'Confirm eligible population', required: true },
  { key: 'validate_evidence_reliability', label: 'Validate evidence reliability', required: false },
  { key: 'check_cadence_and_cap', label: 'Check cadence and daily cap', required: true },
  { key: 'check_duplicate_open_intervention', label: 'Check for duplicate/open intervention', required: true },
  { key: 'confirm_authorization_before_send', label: 'Confirm authorization before send', required: true },
  { key: 'state_only_supported_observations', label: 'State only supported observations', required: true },
  { key: 'provide_one_clear_next_step', label: 'Provide one clear next step', required: true },
  { key: 'define_success_criteria', label: 'Define success criteria', required: true },
  { key: 'set_follow_up_date', label: 'Set follow-up date', required: true },
  { key: 'link_to_work_ledger', label: 'Link the communication to the work ledger', required: true },
];

export const CHECKLIST_DEFINITIONS: Record<ChecklistType, ChecklistItemDefinition[]> = {
  assessment: ASSESSMENT_CHECKLIST_ITEMS,
  outreach: OUTREACH_CHECKLIST_ITEMS,
};
