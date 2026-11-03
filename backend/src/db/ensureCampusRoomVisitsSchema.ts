import { sequelize } from '../config/database';

/**
 * campus_room_visits: an append-only history of which campus building a learner entered, and when (C101).
 *
 * campus_presence keeps ONE row per person, overwritten on every heartbeat, so it answers "where is this person now"
 * and nothing else: the path a new Explorer takes through the campus could not be measured (the C91 audit's limit).
 * This table records a row only when a learner ENTERS a building: their area changed, or they came back after the
 * presence window lapsed. The 30-second heartbeat in the same building writes nothing here.
 *
 * Retention: 90 days (campusRoomVisitRetention.ts, daily). Only enrollment, area and time are stored; a learner who
 * turned off "Show which building I'm in" is never recorded (that path clears presence and does not touch this table).
 *
 * Same lazy, memoized creation as campus_tour_progress (ensureCampusActivitySchema.ts: server.ts is over the 500-line
 * ceiling). Every statement is IF NOT EXISTS; a failed first run clears the memo so the next call retries.
 */
export const CAMPUS_ROOM_VISITS_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS campus_room_visits (
     id BIGSERIAL PRIMARY KEY,
     enrollment_id UUID NOT NULL,
     area VARCHAR(32) NOT NULL,
     entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  'CREATE INDEX IF NOT EXISTS campus_room_visits_enrollment_idx ON campus_room_visits (enrollment_id, entered_at)',
  'CREATE INDEX IF NOT EXISTS campus_room_visits_entered_idx ON campus_room_visits (entered_at)',
];

type Runner = (sql: string) => Promise<unknown>;
const defaultRunner: Runner = (sql) => sequelize.query(sql);

let inflight: Promise<void> | null = null;

/** Create the table once per process. Concurrent callers share one run; a failed run is retried next call. */
export function ensureCampusRoomVisitsSchema(run: Runner = defaultRunner): Promise<void> {
  if (!inflight) {
    inflight = (async () => { for (const s of CAMPUS_ROOM_VISITS_STATEMENTS) await run(s); })()
      .catch((err) => { inflight = null; throw err; });
  }
  return inflight;
}

/** Test seam: forget the memo. */
export function __resetCampusRoomVisitsSchemaForTests(): void { inflight = null; }
