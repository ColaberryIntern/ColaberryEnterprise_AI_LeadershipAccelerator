/**
 * Growth Journey OS — the Phase 5 statements (governed execution).
 *
 * A sibling of `ensureGrowthJourneySchema.ts`, exactly like
 * `growthJourneyPhase4Statements.ts`, and for the same reason: the parent sits
 * at CLAUDE.md's 500-line ceiling. It spreads this list into
 * `GROWTH_JOURNEY_STATEMENTS` right after Phase 4's, before the brands ALTER it
 * pins last, so there is still ONE statement list, ONE boot call and ONE set of
 * schema tests reading it.
 *
 * Same discipline: every statement is `CREATE ... IF NOT EXISTS`, nothing here
 * alters, renames or drops, and the statements test's control-byte tripwire
 * scans this file with the rest of the schema family.
 */

export const GROWTH_JOURNEY_PHASE5_STATEMENTS: readonly string[] = [
  // ── T501 (the Phase 5 packet's 7A): ONE OPEN HANDOFF PER PERSON PER BRAND ──
  //
  // Phase 4's `growth_journey_handoffs_open_subject_unique` is keyed on the
  // SUBJECT REF, and one learner has two of them: `enrollment:<id>` to a
  // decision, `lead:<id>` to the reply hook. T414's fixtures had the learner
  // decision's admissions handoff and a READY_TO_ENROLL reply's admissions
  // handoff both open, both assigned, for the same person. This is the rule the
  // subject index was written to enforce ("two humans must never own the same
  // person at once"), stated on the person: a second trigger under either ref
  // lands on the open row, exactly as a same-ref trigger always has. A NULL
  // `lead_id` (a subject with no lead) never clashes, so the subject index still
  // governs those rows alone. The predicate is the same plain IN list as the
  // subject index, and `OPEN_HANDOFF_STATUSES` in the model is its twin.
  `CREATE UNIQUE INDEX IF NOT EXISTS growth_journey_handoffs_open_lead_unique ON growth_journey_handoffs (lead_id, brand_id) WHERE status IN ('queued', 'assigned', 'accepted')`,
];
