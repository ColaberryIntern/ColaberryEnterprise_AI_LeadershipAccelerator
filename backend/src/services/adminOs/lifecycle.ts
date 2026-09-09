/**
 * The canonical lifecycle vocabulary for the whole admin portal.
 *
 * ONE WORD, ONE MEANING. Today "lead", "engaged", "active student" and
 * "conversion" are each defined in several places and agree by luck. This module
 * is the single definition; every dashboard, metric and roster must import from
 * here rather than restate it.
 *
 * WHY A STAGE IS DEFINED BY EVIDENCE, NOT BY A STATUS COLUMN. Discovery found
 * `chat_conversations.status` set to 'active' on 100% of rows because nothing
 * ever transitions it — a column that was never maintained, read literally,
 * produced "129 live chats" when 7 were real. Stages here are therefore defined
 * by the record that proves them, and each carries the evidence it requires.
 */

export const LIFECYCLE_STAGES = [
  'anonymous_visitor',
  'identified_visitor',
  'lead',
  'applicant',
  'enrolled_student',
  'active_learner',
  'graduate',
  'lapsed',
  'returning_customer',
] as const;

export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

export interface LifecycleStageDef {
  stage: LifecycleStage;
  label: string;
  /** What must be true for a person to be at this stage, in plain language. */
  definition: string;
  /** The record whose existence proves the stage. Stages are evidenced, not asserted. */
  evidence: string;
  /**
   * Whether this stage can be established with the schema as it exists TODAY.
   *
   * Discovery found `enrollments` carries no lead, visitor, person or user
   * foreign key — the only bridge from acquisition to enrolment is an email
   * string match, which covers 431 of 517 enrolments (83.4%). The remaining 86
   * students cannot be traced to their acquisition at all. Marking that here
   * keeps the gap visible in code rather than in a document nobody re-reads.
   */
  joinable_today: boolean;
  /** Why not, when joinable_today is false. */
  gap?: string;
}

export const LIFECYCLE: Record<LifecycleStage, LifecycleStageDef> = {
  anonymous_visitor: {
    stage: 'anonymous_visitor',
    label: 'Anonymous visitor',
    definition: 'A browser fingerprint with at least one recorded session, not linked to a person.',
    evidence: 'visitors row with lead_id IS NULL',
    joinable_today: true,
  },
  identified_visitor: {
    stage: 'identified_visitor',
    label: 'Identified visitor',
    definition: 'A fingerprint resolved to a known person, whose earlier anonymous history is now attributable.',
    evidence: 'visitors.lead_id IS NOT NULL',
    joinable_today: true,
  },
  lead: {
    stage: 'lead',
    label: 'Lead',
    definition: 'A person who gave us contact details through any capture surface.',
    evidence: 'leads row',
    joinable_today: true,
  },
  applicant: {
    stage: 'applicant',
    label: 'Applicant',
    definition: 'A lead who has entered an admissions pipeline stage beyond initial capture.',
    evidence: 'leads.pipeline_stage beyond new_lead',
    joinable_today: true,
  },
  enrolled_student: {
    stage: 'enrolled_student',
    label: 'Enrolled student',
    definition: 'A person with an active enrolment in a cohort.',
    evidence: 'enrollments row with status active',
    // Was false until 2026-09-08. The identity layer landed: enrollments.person_id
    // exists and is backfilled (517 of 526 rows; the 9 newer ones are picked up by
    // re-running the idempotent backfill), so this stage now connects to the
    // stages before it by a real key rather than an email string match.
    joinable_today: true,
  },
  active_learner: {
    stage: 'active_learner',
    label: 'Active learner',
    definition:
      'An enrolled student with recent learning activity. Deliberately NOT defined by attendance ' +
      'alone — a multi-signal definition is required before this metric may be trusted.',
    evidence: 'enrolment plus recent curriculum, assessment, project or community activity',
    joinable_today: false,
    gap:
      'Inherits the enrolment join gap. Additionally, attendance_records is flagged unreliable ' +
      'and carries a backup table from 2026-08-25, so any attendance-derived figure must report ' +
      'as unavailable rather than zero.',
  },
  graduate: {
    stage: 'graduate',
    label: 'Graduate / alumni',
    definition: 'A student who completed their programme.',
    evidence: "enrollments row with status 'completed' — never set, see below",
    // NEVER ASSIGNED, AND THAT IS THE BUSINESS MODEL, NOT A GAP.
    //
    // Ali, 2026-09-09: "Complete is never. The goal is for this to need us to
    // improve and help them stay sharp and help them learn. The goal is to keep
    // the subscription active as long as possible."
    //
    // So a graduate is a category error here. This is a subscription, not a
    // course with an end: staying is success, and "finishing" would be churn
    // wearing a nicer word. The stage is kept in the vocabulary because the word
    // will come up, and a reader deserves to find this note rather than assume
    // graduation is simply unimplemented.
    joinable_today: false,
    gap:
      'Not applicable. This is a subscription: there is no completion, and a person ' +
      'who stops is LAPSED rather than finished. Nothing should ever assign this stage.',
  },
  lapsed: {
    stage: 'lapsed',
    label: 'Lapsed',
    definition:
      'Someone whose enrolment ended. In a subscription business this is the exit, and it ' +
      'is the state worth watching: the goal is to keep people out of it.',
    evidence: "enrollments row with status 'withdrawn'",
    // The stage the model was missing. Before this, the 62 people who withdrew
    // were counted as enrolled_student — so the active-student figure included
    // people who had already left, which is precisely the number a retention
    // business must not get wrong.
    joinable_today: true,
  },
  returning_customer: {
    stage: 'returning_customer',
    label: 'Returning customer',
    definition: 'A graduate or account with a subsequent purchase or active business relationship.',
    evidence: 'a second payment or business account role',
    joinable_today: false,
    gap:
      'No local payments table was found in discovery; payment records live outside this database, ' +
      'so this stage has no verified source here yet.',
  },
};

/** The ordered funnel, for ribbons and stage charts. */
export const LIFECYCLE_ORDER: readonly LifecycleStage[] = LIFECYCLE_STAGES;

/**
 * Stages whose counts can be computed and joined truthfully today.
 *
 * A lifecycle ribbon must render the rest as unavailable with the reason shown,
 * rather than as zero. A zero says "nobody reached this stage"; unavailable says
 * "we cannot yet tell", and those lead to opposite decisions.
 */
export function joinableStages(): LifecycleStage[] {
  return LIFECYCLE_ORDER.filter((s) => LIFECYCLE[s].joinable_today);
}

export function unjoinableStages(): Array<{ stage: LifecycleStage; gap: string }> {
  return LIFECYCLE_ORDER.filter((s) => !LIFECYCLE[s].joinable_today).map((s) => ({
    stage: s,
    gap: LIFECYCLE[s].gap ?? 'No reason recorded.',
  }));
}
