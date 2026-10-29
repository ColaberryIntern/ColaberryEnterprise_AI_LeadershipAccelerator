import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * Widens `scheduled_emails.status` so every status this codebase writes actually fits.
 *
 * WHY THIS EXISTS. `models/ScheduledEmail.ts` declared the column `STRING(20)`, and its
 * comment listed the six statuses that predate the Explorer journey - `pending`,
 * `processing`, `sent`, `failed`, `cancelled`, `paused` - the longest of which is ten
 * characters. The Explorer draft phase then introduced
 * `EXPLORER_DRAFT_REJECTED_STATUS = 'explorer_draft_rejected'`, which is **23 characters**.
 * Against a `VARCHAR(20)` column Postgres does not truncate: it raises `22001`
 * (`value too long for type character varying(20)`) and the INSERT fails. Since the draft
 * is written inside one transaction that also stamps `explorer_journey_decisions`, the
 * whole commit would roll back - so a refused draft would not merely be unrecorded, it
 * would look exactly like "the render never ran", which is the precise confusion the
 * draft phase exists to remove.
 *
 * WHY NOTHING IS BROKEN IN PRODUCTION YET. The code that writes that status is merged but
 * not deployed, and the render is flag-gated behind `EXPLORER_DRAFT_RENDER_ENABLED`. So
 * this is a landmine rather than damage, and widening the column BEFORE that deploy is
 * what keeps it that way. There is no migration runner in this repo and
 * `sequelize.sync({ alter: true })` is off behind `DB_BOOT_SYNC` (see server.ts), so a
 * model-file edit alone changes no live column - this module is how the width actually
 * reaches the database.
 *
 * WHY IT ONLY EVER WIDENS. Narrowing a `varchar` can fail on existing data, and silently
 * losing a status would corrupt the sender's claim predicate, so a column that is already
 * wide enough - or already unbounded `text` - is left exactly as it is. Growing a
 * `varchar`'s declared length is a catalog-only change in modern Postgres: no table
 * rewrite, no lock held for the length of the table, safe to run on every boot.
 *
 * WHY IT REPORTS INSTEAD OF THROWING. Every `ensure*` module here is called from `start()`
 * and the house convention is that a schema statement must never take the API down. This
 * one returns a typed outcome and logs it rather than swallowing silently, so "the widen
 * did not happen" is a readable line in the boot log instead of an absence.
 */

/**
 * The declared width the column must have.
 *
 * 32 rather than 23: it clears the longest status in the codebase with room for the next
 * one, and a status name long enough to exceed 32 characters is a naming problem that
 * should be noticed rather than accommodated. A test pins this against both the model's
 * declared length and every status constant, so the three cannot drift apart.
 */
export const SCHEDULED_EMAIL_STATUS_WIDTH = 32;

/** Probes the column's current declared length. `len` is NULL for an unbounded `text`. */
export const STATUS_WIDTH_PROBE_SQL = `
  SELECT character_maximum_length AS len
    FROM information_schema.columns
   WHERE table_schema = current_schema()
     AND table_name = 'scheduled_emails'
     AND column_name = 'status'`;

/** The widening statement. Issued only when the probe proves the column is too narrow. */
export const STATUS_WIDTH_ALTER_SQL =
  `ALTER TABLE scheduled_emails ALTER COLUMN status TYPE VARCHAR(${SCHEDULED_EMAIL_STATUS_WIDTH})`;

/** What the run concluded. Returned so a caller - and a test - can assert on the decision. */
export type StatusWidthOutcome =
  /** The column was too narrow and has been widened. */
  | 'widened'
  /** Already `VARCHAR(n)` with n >= the required width. Nothing issued. */
  | 'already_wide_enough'
  /** Already unbounded `text`. Nothing issued. */
  | 'unbounded'
  /** No such column in this schema - a fresh database before the table exists. */
  | 'column_absent'
  /** The probe or the alter raised. Logged, not thrown. */
  | 'failed';

type ProbeRow = { len: number | null };

/** Injected so the decision can be tested without a database. */
export interface StatusWidthRunner {
  probe: (sql: string) => Promise<readonly ProbeRow[]>;
  execute: (sql: string) => Promise<unknown>;
}

const defaultRunner: StatusWidthRunner = {
  probe: (sql) => sequelize.query(sql, { type: QueryTypes.SELECT }) as Promise<readonly ProbeRow[]>,
  execute: (sql) => sequelize.query(sql),
};

/**
 * Make `scheduled_emails.status` at least {@link SCHEDULED_EMAIL_STATUS_WIDTH} wide.
 *
 * Idempotent: the probe decides, so a second run on a widened column issues nothing.
 */
export async function ensureScheduledEmailStatusWidth(
  run: StatusWidthRunner = defaultRunner,
): Promise<StatusWidthOutcome> {
  let rows: readonly ProbeRow[];
  try {
    rows = await run.probe(STATUS_WIDTH_PROBE_SQL);
  } catch (err: any) {
    console.warn(
      '[DB] scheduled_emails.status width probe failed:',
      err?.message,
      '(error_class=SchemaProbeFailed)',
    );
    return 'failed';
  }

  const row = rows[0];
  if (!row) {
    // A database that does not have the column yet. Nothing to widen, and nothing wrong:
    // the table is created elsewhere, and this module runs again on the next boot.
    console.log('[DB] scheduled_emails.status absent; width check skipped');
    return 'column_absent';
  }

  // NULL length means `text`, which has no limit at all - already wider than any width
  // this function could ask for.
  if (row.len === null || row.len === undefined) {
    return 'unbounded';
  }

  if (row.len >= SCHEDULED_EMAIL_STATUS_WIDTH) {
    return 'already_wide_enough';
  }

  try {
    await run.execute(STATUS_WIDTH_ALTER_SQL);
  } catch (err: any) {
    console.warn(
      `[DB] scheduled_emails.status widen from ${row.len} to ${SCHEDULED_EMAIL_STATUS_WIDTH} failed:`,
      err?.message,
      '(error_class=SchemaAlterFailed)',
    );
    return 'failed';
  }

  console.log(
    `[DB] scheduled_emails.status widened ${row.len} -> ${SCHEDULED_EMAIL_STATUS_WIDTH}`,
  );
  return 'widened';
}
