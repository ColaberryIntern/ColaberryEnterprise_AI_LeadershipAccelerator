import { sequelize } from '../config/database';

/**
 * community_board_seen (Campus v14 B1 + B3, Basecamp C66): when a learner last looked at the Community Board ("board") and at each of
 * their own posts ("post:<id>"), so "new since you looked" and "new replies" work across devices (it lived in localStorage,
 * cm-board-seen). One additive table rather than a column on the enrollment row, because it holds a per-post scope too.
 *
 * Same lazy, memoized creation as campus_looks (ensureCampusLooksSchema.ts: server.ts is over the 500-line ceiling). IF NOT EXISTS
 * throughout; a failed first run clears the memo so the next call retries.
 */
export const COMMUNITY_BOARD_SEEN_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS community_board_seen (
     enrollment_id UUID NOT NULL,
     scope TEXT NOT NULL,
     seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     PRIMARY KEY (enrollment_id, scope)
   )`,
];

type Runner = (sql: string) => Promise<unknown>;
const defaultRunner: Runner = (sql) => sequelize.query(sql);

let inflight: Promise<void> | null = null;

export function ensureCommunityBoardSeenSchema(run: Runner = defaultRunner): Promise<void> {
  if (!inflight) {
    inflight = (async () => { for (const s of COMMUNITY_BOARD_SEEN_STATEMENTS) await run(s); })()
      .catch((err) => { inflight = null; throw err; });
  }
  return inflight;
}

/** Test seam: forget the memo. */
export function __resetCommunityBoardSeenSchemaForTests(): void { inflight = null; }
