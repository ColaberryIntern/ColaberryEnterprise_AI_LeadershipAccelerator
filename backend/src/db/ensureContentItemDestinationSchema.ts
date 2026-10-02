import { sequelize } from '../config/database';

/**
 * content_items — where the post sends people.
 *
 * THE BUG THIS FIXES. The composer has shown a "Landing page" field since it was built, and the
 * value was never stored. `content_items` had no destination column at all, so it lived in React
 * state and nowhere else. It reached the database only as a side effect of pressing "Generate
 * tracked links", which writes it onto `tracked_links` - so setting a destination and reloading
 * lost it, and an item that had not generated links had no recoverable destination even though
 * the operator had chosen one. Ali hit this as "the landing page I picked didn't stick".
 *
 * TWO COLUMNS, BECAUSE THERE ARE TWO CASES. `landing_page_id` is a page this platform built,
 * which is the only kind that can be tracked end to end - Ali's rule: "we should not be using
 * landing page that wasn't built by this system". `destination_url` is for the destinations that
 * are not ours to build (an external registration page, a partner site) and for the seventeen
 * legacy `external_path` rows. Both nullable: a post need not send anyone anywhere.
 *
 * NOT `metadata`. That JSONB column already exists on the table and would have been one line.
 * It is also where this fact would quietly die: a durable value in a JSONB blob is erased the
 * next time an unrelated writer replaces the object, which has already happened in this repo.
 *
 * WHY A SEPARATE FILE FROM ensureContentOsSchema. That module creates `content_items` and is
 * CREATE-only by contract - its own test asserts the statement list contains no `ALTER TABLE` -
 * so a database that already has the table cannot be migrated from there. It also runs BEFORE
 * `ensureLandingPageSchema` at boot, so a `REFERENCES landing_pages(id)` declared there would
 * point at a table that does not exist yet on a fresh database: the statement would fail, the
 * warn-only DDL loop would swallow it, and the column would simply be absent in CI and on every
 * new environment while working in production, where `landing_pages` has existed all along.
 * That asymmetry is the bug. The columns are declared in both places on purpose - in the CREATE
 * body there for a fresh database, and as ALTERs here for every database that already exists -
 * and this file owns the index and the foreign key, which only make sense once both tables do.
 *
 * Runs AFTER ensureLandingPageSchema. The post-condition emits SchemaInvariantViolation, because
 * the DDL loop only warns and "it booted" proves nothing about what landed.
 */

export const CONTENT_ITEM_DESTINATION_STATEMENTS: readonly string[] = [
  `ALTER TABLE content_items ADD COLUMN IF NOT EXISTS landing_page_id UUID`,
  `ALTER TABLE content_items ADD COLUMN IF NOT EXISTS destination_url VARCHAR(2048)`,

  // "Which posts point at this page" - the question the authoring UI must answer before anyone
  // unpublishes one. Partial: the overwhelming majority of rows have no landing page.
  `CREATE INDEX IF NOT EXISTS idx_content_items_landing_page
     ON content_items (landing_page_id) WHERE landing_page_id IS NOT NULL`,

  // RESTRICT rather than CASCADE: deleting a landing page that a post points at should fail
  // loudly. CASCADE would silently erase the destination of a post that may already have gone
  // out, leaving a published post whose link went nowhere and no record of where it pointed.
  //
  // The guards matter. `duplicate_object` is the second and every later boot. `undefined_table`
  // and `undefined_column` cover the orderings this constraint cannot control - if either table
  // is not there yet, the right outcome is to skip quietly and let the post-condition report it,
  // not to log a failure on every boot forever.
  `DO $$ BEGIN
     ALTER TABLE content_items ADD CONSTRAINT content_items_landing_page_fk
       FOREIGN KEY (landing_page_id) REFERENCES landing_pages(id) ON DELETE RESTRICT;
   EXCEPTION
     WHEN duplicate_object THEN NULL;
     WHEN undefined_table THEN NULL;
     WHEN undefined_column THEN NULL;
   END $$`,
];

const REQUIRED_COLUMNS: readonly string[] = ['landing_page_id', 'destination_url'];

export async function ensureContentItemDestinationSchema(): Promise<{
  ok: boolean;
  /** False when the post-condition could not be evaluated at all - not the same as "nothing missing". */
  verified: boolean;
  missing: string[];
  /** True when the foreign key is present, so a bad landing_page_id cannot be written. */
  foreignKey: boolean;
}> {
  for (const statement of CONTENT_ITEM_DESTINATION_STATEMENTS) {
    try {
      await sequelize.query(statement);
    } catch (err: any) {
      console.warn('[DB] content item destination statement failed:', err?.message);
    }
  }

  let missing: string[] = [];
  let foreignKey = false;
  let verified = false;
  try {
    const [cols]: any = await sequelize.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'content_items'`,
    );
    const present = new Set((cols || []).map((r: any) => r.column_name));
    missing = REQUIRED_COLUMNS.filter((c) => !present.has(c)).map((c) => `content_items.${c}`);

    const [fks]: any = await sequelize.query(
      `SELECT conname FROM pg_constraint WHERE conname = 'content_items_landing_page_fk'`,
    );
    foreignKey = (fks || []).length > 0;
    verified = true;

    if (missing.length > 0 || !foreignKey) {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error', service: 'backend', event: 'SchemaInvariantViolation',
        outcome: 'failure', error_class: 'SchemaInvariantViolation',
        context: {
          tables: ['content_items'],
          missing_columns: missing,
          missing_foreign_key: foreignKey ? null : 'content_items_landing_page_fk',
          impact: missing.length > 0
            ? 'the composer cannot persist a chosen landing page; the destination is lost on reload'
            : 'a content item can point at a landing page that does not exist, and deleting a page in use would not be refused',
        },
      }));
    }
  } catch (err: any) {
    // Never fail the boot over this, but never call it healthy either.
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error', service: 'backend', event: 'SchemaVerificationUnavailable',
      outcome: 'failure', error_class: 'SchemaVerificationUnavailable',
      context: {
        tables: ['content_items'],
        reason: err?.message ?? 'unknown',
        impact: 'the destination columns ran but were never confirmed; treat their shape as unknown',
      },
    }));
  }

  console.log('[DB] Content item destination schema ensured');
  return { ok: verified && missing.length === 0 && foreignKey, verified, missing, foreignKey };
}
