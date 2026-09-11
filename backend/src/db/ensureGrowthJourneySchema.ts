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
 * ADDITIVE ONLY. Creates two tables and their indexes. Never alters, renames or
 * drops an existing column, table or constraint. That is not a style
 * preference: AD-1 settled that Explorer Growth is extended beside rather than
 * reshaped, and a rename anywhere in `explorer_*` is a hard stop for this run.
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
 * Columns must match these models EXACTLY:
 *   backend/src/models/JourneyProgram.ts
 *   backend/src/models/JourneyPath.ts
 * This module's own test parses the column names out of the CREATE TABLE
 * statements and asserts SET EQUALITY against a literal expected list, then
 * asserts the models map that same set. Drift on either side fails a test
 * rather than a live query.
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
