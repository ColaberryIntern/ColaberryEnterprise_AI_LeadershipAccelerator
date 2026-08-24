import { sequelize } from '../config/database';

/**
 * Capstone Record schema — the two capstone tables plus the one consent column
 * the record depends on. Ensured via idempotent raw SQL, the same pattern as
 * ensureAgentAttachmentSchema.ts / ensureCommunityWinsSchema: this graph runs no
 * global sync() at boot, so every statement is CREATE/ALTER ... IF NOT EXISTS in
 * its own try/catch and a partial database self-heals on the next boot.
 *
 * ── WHY THIS FILE EXISTS AT ALL ─────────────────────────────────────────────
 *
 * This DDL previously lived as `ensureCapstoneRecordSchema()` inside
 * models/CapstoneRecord.ts, where it was complete, correct, and CALLED FROM
 * NOWHERE — so `capstone_records` did not exist in any environment and every
 * write to it would have failed the first time a student compiled a record.
 * That is the same failure mode as the pending-invitation sweep, which was also
 * written, also tested, and also scheduled nowhere. Boot wiring is the part that
 * makes schema real; a definition on its own proves only that someone wrote it.
 *
 * ── ORDERING ────────────────────────────────────────────────────────────────
 *
 * MUST run AFTER `community_posts` exists (the inline community DDL and
 * ensureCommunityWinsSchema() in server.ts), because the consent column is an
 * ALTER against that table. On a fresh database — dev, preview stacks, CI — a
 * reversed ordering silently skips the ALTER into its catch and leaves consent
 * unreadable, which reads at runtime as "no student ever consented" rather than
 * as a missing column.
 *
 * Additive only. Nothing here alters or drops an existing column.
 */
export async function ensureCapstoneSchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS capstone_records (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       project_id UUID NOT NULL,
       enrollment_id UUID NOT NULL,
       slug VARCHAR(160) NOT NULL,
       status VARCHAR(20) NOT NULL DEFAULT 'draft',
       visibility VARCHAR(20) NOT NULL DEFAULT 'unlisted',
       content_json JSONB,
       version INTEGER NOT NULL DEFAULT 1,
       published_at TIMESTAMPTZ,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    // The slug IS the public URL, so a collision would hand two students the
    // same address. Unique at the database, not by convention.
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_capstone_records_slug ON capstone_records (slug)`,
    // One record per project: two URLs telling different stories about one body
    // of work, with no way to know which was sent to whom, is the failure this
    // prevents.
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_capstone_records_project ON capstone_records (project_id)`,
    `CREATE INDEX IF NOT EXISTS idx_capstone_records_enrollment ON capstone_records (enrollment_id)`,
    `CREATE TABLE IF NOT EXISTS capstone_record_versions (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       record_id UUID NOT NULL,
       version INTEGER NOT NULL,
       content_json JSONB,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    // Re-compiling an unchanged record must not append a duplicate version row.
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_capstone_versions_record_version ON capstone_record_versions (record_id, version)`,

    // ── per-post consent ────────────────────────────────────────────────────
    // A ritual post was written for a closed cohort of people going through the
    // same thing. A public portfolio is a different audience and a different
    // consent, so appearing there is opt-in PER POST and the default is off.
    // Week 1's Roll Call in particular is often candid about frustration at a
    // named current employer, and republishing that under the student's own
    // name beside their real repo is a harm the platform would be causing, not
    // the student.
    //
    // NOT NULL DEFAULT FALSE is safe on a hot table here: Postgres 11+ stores
    // the default in the catalog rather than rewriting every row, so this does
    // not lock community_posts for a table rewrite.
    `ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS shared_to_portfolio BOOLEAN NOT NULL DEFAULT FALSE`,
    // Only consented posts are ever read for a record, and they are always read
    // by member. Partial index so the common case stays cheap without carrying
    // an entry for the overwhelming majority of posts, which are not consented.
    `CREATE INDEX IF NOT EXISTS idx_community_posts_portfolio ON community_posts (member_id, week) WHERE shared_to_portfolio = TRUE`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] capstone schema stmt skipped:', err?.message?.split('\n')[0]);
    }
  }
  console.log('[DB] Capstone Record schema ensured');
}
