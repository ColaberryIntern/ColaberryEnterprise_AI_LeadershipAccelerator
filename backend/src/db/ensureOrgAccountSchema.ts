import { sequelize } from '../config/database';

/**
 * Business-account schema — idempotent raw DDL, same pattern as
 * ensureApprovalRequestsSchema.ts / ensureSessionReminderSchema.ts.
 *
 * WHY RAW DDL AND NOT sync({alter:true}): this repo has a 215-model graph, and an
 * ungated boot-time sync previously generated ~50k duplicate constraints and drove
 * Postgres into OOM. Boot-time schema work here is CREATE/ADD ... IF NOT EXISTS
 * only, so a partial database self-heals and re-running boot is a no-op.
 *
 * ADDITIVE ONLY. Adds two nullable/defaulted columns to `organizations` and one new
 * join table. Never alters, drops or backfills an existing column. Column names and
 * types must match backend/src/models/Organization.ts and OrgCohort.ts exactly.
 *
 * WHAT THIS ENABLES, and why each piece is needed:
 *
 * 1. `status` — `organizations` had six columns and no notion of being switched
 *    off, so there was no way to suspend a business account without deleting the
 *    row (which cascades to its members). Defaulted to 'active' so every existing
 *    row keeps working with no backfill.
 *
 * 2. `org_cohorts` — there is currently NO link between an organization and a
 *    cohort. `Cohort` has no org_id, `Organization` has no cohort_id, and no join
 *    table exists. The only path today is transitive and per-person
 *    (org_members -> enrollments.cohort_id), and registration sets cohort_id to
 *    null, so every newly registered org's members have no cohort at all. A join
 *    table rather than a column on either side, because a company can sponsor
 *    several cohorts over time and a cohort can carry people from several
 *    companies -- this is many-to-many in reality, and modelling it as a column
 *    would force a rewrite the first time either happens.
 *
 * 3. `lead_id` — registration writes the organization and the lead through two
 *    independent, unlinked calls, joined only by matching email. Recording the
 *    lead on the org makes the link explicit and survivable.
 */
export async function ensureOrgAccountSchema(): Promise<void> {
  const statements: string[] = [
    // --- organizations: lifecycle + lead linkage -----------------------------
    `ALTER TABLE organizations
       ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active'`,
    `ALTER TABLE organizations
       ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ`,
    `ALTER TABLE organizations
       ADD COLUMN IF NOT EXISTS status_changed_by VARCHAR(255)`,
    // Nullable and unconstrained by design: leads.id is an INTEGER autoincrement
    // on a table with its own dedup rules, and an org registered before its lead
    // exists (the Skip path) must still be creatable.
    `ALTER TABLE organizations
       ADD COLUMN IF NOT EXISTS lead_id INTEGER`,
    `CREATE INDEX IF NOT EXISTS idx_organizations_status ON organizations (status)`,
    `CREATE INDEX IF NOT EXISTS idx_organizations_lead_id ON organizations (lead_id)`,

    // --- org_cohorts: the many-to-many that did not exist --------------------
    `CREATE TABLE IF NOT EXISTS org_cohorts (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
       cohort_id UUID NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
       seats_sponsored INTEGER,
       added_by VARCHAR(255),
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    // Adding the same cohort to the same org twice is the obvious double-click,
    // so it is a no-op at the database level rather than a duplicate row.
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_org_cohorts_unique
       ON org_cohorts (org_id, cohort_id)`,
    `CREATE INDEX IF NOT EXISTS idx_org_cohorts_cohort ON org_cohorts (cohort_id)`,

    // --- the FK org_members was missing entirely -------------------------------
    //
    // `org_members.org_id` had NO foreign key constraint in production. The
    // Sequelize model declares `references: { model: 'organizations' }` and the
    // association declares `onDelete: 'CASCADE'`, but neither creates a database
    // constraint — the table was built by raw DDL in server.ts that omitted it.
    //
    // Two consequences, both real: nothing prevented a member row pointing at a
    // nonexistent company, and deleting an organization left its roster behind
    // as orphans (observed on 2026-08-15 when three test accounts were removed
    // and their three member rows survived). Sequelize's onDelete only applies
    // when Sequelize itself issues the delete and the association is loaded; a
    // plain SQL delete, or a cascade from another table, bypasses it entirely.
    //
    // Guarded rather than bare: Postgres has no ADD CONSTRAINT IF NOT EXISTS,
    // and adding it twice errors. Adding it also FAILS if any orphan exists, so
    // the orphans must be cleared first (done 2026-08-15) — the DO block below
    // deliberately does not delete anything, because silently destroying member
    // rows at boot is far worse than leaving the constraint unadded.
    `DO $$
     BEGIN
       IF NOT EXISTS (
         SELECT 1 FROM pg_constraint con
         JOIN pg_class rel ON rel.oid = con.conrelid
         WHERE rel.relname = 'org_members'
           AND con.contype = 'f'
           AND con.conname = 'org_members_org_id_fkey'
       ) AND NOT EXISTS (
         SELECT 1 FROM org_members m
         WHERE NOT EXISTS (SELECT 1 FROM organizations o WHERE o.id = m.org_id)
       ) THEN
         ALTER TABLE org_members
           ADD CONSTRAINT org_members_org_id_fkey
           FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
       END IF;
     END $$`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err) {
      // Never fatal to boot. A statement Postgres has no IF NOT EXISTS form for
      // (or a race with a second booting container) must not stop the server
      // coming up, but it must be visible rather than swallowed.
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        JSON.stringify({
          level: 'error',
          service: 'backend',
          event: 'ensure_org_account_schema_statement_failed',
          outcome: 'failure',
          error_class: err instanceof Error ? err.constructor.name : 'UnknownError',
          context: { sql: sql.slice(0, 120), message },
        }),
      );
    }
  }
}
