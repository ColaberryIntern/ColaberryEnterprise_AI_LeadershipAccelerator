import { LifecycleStage } from './lifecycle';

/**
 * WHICH PEOPLE a section lets you see — the row-level half of the 360 profile.
 *
 * The section gate answers "may you open the People surface at all". It does not
 * answer "whose records may you read", and for a consolidated person view those
 * are different questions. The Support role is the case that makes it concrete:
 * its only grant is `students`, so it may open People — but a roster that then
 * returned leads and prospects would have handed Support the entire acquisition
 * database on the strength of a student-support grant. Nothing in the section
 * check would have caught it, because the section check already passed.
 *
 * So visibility is scoped twice: by SECTION (may you open it) and by LIFECYCLE
 * STAGE (whose rows come back). This module owns the second, and it must be
 * applied in the QUERY — hiding rows in the UI leaves the API returning them.
 *
 * This is deliberately a widening of enforcement, never of access: every stage
 * granted below is one the section already exposed on its existing pages.
 */

/**
 * The stages each section may see. Absent section = no person rows at all
 * (deny by default), which is why `lead_ingestion`, `dashboard`, `system`,
 * `intelligence`, `campaigns`, `trust`, `war_room` and `inbox_content` are not
 * listed — they grant tooling, not people.
 */
const SECTION_STAGES: Record<string, readonly LifecycleStage[]> = {
  // The lead queue and pipeline: acquisition, up to but not including enrolment.
  leads: ['anonymous_visitor', 'identified_visitor', 'lead', 'applicant'],
  // Revenue sees anyone who has or could have a billing relationship.
  revenue: ['lead', 'applicant', 'enrolled_student', 'graduate', 'returning_customer'],
  // The Support student-story surface: enrolled people only, never prospects.
  students: ['enrolled_student', 'active_learner', 'graduate'],
  // Program/curriculum management sees the people in the programme.
  program: ['enrolled_student', 'active_learner', 'graduate'],
  // Portfolio review sees learners — and is narrowed AGAIN per mentor.
  career_review: ['enrolled_student', 'active_learner', 'graduate'],
};

/**
 * The stages an identity may see, as the union of its sections.
 *
 * Union rather than intersection: a revenue rep who is also given `students`
 * should see both populations, not the overlap.
 */
export function visibleStagesForSections(sections: readonly string[]): LifecycleStage[] {
  const stages = new Set<LifecycleStage>();
  for (const section of sections) {
    for (const stage of SECTION_STAGES[section] ?? []) stages.add(stage);
  }
  return [...stages];
}

/** May this identity see person records at this stage at all? */
export function canSeeStage(sections: readonly string[], stage: LifecycleStage): boolean {
  return visibleStagesForSections(sections).includes(stage);
}

/** Does this identity get any person rows at all? Gates the People surface. */
export function hasAnyPersonScope(sections: readonly string[]): boolean {
  return visibleStagesForSections(sections).length > 0;
}

/**
 * Sections that narrow FURTHER than the stage list, per record.
 *
 * `career_review` is the live example: careerMentorScopeService restricts a
 * mentor to the learners they actually mentor, so the stage list is the ceiling
 * and not the answer. Recorded here so a People query cannot treat the stage
 * scope as sufficient and quietly widen a mentor to every learner on the
 * platform — which is precisely what mgmtRoles warns about.
 */
export const SECTIONS_WITH_PER_RECORD_SCOPE: readonly string[] = ['career_review'];

export function needsPerRecordScope(sections: readonly string[]): string[] {
  return sections.filter((s) => SECTIONS_WITH_PER_RECORD_SCOPE.includes(s));
}
