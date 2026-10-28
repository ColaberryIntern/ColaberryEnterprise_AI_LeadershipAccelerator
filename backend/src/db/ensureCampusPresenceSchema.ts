import { sequelize } from '../config/database';

/**
 * campus_presence: which campus building each learner is in right now (Colaberry Campus C4).
 *
 * DEVIATION, LOGGED ON PURPOSE (CLAUDE.md 12-factor section): every other ensure*Schema in this
 * directory is called from server.ts at boot. server.ts is ~3,580 lines against a 500-line
 * ceiling, and the rule is that the next change to an oversize file splits it before adding to
 * it. Rather than grow it, the campus presence service calls ensureCampusPresenceSchema() lazily
 * and memoizes it per process. Consequences, each handled:
 *  - Idempotent: every statement is IF NOT EXISTS, so re-running is a no-op.
 *  - Two processes racing the very first CREATE can make one of them fail (Postgres pg_type
 *    unique violation). The memo is cleared on failure, so the next call retries; the failed
 *    request surfaces as an error (the UI shows "We can't load who's online"), never as an
 *    empty campus.
 *  - Privilege: the same role already runs ~331 CREATE TABLE IF NOT EXISTS statements at boot.
 * The table is additive (Ali's OK required before merge) and empty until a pilot is allowlisted.
 */

export const CAMPUS_PRESENCE_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS campus_presence (
     enrollment_id UUID PRIMARY KEY,
     area VARCHAR(32) NOT NULL,
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  // CREATE TABLE IF NOT EXISTS is a no-op on an existing table, so columns are also added explicitly.
  `ALTER TABLE campus_presence ADD COLUMN IF NOT EXISTS area VARCHAR(32)`,
  `ALTER TABLE campus_presence ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,
  `CREATE INDEX IF NOT EXISTS idx_campus_presence_updated ON campus_presence (updated_at)`,
  // Campus HQ: the sidebar page (a nav path, never an id) an employee has open in the Management Portal, so staff see which
  // floor and room of the HQ building they are on. Additive and nullable: null = in the building's lobby, or not in HQ at all.
  `ALTER TABLE campus_presence ADD COLUMN IF NOT EXISTS hq_path VARCHAR(128)`,
];

type Runner = (sql: string) => Promise<unknown>;
const defaultRunner: Runner = (sql) => sequelize.query(sql);

let inflight: Promise<void> | null = null;

/** Create the table once per process. Concurrent callers share one run; a failed run is retried next call. */
export function ensureCampusPresenceSchema(run: Runner = defaultRunner): Promise<void> {
  if (!inflight) {
    inflight = (async () => { for (const s of CAMPUS_PRESENCE_STATEMENTS) await run(s); })()
      .catch((err) => { inflight = null; throw err; });
  }
  return inflight;
}

/** Test seam: forget the memo. */
export function __resetCampusPresenceSchemaForTests(): void { inflight = null; }
