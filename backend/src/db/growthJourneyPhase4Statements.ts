/**
 * Growth Journey OS — the Phase 4 statements (T401): handoffs, outcomes, policies.
 *
 * A sibling of `ensureGrowthJourneySchema.ts`, not a second ensure step. That
 * module spreads this list into `GROWTH_JOURNEY_STATEMENTS` at the position the
 * block occupied — after the content-rules index, before the brands ALTER it
 * pins last — so there is still ONE statement list, ONE boot call and ONE set
 * of schema tests reading it. The split exists because the parent crossed
 * CLAUDE.md's 500-line hard ceiling the moment these twelve statements were
 * added, and the rule is to split before adding, not after.
 *
 * Same discipline as the parent: every statement is `CREATE ... IF NOT EXISTS`,
 * nothing here alters, renames or drops, and every table's columns are pinned
 * IN ORDER against its model in `__tests__/ensureGrowthJourneySchema.phase4.test.ts`.
 * The statements test's control-byte tripwire scans this file as part of the
 * schema family.
 */

export const GROWTH_JOURNEY_PHASE4_STATEMENTS: readonly string[] = [
  // ── Phase 4 (T401): the human half ────────────────────────────────────────
  //
  // `growth_journey_handoffs` is the AI-to-human task (§6.1, §9, §11): which
  // subject, in which brand, from which decision, into which owner queue, with
  // what evidence, and what the human did about it. It is MUTABLE by design — a
  // task changes state — which is why it carries `updated_at` and why it is NOT
  // in the append-only guard's pattern. Every state change it takes is also an
  // `event_ledger` row, so the history is not lost to the mutation.
  //
  // WHAT IT IS NOT. Not a second task system: the human's actual to-do is a
  // `tickets` row, created through `ticketService.createTicket` and pointed at
  // by `ticket_id`; `assigned_to_type` / `assigned_to_id` are the `tickets`
  // vocabulary verbatim, never a new `owner_type` / `owner_id` pair. Not a
  // notification: nothing here alerts anyone (Phase 5). Not an integration
  // write: `organization_id` is a pointer a disposition may set, and is
  // deliberately unconstrained, on the `lead_tenant_contexts.organization_id`
  // precedent.
  //
  // `decision_id` is a real foreign key to `growth_journey_decisions` — this
  // row exists BECAUSE of that one — and is nullable because a reply-routed or
  // manual handoff has no decision behind it. ON DELETE SET NULL: losing the
  // decision must not lose the human's work.
  //
  // `assignment_blocked_reason` says why a `queued` row is still queued after
  // the assignment step looked at it (flag off, kill switch, no assignee
  // policy, capacity full, creator unregistered) - on the row, so the queue
  // page can say it without re-running the checks.
  //
  // `integration_refused` (T406) says why a `qualified` / `converted` disposition
  // wrote nothing to the existing systems (the kill switch, a lead with no
  // company, ...) - on the row, so the disposition still records and the
  // reviewer can see what did not happen without re-running the writers.
  //
  // `evidence` is the §9 packet, built from stored rows only, and carries ids,
  // counts, timestamps and outcome types — never an address, a message body or
  // a transcript. The contract makes that a phase-failing check, and the
  // handoff test pins it on the writer.
  `CREATE TABLE IF NOT EXISTS growth_journey_handoffs (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
     brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
     program_id UUID REFERENCES journey_programs(id) ON DELETE SET NULL,
     subject_ref VARCHAR(128) NOT NULL,
     lead_id INTEGER,
     enrollment_id UUID,
     decision_id UUID REFERENCES growth_journey_decisions(id) ON DELETE SET NULL,
     organization_id UUID,
     owner_queue VARCHAR(32) NOT NULL,
     assigned_to_type VARCHAR(16),
     assigned_to_id VARCHAR(255),
     ticket_id UUID,
     assignment_blocked_reason VARCHAR(64),
     priority VARCHAR(8) NOT NULL DEFAULT 'medium',
     expected_value NUMERIC,
     urgent BOOLEAN NOT NULL DEFAULT FALSE,
     reason TEXT NOT NULL,
     evidence JSONB NOT NULL,
     qualification_gaps JSONB NOT NULL DEFAULT '[]'::jsonb,
     talking_points JSONB NOT NULL DEFAULT '[]'::jsonb,
     best_channel VARCHAR(16),
     consent_basis VARCHAR(64),
     sla_due_at TIMESTAMPTZ,
     status VARCHAR(20) NOT NULL DEFAULT 'queued',
     disposition VARCHAR(20),
     disposition_reason TEXT,
     disposition_at TIMESTAMPTZ,
     dispositioned_by VARCHAR(128),
     return_to_ai JSONB,
     integration_refused VARCHAR(64),
     accepted_at TIMESTAMPTZ,
     expired_at TIMESTAMPTZ,
     source VARCHAR(32) NOT NULL,
     idempotency_key TEXT NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS growth_journey_handoffs_idempotency_unique
     ON growth_journey_handoffs (idempotency_key)`,
  // ONE OPEN HANDOFF PER SUBJECT PER BRAND. Two humans must never own the same
  // person at once, and a second row for the same subject would make "who has
  // this" a question with two answers. Partial on the open statuses so a
  // dispositioned or expired history row does not block the next handoff.
  `CREATE UNIQUE INDEX IF NOT EXISTS growth_journey_handoffs_open_subject_unique
     ON growth_journey_handoffs (subject_ref, brand_id)
     WHERE status IN ('queued', 'assigned', 'accepted')`,
  `CREATE INDEX IF NOT EXISTS idx_gj_handoffs_tenant_brand_status
     ON growth_journey_handoffs (tenant_id, brand_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_gj_handoffs_subject
     ON growth_journey_handoffs (subject_ref, brand_id)`,
  `CREATE INDEX IF NOT EXISTS idx_gj_handoffs_queue_open
     ON growth_journey_handoffs (brand_id, owner_queue)
     WHERE status IN ('queued', 'assigned')`,

  // `growth_journey_outcomes` is APPEND-ONLY (no updated_at): the normalised
  // record of something that happened to a subject — a reply, a meeting, a
  // pipeline stage, a paid enrolment, a project start, a handoff accepted or
  // dispositioned — read from the EXISTING records (`interaction_outcomes`,
  // `strategy_calls`, `leads.pipeline_stage`, `enrollments`, `subscriptions`,
  // `delivery_engagements`, this run's own handoffs) and keyed
  // `(source, source_ref)` so the same source row normalised twice is one
  // outcome. Nothing here is a new source of truth about a person; it is an
  // index over the truths that already exist, so the §13 rates can be read in
  // one place without treating a missing record as a zero.
  `CREATE TABLE IF NOT EXISTS growth_journey_outcomes (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
     brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
     subject_ref VARCHAR(128) NOT NULL,
     lead_id INTEGER,
     handoff_id UUID REFERENCES growth_journey_handoffs(id) ON DELETE SET NULL,
     decision_id UUID REFERENCES growth_journey_decisions(id) ON DELETE SET NULL,
     outcome_type VARCHAR(32) NOT NULL,
     source VARCHAR(32) NOT NULL,
     source_ref VARCHAR(160) NOT NULL,
     occurred_at TIMESTAMPTZ NOT NULL,
     value NUMERIC,
     metadata JSONB,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS growth_journey_outcomes_source_unique
     ON growth_journey_outcomes (source, source_ref)`,
  `CREATE INDEX IF NOT EXISTS idx_gj_outcomes_subject
     ON growth_journey_outcomes (subject_ref, brand_id, occurred_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_gj_outcomes_handoff
     ON growth_journey_outcomes (handoff_id)
     WHERE handoff_id IS NOT NULL`,

  // `growth_journey_policies` is the OPERATOR'S table: per brand × owner queue,
  // how many handoffs a day the queue can take (`daily_capacity`, NULL meaning
  // "nobody has said" — which the capacity reader reports as `unknown`, never
  // as zero and never as unlimited), who the queue's assignee is in the
  // `tickets` vocabulary, how long a return-to-AI cooldown lasts, and the SLA.
  // Mutable, because an operator changes these. `INERT_ON_CREATE` discipline
  // as `brand_offer_policies`: a row that ships with every value NULL changes
  // nothing until a human fills it in.
  //
  // Why a policy row and not a role: `MGMT_ROLES` has neither `sales` nor
  // `solution_architect`, and Phase 4 adds no RBAC role. A queue is a string
  // an operator maps to a person here; a queue with no `queue_assignee` row
  // leaves its handoffs `queued`, visible and unassigned.
  `CREATE TABLE IF NOT EXISTS growth_journey_policies (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
     brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
     policy_type VARCHAR(32) NOT NULL,
     owner_queue VARCHAR(32),
     daily_capacity INTEGER,
     sla_hours INTEGER,
     assigned_to_type VARCHAR(16),
     assigned_to_id VARCHAR(255),
     cooldown_days INTEGER,
     settings JSONB NOT NULL DEFAULT '{}'::jsonb,
     status VARCHAR(16) NOT NULL DEFAULT 'active',
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  // One policy of a type per queue per brand. COALESCE so the queue-less
  // policies (a brand-wide cooldown) are unique too: a plain unique index
  // treats two NULLs as distinct and would let a brand carry two cooldowns.
  `CREATE UNIQUE INDEX IF NOT EXISTS growth_journey_policies_brand_type_queue_unique
     ON growth_journey_policies (brand_id, policy_type, COALESCE(owner_queue, ''))`,

  // ── T402: who is talking to this person right now ─────────────────────────
  //
  // THE SOURCE `human_conversation` NEVER HAD. Since T304 every decision has
  // recorded `human_conversation: 'unknown'` with the reason "no source in
  // this codebase" - `inbox_emails` has no `lead_id`, inbox cases key on a
  // query rather than a person, and no ticket is written for a lead. This row
  // is that source: lead-keyed, brand-scoped, opened when a human accepts a
  // handoff, when a human's own activity on the lead is seen, or when Ali's
  // personal outreach went out; cleared when the human releases or
  // dispositions. One OPEN row per lead per brand (the partial unique), so
  // "who has this person" has one answer, and a cleared row stays as history.
  //
  // `owner_type` is `human` or `ai`; `owner_id` is an admin user id or `ali`;
  // `source` says how the row came to exist. Mutable: clearing is an update.
  //
  // NOT A FOURTH DETECTOR OF ANYTHING. The reader derives an open conversation
  // from two records that already exist (`activities` with a human author,
  // `communication_logs` outbound with the personal-outreach trigger) and
  // records what it saw here, idempotently. It never reads a suppression row
  // and it never decides whether a person may be contacted - that stays with
  // the evaluators `contactEvidence.ts` composes.
  `CREATE TABLE IF NOT EXISTS growth_journey_conversation_ownership (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
     brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
     lead_id INTEGER NOT NULL,
     owner_type VARCHAR(8) NOT NULL,
     owner_id VARCHAR(255),
     channel VARCHAR(16),
     source VARCHAR(32) NOT NULL,
     since_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     cleared_at TIMESTAMPTZ,
     cleared_by VARCHAR(128),
     cleared_reason VARCHAR(64),
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS growth_journey_conversation_ownership_open_unique
     ON growth_journey_conversation_ownership (lead_id, brand_id)
     WHERE cleared_at IS NULL`,
  `CREATE INDEX IF NOT EXISTS idx_gj_conversation_ownership_lead
     ON growth_journey_conversation_ownership (lead_id, brand_id, since_at DESC)`,
];
