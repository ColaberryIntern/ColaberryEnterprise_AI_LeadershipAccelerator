import { sequelize } from '../config/database';

/**
 * Growth Journey OS — shared foundation schema (Phase 1, T201).
 *
 * Same idempotent raw-SQL pattern as `ensureExplorerGrowthSchema.ts` and
 * `ensureMultiTenantSchema.ts`: every statement is `CREATE ... IF NOT EXISTS`
 * in its own try/catch, so a partial database self-heals and re-running boot is
 * a no-op. `sync({alter:true})` is not an option on a 215-model production
 * graph — see `ensureWorkLedgerSchema.ts`'s header for that history.
 *
 * ADDITIVE ONLY. Creates the run's tables and their indexes (seven as of Phase
 * 2: five from Phase 1, `growth_journey_classifications` and
 * `growth_journey_transitions` from T222) plus ONE `ADD COLUMN IF NOT EXISTS`
 * on `brands`, kept last. Never alters, renames or drops an existing column,
 * table or constraint. That is not a style preference: AD-1 settled that
 * Explorer Growth is extended beside rather than reshaped, and a rename
 * anywhere in `explorer_*` is a hard stop for this run.
 *
 * MUST BE CALLED AFTER `ensureMultiTenantSchema()`, and this ordering is
 * load-bearing rather than cosmetic. That function is what creates `brands`
 * (`ensureMultiTenantSchema.ts:61`); it runs at `server.ts:2506`, while the
 * Explorer ensure step runs at 2444. A foreign key to `brands(id)` registered
 * beside the Explorer step would reference a table that does not exist yet, and
 * because each statement is individually caught, the failure would be a
 * console warning at boot rather than a crash — a missing table nobody notices
 * until a query needs it.
 *
 * Every table's columns must match its model EXACTLY (`models/JourneyProgram`,
 * `JourneyPath`, `OfferFamily`, `BrandOfferPolicy`, `GrowthJourneyEnrollment`,
 * `GrowthJourneyClassification`, `GrowthJourneyTransition`). The tests in
 * `db/__tests__/ensureGrowthJourneySchema.{statements,parity,phase2}.test.ts`
 * parse the column names out of each CREATE TABLE statement and assert SET
 * EQUALITY against a literal expected list, then assert the model maps that
 * same set. Drift on either side fails a test rather than a live query.
 *
 * That comparison must stay a set equality in both directions. The first
 * version of the test looped `expect(sqlBlock).toContain(col)` over the model's
 * attributes, which passed while a SQL-only column existed, and passed with the
 * `id UUID PRIMARY KEY` line deleted — `toContain('id')` matches the `id`
 * inside `tenant_id`. Both mutations now fail.
 */

/** Exported so the test can assert on the SQL without executing it. */
export const GROWTH_JOURNEY_STATEMENTS: readonly string[] = [
  // A journey program belongs to exactly one brand. `tenant_id` is carried
  // alongside `brand_id` — denormalised deliberately, matching `brand_domains`
  // — so a tenant-scoped query never needs to join through brands, which is
  // what `tenantScopeWhere` expects to filter on.
  `CREATE TABLE IF NOT EXISTS journey_programs (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
     brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
     slug VARCHAR(64) NOT NULL,
     name VARCHAR(255) NOT NULL,
     kind VARCHAR(32) NOT NULL,
     status VARCHAR(20) NOT NULL DEFAULT 'draft',
     description TEXT,
     metadata JSONB,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,

  // Unique per BRAND, not per tenant and not globally: the `colaberry` tenant
  // holds both `colaberry-training` and `colaberry-enterprise`, and each may
  // legitimately run a program called `learner`. Scoping to tenant would make
  // those collide.
  `CREATE UNIQUE INDEX IF NOT EXISTS journey_programs_brand_slug_unique
     ON journey_programs (brand_id, slug)`,
  `CREATE INDEX IF NOT EXISTS idx_journey_programs_tenant ON journey_programs (tenant_id)`,
  `CREATE INDEX IF NOT EXISTS idx_journey_programs_status ON journey_programs (status)`,

  // A path is one offer family within a program. `offer_family` is a plain
  // VARCHAR rather than an enum: §4 lists eleven families today and the set is
  // expected to grow, and a Postgres enum cannot have a value removed. The
  // permitted set is enforced by T202's policy table and its contract test,
  // where the assertion is visible and mutation-checked.
  `CREATE TABLE IF NOT EXISTS journey_paths (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     program_id UUID NOT NULL REFERENCES journey_programs(id) ON DELETE CASCADE,
     offer_family VARCHAR(64) NOT NULL,
     name VARCHAR(255) NOT NULL,
     status VARCHAR(20) NOT NULL DEFAULT 'draft',
     priority INTEGER NOT NULL DEFAULT 0,
     metadata JSONB,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,

  // One path per offer family per program. Two `consulting` paths inside one
  // program is a seeding bug, and the database is where that gets caught rather
  // than in an application-level "have we already added this?" check that loses
  // to a concurrent seed.
  `CREATE UNIQUE INDEX IF NOT EXISTS journey_paths_program_family_unique
     ON journey_paths (program_id, offer_family)`,
  `CREATE INDEX IF NOT EXISTS idx_journey_paths_status ON journey_paths (status)`,

  // ── T202 ──────────────────────────────────────────────────────────────────
  // The governed offer catalog. §4's first line is "Offers are not free-text AI
  // inventions", and this table is what makes that enforceable: a family has to
  // exist here before a policy row or a path can name it.
  //
  // `slug` is unique GLOBALLY, not per tenant — unlike `brands.slug`, which is
  // per-tenant. The vocabulary is deliberately shared: the whole point of §4's
  // policy table is to compare what different brands may offer, and a
  // tenant-scoped catalog would make `ai_consulting` a different thing for each
  // tenant and the comparison meaningless.
  `CREATE TABLE IF NOT EXISTS offer_families (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     slug VARCHAR(64) NOT NULL,
     name VARCHAR(255) NOT NULL,
     status VARCHAR(20) NOT NULL DEFAULT 'active',
     description TEXT,
     metadata JSONB,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS offer_families_slug_unique ON offer_families (slug)`,

  // §4's brand-offer eligibility mapping, carrying all eight attributes §4:278
  // requires: status, effective dates, approved landing pages, approved claims,
  // content collections, CTAs, conversion events and required approvals.
  //
  // `decision` is the enforcement primitive and the reason this is not just a
  // join table. Absence of a row already denies (the resolver fails closed), so
  // an `allow` row is a grant. An explicit `deny` row exists for the case §4:287
  // calls out by name — AI Flotation must never be offered business training or
  // any learner programme, even when the classifier, the content tags or the
  // caller are wrong — and a deny OUTRANKS an allow, so a later stray grant
  // cannot open it.
  //
  // No CHECK constraint on `decision` or `status`, matching `offer_family`'s
  // reasoning in `journey_paths`: the permitted values are asserted by contract
  // tests, where they are visible and mutation-checked, rather than by DDL that
  // needs a migration to correct.
  `CREATE TABLE IF NOT EXISTS brand_offer_policies (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
     brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
     offer_family VARCHAR(64) NOT NULL,
     decision VARCHAR(10) NOT NULL,
     status VARCHAR(20) NOT NULL DEFAULT 'active',
     effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     effective_to TIMESTAMPTZ,
     approved_landing_pages JSONB NOT NULL DEFAULT '[]'::jsonb,
     approved_claims JSONB NOT NULL DEFAULT '[]'::jsonb,
     content_collections JSONB NOT NULL DEFAULT '[]'::jsonb,
     approved_ctas JSONB NOT NULL DEFAULT '[]'::jsonb,
     conversion_events JSONB NOT NULL DEFAULT '[]'::jsonb,
     required_approvals JSONB NOT NULL DEFAULT '[]'::jsonb,
     notes TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,

  // One policy per brand per offer family. The uniqueness is what lets the
  // resolver read a single row and decide, rather than reconciling a set of
  // overlapping grants — and it is the database, not application code, that
  // keeps a concurrent seed from creating a second contradictory row.
  `CREATE UNIQUE INDEX IF NOT EXISTS brand_offer_policies_brand_family_unique
     ON brand_offer_policies (brand_id, offer_family)`,
  `CREATE INDEX IF NOT EXISTS idx_brand_offer_policies_tenant ON brand_offer_policies (tenant_id)`,
  `CREATE INDEX IF NOT EXISTS idx_brand_offer_policies_decision ON brand_offer_policies (decision)`,

  // ── T205 ──────────────────────────────────────────────────────────────────
  // §6.1's participation record: a subject's governed participation in one
  // program. Plan cycle 1's backfill had no destination for this.
  //
  // `subject_ref` IS THE PRICE OF AD-2, AND IT IS WORTH STATING WHY IT EXISTS.
  // There is no `subjects` table — AD-2 settled that a fifth identity beside
  // `leads`, `enrollments`, `visitors` and `org_members` would drift invisibly.
  // So a participation row cannot point at a subject id, because none exists.
  // Instead it carries a DERIVED, STABLE key of the form `enrollment:<uuid>` or
  // `lead:<id>`, built from the strongest anchor available, plus the raw anchors
  // beside it.
  //
  // That key is what makes the backfill idempotent: the unique index on
  // `(program_id, subject_ref)` is what stops a re-run creating a second
  // participation row for the same person in the same programme. An application
  // "have we done this already?" check loses that race; the index does not.
  //
  // Both anchors are nullable and at least one is always set, per §6.2's
  // "require at least one valid identity anchor". `enrollment_id` is
  // deliberately NOT a foreign key to `enrollments`: Explorer profiles are keyed
  // on it, the backfill reads them, and a hard FK would make this table's
  // integrity depend on a row another system may archive.
  `CREATE TABLE IF NOT EXISTS growth_journey_enrollments (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
     brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
     program_id UUID NOT NULL REFERENCES journey_programs(id) ON DELETE CASCADE,
     path_id UUID REFERENCES journey_paths(id) ON DELETE SET NULL,
     subject_ref VARCHAR(128) NOT NULL,
     lead_id INTEGER,
     enrollment_id UUID,
     status VARCHAR(20) NOT NULL DEFAULT 'active',
     source VARCHAR(64) NOT NULL,
     enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     metadata JSONB,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,

  // The idempotency key. One participation per subject per programme, enforced
  // by the database so a concurrent backfill cannot double-write.
  `CREATE UNIQUE INDEX IF NOT EXISTS growth_journey_enrollments_program_subject_unique
     ON growth_journey_enrollments (program_id, subject_ref)`,
  `CREATE INDEX IF NOT EXISTS idx_gj_enrollments_tenant ON growth_journey_enrollments (tenant_id)`,
  `CREATE INDEX IF NOT EXISTS idx_gj_enrollments_brand ON growth_journey_enrollments (brand_id)`,
  `CREATE INDEX IF NOT EXISTS idx_gj_enrollments_lead ON growth_journey_enrollments (lead_id)`,
  `CREATE INDEX IF NOT EXISTS idx_gj_enrollments_enrollment ON growth_journey_enrollments (enrollment_id)`,
  `CREATE INDEX IF NOT EXISTS idx_gj_enrollments_status ON growth_journey_enrollments (status)`,

  // ── Phase 2, T222 ─────────────────────────────────────────────────────────
  // growth_journey_classifications — one answer to "which brand relationship,
  // which programme, which path?" with the evidence that produced it (§6.1,
  // §7.1). APPEND-ONLY: no updated_at, no update path anywhere; a
  // reclassification or a human override is a new row (`override_of`).
  //
  // `primary_path` has already been checked against brand_offer_policies by the
  // writer and `eligibility` stores that decision — model, rule table and human
  // are all subject to the same check. `source_step` is the §7.1 step (1-8)
  // that answered; `ai_involved` + `model_version` say whether and which model
  // took part. `idempotency_key` is unique so a replay with identical inputs
  // lands on the existing row rather than a second one.
  `CREATE TABLE IF NOT EXISTS growth_journey_classifications (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
     brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
     subject_ref VARCHAR(128) NOT NULL,
     lead_id INTEGER,
     enrollment_id UUID,
     trigger VARCHAR(24) NOT NULL,
     input_hash TEXT NOT NULL,
     brand_relationship VARCHAR(64),
     journey_program_slug VARCHAR(64),
     primary_path VARCHAR(64),
     secondary_paths JSONB NOT NULL DEFAULT '[]'::jsonb,
     intent TEXT,
     confidence NUMERIC(4,3),
     evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
     source_step SMALLINT NOT NULL,
     requires_human_review BOOLEAN NOT NULL DEFAULT false,
     status VARCHAR(16) NOT NULL,
     locked BOOLEAN NOT NULL DEFAULT false,
     eligibility JSONB,
     referral_target_brand_id UUID,
     ai_involved BOOLEAN NOT NULL DEFAULT false,
     model_version TEXT,
     ruleset_version VARCHAR(16) NOT NULL,
     override_of UUID,
     decided_by TEXT,
     idempotency_key TEXT NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS growth_journey_classifications_idempotency_unique
     ON growth_journey_classifications (idempotency_key)`,
  `CREATE INDEX IF NOT EXISTS idx_gj_classifications_subject
     ON growth_journey_classifications (subject_ref, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_gj_classifications_brand_status
     ON growth_journey_classifications (brand_id, status, created_at DESC)`,
  // The review queue reads this partial index; everything else stays out of it.
  `CREATE INDEX IF NOT EXISTS idx_gj_classifications_review
     ON growth_journey_classifications (brand_id, created_at DESC)
     WHERE requires_human_review`,

  // growth_journey_transitions — how a subject moved between programmes, paths
  // and brands (§6.1). Also the home of a cross-brand referral REQUEST: a brand
  // transition asked for and not yet made is `transition_type
  // 'brand_referral_requested'`, `status 'requested'`. Phase 2 writes only the
  // request; the approval that creates the second lead_tenant_contexts row is
  // Phase 4's, independently gated, and lands as a new row referencing this one.
  // APPEND-ONLY, same as classifications.
  `CREATE TABLE IF NOT EXISTS growth_journey_transitions (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
     brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
     program_id UUID REFERENCES journey_programs(id) ON DELETE SET NULL,
     subject_ref VARCHAR(128) NOT NULL,
     lead_id INTEGER,
     enrollment_id UUID,
     transition_type VARCHAR(32) NOT NULL,
     from_value JSONB,
     to_value JSONB,
     status VARCHAR(16) NOT NULL,
     reason TEXT NOT NULL,
     evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
     requested_by TEXT NOT NULL,
     idempotency_key TEXT NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS growth_journey_transitions_idempotency_unique
     ON growth_journey_transitions (idempotency_key)`,
  `CREATE INDEX IF NOT EXISTS idx_gj_transitions_subject
     ON growth_journey_transitions (subject_ref, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_gj_transitions_brand_type_status
     ON growth_journey_transitions (brand_id, transition_type, status)`,

  // ── T301 (Phase 3) ────────────────────────────────────────────────────────
  // The decision, profile and snapshot tables. Placed HERE, before the brands
  // ALTER, because that ALTER is asserted to be the last statement in this
  // module (statements test) — and because every table below references
  // journey_programs, which is created at the top.
  //
  // `growth_journey_decisions` is APPEND-ONLY (no updated_at): a re-decision is
  // a new row. `growth_journey_profiles` is the one MUTABLE table the run owns —
  // it is a projection of the current state, not a ledger, and every state
  // change it records also writes an append-only transitions row.
  `CREATE TABLE IF NOT EXISTS growth_journey_decisions (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
     brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
     program_id UUID REFERENCES journey_programs(id) ON DELETE SET NULL,
     subject_ref VARCHAR(128) NOT NULL,
     lead_id INTEGER,
     enrollment_id UUID,
     classification_id UUID,
     trigger VARCHAR(32) NOT NULL,
     decision_date DATE NOT NULL,
     mode VARCHAR(16) NOT NULL,
     selected_action VARCHAR(48),
     selected_path VARCHAR(64),
     selected_channel VARCHAR(16),
     selected_content JSONB,
     candidates JSONB NOT NULL DEFAULT '[]'::jsonb,
     suppressed JSONB NOT NULL DEFAULT '[]'::jsonb,
     deferred_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
     eligibility JSONB,
     scores JSONB,
     score_gaps JSONB NOT NULL DEFAULT '[]'::jsonb,
     state_at_decision VARCHAR(48),
     overlays_at_decision JSONB NOT NULL DEFAULT '[]'::jsonb,
     contact_evidence JSONB,
     human_conversation VARCHAR(8) NOT NULL DEFAULT 'unknown',
     sales_capacity VARCHAR(12) NOT NULL DEFAULT 'unknown',
     content_gaps JSONB NOT NULL DEFAULT '[]'::jsonb,
     reason TEXT NOT NULL,
     requires_human_review BOOLEAN NOT NULL DEFAULT FALSE,
     ai_involved BOOLEAN NOT NULL DEFAULT FALSE,
     model_version VARCHAR(64),
     ruleset_version VARCHAR(32) NOT NULL,
     executed BOOLEAN NOT NULL DEFAULT FALSE,
     execution_receipt JSONB,
     decided_by TEXT NOT NULL,
     idempotency_key TEXT NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS growth_journey_decisions_idempotency_unique
     ON growth_journey_decisions (idempotency_key)`,
  `CREATE INDEX IF NOT EXISTS idx_gj_decisions_subject
     ON growth_journey_decisions (subject_ref, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_gj_decisions_brand_date
     ON growth_journey_decisions (brand_id, decision_date DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_gj_decisions_review
     ON growth_journey_decisions (brand_id, created_at DESC)
     WHERE requires_human_review`,

  `CREATE TABLE IF NOT EXISTS growth_journey_profiles (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
     brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
     program_id UUID REFERENCES journey_programs(id) ON DELETE SET NULL,
     subject_ref VARCHAR(128) NOT NULL,
     lead_id INTEGER,
     enrollment_id UUID,
     state VARCHAR(48) NOT NULL,
     state_entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     overlays JSONB NOT NULL DEFAULT '[]'::jsonb,
     scores JSONB,
     score_gaps JSONB NOT NULL DEFAULT '[]'::jsonb,
     scores_computed_at TIMESTAMPTZ,
     signals_summary JSONB,
     last_decision_at TIMESTAMPTZ,
     source VARCHAR(32) NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS growth_journey_profiles_brand_subject_unique
     ON growth_journey_profiles (brand_id, subject_ref)`,
  `CREATE INDEX IF NOT EXISTS idx_gj_profiles_state
     ON growth_journey_profiles (brand_id, state)`,

  `CREATE TABLE IF NOT EXISTS growth_journey_score_snapshots (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
     brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
     subject_ref VARCHAR(128) NOT NULL,
     as_of_date DATE NOT NULL,
     state VARCHAR(48),
     overlays JSONB NOT NULL DEFAULT '[]'::jsonb,
     scores JSONB,
     score_gaps JSONB NOT NULL DEFAULT '[]'::jsonb,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS growth_journey_snapshots_subject_date_unique
     ON growth_journey_score_snapshots (brand_id, subject_ref, as_of_date)`,

  // ── T203 ──────────────────────────────────────────────────────────────────
  // THE ONE STATEMENT IN THIS MODULE THAT REACHES INTO SOMEONE ELSE'S TABLE.
  //
  // Every other statement here creates a table this run owns. This one adds a
  // column to `brands`, which `ensureMultiTenantSchema` owns, and it is the
  // narrowest form that exists: `ADD COLUMN IF NOT EXISTS`, nullable, no
  // default, no backfill. Existing rows are untouched and every existing query
  // keeps working, because nothing selects a column it does not know about.
  //
  // WHY ON `brands` AND NOT `brand_domains`. `resolvePublicContext` resolves a
  // brand by TWO paths — an explicit source slug through `lead_sources`, and a
  // hostname through `brand_domains`. The slug path never touches a
  // `brand_domains` row, so a column there could structurally serve only half
  // the callers. Both paths return a brand, which makes `brands` the only
  // workable key.
  //
  // ON DELETE SET NULL, not CASCADE. Deleting a journey program must clear the
  // pointer, never delete the brand. CASCADE here would mean removing a
  // programme took its brand — and every lead, domain and policy hanging off it
  // — with it.
  //
  // --- T305: the section 10 content declaration.
  //
  // One row per asset (or per named collection) per brand, carrying everything a
  // grounded message needs to be defensible: which programmes, paths, lifecycle
  // states, overlays and personas it may serve, which claims are approved and
  // what evidence backs them, which URLs and CTAs may be cited, when it is
  // effective, whether it is free or restricted, who sends it, who owns it, and
  // what its approval state is.
  //
  // It is the WRITER that `brand_offer_policies.approved_landing_pages` and
  // `content_collections` never had - both of those are JSONB lists defaulting to
  // `[]` that nothing in the repo writes, which is why `approved_content_ready`
  // has been false for every row in production since it was added.
  //
  // NO ROWS SHIP IN THIS PHASE. Declaring the existing assets is a human review
  // job (Phase 4), and inventing rows here would be a fabricated approval record.
  // An empty table is why `contentEligibility` treats "no rule" as "fall back to
  // the asset's own columns" rather than as a denial: a denial would take every
  // Explorer learner's content away the moment this shipped.
  `CREATE TABLE IF NOT EXISTS growth_journey_content_rules (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id UUID NOT NULL REFERENCES tenants(id),
     brand_id UUID NOT NULL REFERENCES brands(id),
     asset_id UUID,
     collection_key VARCHAR(64),
     eligible_programs JSONB NOT NULL DEFAULT '[]'::jsonb,
     eligible_paths JSONB NOT NULL DEFAULT '[]'::jsonb,
     audience_personas JSONB NOT NULL DEFAULT '[]'::jsonb,
     lifecycle_states JSONB NOT NULL DEFAULT '[]'::jsonb,
     overlays JSONB NOT NULL DEFAULT '[]'::jsonb,
     offer_family VARCHAR(48),
     channels JSONB NOT NULL DEFAULT '[]'::jsonb,
     content_purpose VARCHAR(32),
     approved_claims JSONB NOT NULL DEFAULT '[]'::jsonb,
     source_evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
     approved_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
     approved_ctas JSONB NOT NULL DEFAULT '[]'::jsonb,
     effective_from TIMESTAMPTZ,
     expires_at TIMESTAMPTZ,
     access_tier VARCHAR(16),
     sender_profile_id UUID,
     version INTEGER NOT NULL DEFAULT 1,
     owner VARCHAR(128),
     approval_status VARCHAR(16) NOT NULL DEFAULT 'draft',
     approved_by VARCHAR(128),
     approved_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     CHECK (asset_id IS NOT NULL OR collection_key IS NOT NULL)
   )`,
  // One live declaration per asset per brand per version. A second row for the
  // same asset would make "which rule applies" a question with two answers.
  `CREATE UNIQUE INDEX IF NOT EXISTS growth_journey_content_rules_asset_unique ON growth_journey_content_rules (brand_id, asset_id, version) WHERE asset_id IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_gj_content_rules_brand_status ON growth_journey_content_rules (brand_id, approval_status)`,

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

  // Placed last so `journey_programs` exists before the foreign key names it.
  `ALTER TABLE brands
     ADD COLUMN IF NOT EXISTS default_journey_program_id UUID
     REFERENCES journey_programs(id) ON DELETE SET NULL`,
];

export async function ensureGrowthJourneySchema(): Promise<void> {
  for (const statement of GROWTH_JOURNEY_STATEMENTS) {
    try {
      await sequelize.query(statement);
    } catch (err: unknown) {
      // Warn and continue, matching the sibling ensure modules. A single failed
      // statement must not abort boot, and re-running is a no-op, so the next
      // boot repairs it.
      console.warn(
        '[ensureGrowthJourneySchema] statement failed:',
        (err as { message?: string })?.message,
      );
    }
  }
}
