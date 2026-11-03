import { sequelize } from '../config/database';

/**
 * Sign-in link use, recorded on the server (C106, C97 recommendation 3).
 *
 * Whether anyone ever used a sign-in link could not be measured: /portal/verify redirects before the page tracker
 * records it, and the backend request log is lost on every container recreate (C97 R5: zero /portal/verify page
 * events for any visitor).
 *
 *  - sign_in_link_uses: one row per SUCCESSFUL link sign-in (the enrollment and when), at most one per person per
 *    minute: bounded by people and time, even if one valid (reusable) link is replayed in a loop.
 *  - sign_in_link_invalid_daily: one row per day counting invalid or expired links. A counter, not a row per
 *    attempt, because the verify route is public: a flood of junk tokens moves one number, never the table size.
 *
 * Nothing else is stored: never the token, the IP or the user agent. Retention 180 days (signInLinkEvents.ts).
 *
 * Same lazy, memoized creation as the campus tables (server.ts is over the 500-line ceiling). Every statement is
 * IF NOT EXISTS; a failed first run clears the memo so the next call retries.
 */
export const SIGN_IN_LINK_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS sign_in_link_uses (
     id BIGSERIAL PRIMARY KEY,
     enrollment_id UUID NOT NULL,
     used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  'CREATE INDEX IF NOT EXISTS sign_in_link_uses_enrollment_idx ON sign_in_link_uses (enrollment_id, used_at)',
  'CREATE INDEX IF NOT EXISTS sign_in_link_uses_used_idx ON sign_in_link_uses (used_at)',
  `CREATE TABLE IF NOT EXISTS sign_in_link_invalid_daily (
     day DATE PRIMARY KEY,
     invalid_count INTEGER NOT NULL DEFAULT 0,
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
];

type Runner = (sql: string) => Promise<unknown>;
const defaultRunner: Runner = (sql) => sequelize.query(sql);

let inflight: Promise<void> | null = null;

/** Create the tables once per process. Concurrent callers share one run; a failed run is retried next call. */
export function ensureSignInLinkEventsSchema(run: Runner = defaultRunner): Promise<void> {
  if (!inflight) {
    inflight = (async () => { for (const s of SIGN_IN_LINK_STATEMENTS) await run(s); })()
      .catch((err) => { inflight = null; throw err; });
  }
  return inflight;
}

/** Test seam: forget the memo. */
export function __resetSignInLinkEventsSchemaForTests(): void { inflight = null; }
