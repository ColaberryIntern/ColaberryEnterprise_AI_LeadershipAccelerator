import { sequelize } from '../config/database';

/**
 * campus_looks: the avatar gear each learner has chosen to wear (Colaberry Campus C9). Ali approved the table on 2026-10-19.
 *
 * Same lazy, memoized creation as campus_presence (ensureCampusPresenceSchema.ts explains the logged deviation from boot-time
 * creation: server.ts is far over the 500-line ceiling). Every statement is IF NOT EXISTS; a failed first run (two processes racing
 * the CREATE) clears the memo so the next call retries, and the failed request surfaces as an error, never as an empty look.
 * Only the CHOICE is stored; what is unlocked is computed from points every time (campusUnlocks).
 */
export const CAMPUS_LOOKS_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS campus_looks (
     enrollment_id UUID PRIMARY KEY,
     equipped JSONB NOT NULL DEFAULT '{}'::jsonb,
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `ALTER TABLE campus_looks ADD COLUMN IF NOT EXISTS equipped JSONB DEFAULT '{}'::jsonb`,
  `ALTER TABLE campus_looks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,
];

type Runner = (sql: string) => Promise<unknown>;
const defaultRunner: Runner = (sql) => sequelize.query(sql);

let inflight: Promise<void> | null = null;

/** Create the table once per process. Concurrent callers share one run; a failed run is retried next call. */
export function ensureCampusLooksSchema(run: Runner = defaultRunner): Promise<void> {
  if (!inflight) {
    inflight = (async () => { for (const s of CAMPUS_LOOKS_STATEMENTS) await run(s); })()
      .catch((err) => { inflight = null; throw err; });
  }
  return inflight;
}

/** Test seam: forget the memo. */
export function __resetCampusLooksSchemaForTests(): void { inflight = null; }
