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

  // ── T503: the execution half ──────────────────────────────────────────────
  //
  // `growth_journey_executions` is the RECEIPT: one row per decision this run
  // carries out, and the only thing in the system that can say "this person was
  // contacted exactly once, because of that decision". It is MUTABLE (a receipt
  // moves through review, approval, enrolment and what the send path did with
  // it), so it carries `updated_at` and is not in the append-only guard's
  // pattern; every transition is also an `event_ledger` row.
  //
  // WHY THE RECEIPT EXISTS AT ALL. The campaign engine cannot promise exactly
  // once: `scheduled_emails` has no unique index, `campaign_leads`' unique pair
  // lives only in the Sequelize model, and the sequence's own de-dupe is a racy
  // pre-count that cannot see a row already sent. So the journey carries the
  // guarantee itself, in three database mechanisms:
  //   - `decision_id` UNIQUE - one execution per decision, replay-safe;
  //   - one OPEN receipt per (lead, brand, channel) and per (enrolment, brand,
  //     channel), partial on the open statuses, so two triggers for the same
  //     person in the same brand cannot both be in flight;
  //   - the adapter's atomic `approved -> enrolling` claim (T510), which is what
  //     makes two executor runs produce one enrolment.
  //
  // `campaign_id`, `sequence_id` and `scheduled_email_id` point at the EXISTING
  // campaign engine's rows and carry no foreign key on purpose: those tables are
  // outside this run's ownership, and a receipt must survive a campaign being
  // archived or a scheduled row being cleaned up. `nudge_id` is the in-app twin.
  // No address, no subject line, no body: a receipt says WHICH rows, never what
  // was said.
  `CREATE TABLE IF NOT EXISTS growth_journey_executions (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
     brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
     program_id UUID REFERENCES journey_programs(id) ON DELETE SET NULL,
     decision_id UUID NOT NULL REFERENCES growth_journey_decisions(id) ON DELETE CASCADE,
     subject_ref VARCHAR(128) NOT NULL,
     lead_id INTEGER,
     enrollment_id UUID,
     channel VARCHAR(16) NOT NULL,
     action_type VARCHAR(32) NOT NULL,
     campaign_id UUID,
     campaign_key VARCHAR(64),
     sequence_id UUID,
     mode VARCHAR(8) NOT NULL,
     status VARCHAR(20) NOT NULL DEFAULT 'pending_review',
     status_reason VARCHAR(128),
     control_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
     proposal_id UUID,
     approved_by VARCHAR(128),
     approved_at TIMESTAMPTZ,
     claimed_at TIMESTAMPTZ,
     attempts INTEGER NOT NULL DEFAULT 0,
     scheduled_email_id UUID,
     nudge_id UUID,
     outcome VARCHAR(32),
     last_error_class VARCHAR(64),
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS growth_journey_executions_decision_unique ON growth_journey_executions (decision_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS growth_journey_executions_open_lead_unique ON growth_journey_executions (lead_id, brand_id, channel) WHERE status IN ('pending_review', 'approved', 'enrolling', 'enrolled', 'in_progress')`,
  `CREATE UNIQUE INDEX IF NOT EXISTS growth_journey_executions_open_enrollment_unique ON growth_journey_executions (enrollment_id, brand_id, channel) WHERE status IN ('pending_review', 'approved', 'enrolling', 'enrolled', 'in_progress')`,
  `CREATE INDEX IF NOT EXISTS idx_gj_executions_status ON growth_journey_executions (status, updated_at)`,
  `CREATE INDEX IF NOT EXISTS idx_gj_executions_lead_campaign ON growth_journey_executions (lead_id, campaign_id)`,

  // `growth_journey_execution_controls` is the operator's switchboard: the
  // staged rollout (a `rollout` row raises a brand x programme x channel to
  // `review` or `limited`) and the SCOPED pauses (a `pause` row lowers a brand,
  // a programme, a channel or one subject to `off`).
  //
  // THERE IS NO GLOBAL SCOPE HERE, deliberately. The global stop is the existing
  // `system_kill_switch`, read first and read strictly; a second global switch
  // is exactly the "two switches that can disagree silently" the spec forbids.
  // `scope_key` is the app's own canonical key for a scope, so the partial
  // unique below can say "one active control per scope" in one column rather
  // than through four nullable ones.
  //
  // `brand_id` is NULLABLE here - and only here in this run - because a pause
  // may be programme-wide or channel-wide across brands; `tenant_id` never is.
  // A row is never edited: it is cleared (`cleared_at`) and a new one written,
  // so the history of who paused what, and when, survives.
  `CREATE TABLE IF NOT EXISTS growth_journey_execution_controls (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
     kind VARCHAR(8) NOT NULL,
     scope_key TEXT NOT NULL,
     brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
     program_id UUID REFERENCES journey_programs(id) ON DELETE SET NULL,
     channel VARCHAR(16),
     subject_ref VARCHAR(128),
     mode VARCHAR(8) NOT NULL,
     cohort_lead_ids INTEGER[],
     daily_limit INTEGER,
     reason TEXT,
     set_by_admin_id VARCHAR(128),
     cleared_at TIMESTAMPTZ,
     cleared_by_admin_id VARCHAR(128),
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     CHECK (kind <> 'pause' OR mode = 'off'),
     CHECK (kind <> 'rollout' OR brand_id IS NOT NULL),
     CHECK (mode <> 'limited' OR (COALESCE(daily_limit, 0) > 0 AND COALESCE(array_length(cohort_lead_ids, 1), 0) > 0))
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS growth_journey_execution_controls_scope_unique ON growth_journey_execution_controls (scope_key) WHERE cleared_at IS NULL`,
  `CREATE INDEX IF NOT EXISTS idx_gj_execution_controls_kind ON growth_journey_execution_controls (kind, brand_id)`,

  // `growth_journey_in_app_nudges` is the in-app channel's delivery: the row a
  // learner's portal reads. There is no per-learner nudge surface in this
  // codebase to reuse - the community bell is typed to community events and its
  // digest sends email - so this table is the surface, and it is deliberately
  // thin: a title, a link, and when it was shown or dismissed.
  //
  // NO BODY COLUMN AND NO ADDRESS COLUMN. The title and href are copied from the
  // decision's APPROVED content asset at execution time, so anything a model
  // wrote that a human never approved cannot reach a learner through this table.
  `CREATE TABLE IF NOT EXISTS growth_journey_in_app_nudges (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
     brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
     program_id UUID REFERENCES journey_programs(id) ON DELETE SET NULL,
     enrollment_id UUID NOT NULL,
     execution_id UUID NOT NULL REFERENCES growth_journey_executions(id) ON DELETE CASCADE,
     title TEXT NOT NULL,
     href TEXT,
     purpose VARCHAR(32),
     shown_at TIMESTAMPTZ,
     dismissed_at TIMESTAMPTZ,
     expires_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS growth_journey_in_app_nudges_execution_unique ON growth_journey_in_app_nudges (execution_id)`,
  `CREATE INDEX IF NOT EXISTS idx_gj_in_app_nudges_enrollment ON growth_journey_in_app_nudges (enrollment_id, created_at DESC)`,
];
