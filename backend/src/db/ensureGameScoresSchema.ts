import { sequelize } from '../config/database';

/**
 * game_scores: one row per Game Room play RUN (Colaberry Campus C10). Ali approved the table on 2026-10-18 ("c10 looks good").
 *
 * A run carries both its server-measured play seconds (the 15-minute daily cap is the SUM over the learner's runs for the Central
 * day) and, once submitted, its score (the leaderboard reads accepted scores). Same lazy, memoized creation as campus_presence and
 * campus_looks (see ensureCampusPresenceSchema.ts for the logged deviation from boot-time creation): every statement is IF NOT
 * EXISTS, and a failed first run clears the memo so the next call retries.
 */
export const GAME_SCORES_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS game_scores (
     id UUID PRIMARY KEY,
     enrollment_id UUID NOT NULL,
     cohort_id UUID NULL,
     game VARCHAR(20) NOT NULL,
     central_date DATE NOT NULL,
     started_at TIMESTAMPTZ NOT NULL,
     last_beat_at TIMESTAMPTZ NOT NULL,
     seconds_used INTEGER NOT NULL DEFAULT 0,
     score INTEGER NULL,
     submitted_at TIMESTAMPTZ NULL
   )`,
  `ALTER TABLE game_scores ADD COLUMN IF NOT EXISTS score INTEGER NULL`,
  `ALTER TABLE game_scores ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ NULL`,
  `CREATE INDEX IF NOT EXISTS idx_game_scores_day ON game_scores (enrollment_id, central_date)`,
  `CREATE INDEX IF NOT EXISTS idx_game_scores_board ON game_scores (cohort_id, game, central_date)`,
];

type Runner = (sql: string) => Promise<unknown>;
const defaultRunner: Runner = (sql) => sequelize.query(sql);

let inflight: Promise<void> | null = null;

/** Create the table once per process. Concurrent callers share one run; a failed run is retried next call. */
export function ensureGameScoresSchema(run: Runner = defaultRunner): Promise<void> {
  if (!inflight) {
    inflight = (async () => { for (const s of GAME_SCORES_STATEMENTS) await run(s); })()
      .catch((err) => { inflight = null; throw err; });
  }
  return inflight;
}

/** Test seam: forget the memo. */
export function __resetGameScoresSchemaForTests(): void { inflight = null; }
