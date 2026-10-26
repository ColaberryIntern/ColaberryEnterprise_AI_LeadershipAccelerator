import { sequelize } from '../config/database';

/**
 * Two small, additive campus activity tables (Explorer Growth, Ali 2026-10-26: "how many tours have been taken and how many steps of
 * how many completed", "meetings booked"). Neither existed: tour progress lived only in the browser, and a campus admissions call
 * lives only on the Google Calendar. Both count from the day this ships; nothing can be backfilled.
 *
 *  - campus_tour_progress: one row per learner per tour (member / explorer / business): when it started, the furthest stop reached
 *    out of how many, and when it was finished. The furthest stop only ever grows (GREATEST), so a replayed or out-of-order write
 *    never moves it back.
 *  - campus_admissions_bookings: one row per calendar event booked from the campus (the calendar stays the source of truth for the
 *    meeting itself; this is the log staff can count). Keyed on the calendar event id, so a retried booking writes once.
 *
 * Same lazy, memoized creation as campus_looks (ensureCampusLooksSchema.ts: server.ts is over the 500-line ceiling). Every statement
 * is IF NOT EXISTS; a failed first run clears the memo so the next call retries.
 */
export const CAMPUS_ACTIVITY_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS campus_tour_progress (
     enrollment_id UUID NOT NULL,
     tour TEXT NOT NULL,
     furthest_stop INTEGER NOT NULL DEFAULT 0,
     total_stops INTEGER NOT NULL DEFAULT 0,
     started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     finished_at TIMESTAMPTZ NULL,
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     PRIMARY KEY (enrollment_id, tour)
   )`,
  `CREATE TABLE IF NOT EXISTS campus_admissions_bookings (
     calendar_event_id TEXT PRIMARY KEY,
     enrollment_id UUID NOT NULL,
     starts_at TIMESTAMPTZ NOT NULL,
     topic TEXT NULL,
     status TEXT NOT NULL DEFAULT 'booked',
     booked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     cancelled_at TIMESTAMPTZ NULL
   )`,
  'CREATE INDEX IF NOT EXISTS campus_admissions_bookings_enrollment_idx ON campus_admissions_bookings (enrollment_id)',
];

type Runner = (sql: string) => Promise<unknown>;
const defaultRunner: Runner = (sql) => sequelize.query(sql);

let inflight: Promise<void> | null = null;

/** Create the tables once per process. Concurrent callers share one run; a failed run is retried next call. */
export function ensureCampusActivitySchema(run: Runner = defaultRunner): Promise<void> {
  if (!inflight) {
    inflight = (async () => { for (const s of CAMPUS_ACTIVITY_STATEMENTS) await run(s); })()
      .catch((err) => { inflight = null; throw err; });
  }
  return inflight;
}

/** Test seam: forget the memo. */
export function __resetCampusActivitySchemaForTests(): void { inflight = null; }
