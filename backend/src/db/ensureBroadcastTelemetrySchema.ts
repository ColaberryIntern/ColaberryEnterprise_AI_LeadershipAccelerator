/**
 * ensureBroadcastTelemetrySchema — the measurement tables (Colaberry Live, P3-06), additive.
 *
 * THE TABLE SHAPE IS THE WHOLE DESIGN DECISION, so it is argued here rather than assumed.
 *
 * This is the only write path in the build whose volume scales with AUDIENCE rather than with
 * producers. The obvious implementation is an append-only beat log — which is what
 * `session_presence_events` is, and it is exactly what request §7 forbids: 1 000 viewers
 * beating every 15 seconds is 4 000 rows a minute, 240 000 an hour, for one broadcast, and
 * the "who is watching now" query then has to scan a table that grows for ever to answer a
 * question about the last 45 seconds.
 *
 * So nothing here appends. Both hot tables are UPSERTED on a natural key, which makes their
 * row count bounded by the thing being measured instead of by elapsed time:
 *
 *   broadcast_viewer_sessions  — one row per (occurrence, TAB). Bounded by CONCURRENT tabs.
 *                                Carries liveness and the element's state, and is what
 *                                `watching_now` and `peak_concurrency` are computed from. A
 *                                beat is an UPDATE of `last_beat_at`, never an INSERT.
 *   broadcast_viewer_people    — one row per (occurrence, PERSON). Bounded by UNIQUE
 *                                ATTENDEES. Carries credited watch seconds and the sticky
 *                                attributes (intent, access mode, exclusion), and is the row
 *                                that makes two tabs count once. `last_credited_at` is the
 *                                dedup anchor: credit is the gap since this PERSON was last
 *                                credited, so a second tab adds nothing a first already did.
 *   broadcast_occurrence_metrics — one row per occurrence. The rollup, so a finished
 *                                broadcast's numbers survive deleting its session rows.
 *
 * WHAT THIS DATA IS NOT. Derived telemetry. Never billing truth, never entitlement truth, and
 * never an attendance record of the kind `liveSessionAttendanceService` keeps. `access_mode`
 * is stored as the SERVER's decision at measurement time purely so the splits can be reported;
 * nothing reads it back to decide access. Every row for an occurrence may be deleted by
 * occurrence id with no consequence beyond losing a report — which is the stated rollback for
 * this task, and the reason the rollup table exists separately from the hot ones.
 *
 * Conventions, per ADR-003 (the Sept-2026 form, `ensureGovQualificationSchema.ts`):
 *  - DDL hoisted to an exported module-level const so a test can assert the whole set.
 *  - `REQUIRED_TABLES` exported; the assert is called from inside the ensure, one call site.
 *  - Introspection uses `bool_or`, NEVER `array_agg` — Sequelize returns single-column
 *    selects as raw arrays and the `array_agg` form produced a false-negative
 *    SchemaInvariantViolation on prod boot (commits db3f261b, 40f54d56).
 *  - Additive only: every statement is CREATE ... IF NOT EXISTS, no ALTER, DROP or TRUNCATE.
 *  - FKs point only at `broadcast_occurrences`, created by `ensureBroadcastSchema` which runs
 *    first. Person identity is a plain `enrollment_id` column with no FK, matching the house
 *    style and keeping these tables deletable independently of the people in them.
 *  - These tables have NEVER been deployed, so a column may still be added inline. The moment
 *    this ships that stops being true — `CREATE TABLE IF NOT EXISTS` is a no-op against a
 *    database that already has the table, so a later column needs its own
 *    `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` in a separate ensure file.
 */
import { sequelize } from '../config/database';

export const REQUIRED_TABLES: ReadonlyArray<string> = [
  'broadcast_viewer_sessions',
  'broadcast_viewer_people',
  'broadcast_occurrence_metrics',
];

/** What the element reported. Mirrors `PlaybackBeatState` in broadcastTelemetryPolicy. */
export const BEAT_STATES = ['playing', 'buffering', 'paused', 'ended'] as const;

/** Deliberate tune-in vs automatic muted exposure. Never merged — metrics dictionary. */
export const VIEWER_INTENTS = ['deliberate', 'auto'] as const;

const inList = (values: ReadonlyArray<string>): string =>
  values.map((v) => `'${v}'`).join(', ');

export const BROADCAST_TELEMETRY_STATEMENTS: ReadonlyArray<string> = [
  /**
   * One row per TAB. Bounded by concurrent tabs, not by beats.
   *
   * `session_id` is an opaque client-generated tab id. It is NOT identity and is never
   * trusted for anything but collapsing a tab's own repeated beats onto one row — the person
   * is always derived server-side from the authenticated session.
   */
  `CREATE TABLE IF NOT EXISTS broadcast_viewer_sessions (
     occurrence_id   UUID NOT NULL REFERENCES broadcast_occurrences(id) ON DELETE CASCADE,
     session_id      TEXT NOT NULL,
     enrollment_id   UUID NOT NULL,
     state           TEXT NOT NULL DEFAULT 'playing' CHECK (state IN (${inList(BEAT_STATES)})),
     last_beat_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     last_playing_at TIMESTAMPTZ NULL,
     started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     PRIMARY KEY (occurrence_id, session_id)
   )`,

  /**
   * The active-selection index. This is the query whose plan P3-06 must record: "distinct
   * people with a fresh playing beat for this occurrence". Leading with `occurrence_id` and
   * then `last_beat_at` lets the freshness window be a range scan rather than a filter over
   * every session ever opened, and `enrollment_id` is included so the DISTINCT can be
   * answered from the index without touching the heap.
   */
  `CREATE INDEX IF NOT EXISTS idx_bvs_active
     ON broadcast_viewer_sessions (occurrence_id, last_beat_at DESC, state, enrollment_id)`,

  /** Teardown by person, for the rollup and for a viewer-level diagnostic lookup. */
  `CREATE INDEX IF NOT EXISTS idx_bvs_person
     ON broadcast_viewer_sessions (occurrence_id, enrollment_id)`,

  /**
   * One row per PERSON. Bounded by unique attendees.
   *
   * `playing_seconds` is credited, never summed from a log: the server adds the gap since
   * this person was last credited, capped, which is what makes three tabs and one tab produce
   * the same watch time. `is_staff` / `is_test` are the server's answer at first sight and are
   * applied at READ time so a producer still appears in diagnostics while never appearing in
   * the audience number reported upward.
   */
  `CREATE TABLE IF NOT EXISTS broadcast_viewer_people (
     occurrence_id    UUID NOT NULL REFERENCES broadcast_occurrences(id) ON DELETE CASCADE,
     enrollment_id    UUID NOT NULL,
     first_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     last_beat_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     last_credited_at TIMESTAMPTZ NULL,
     playing_seconds  INTEGER NOT NULL DEFAULT 0 CHECK (playing_seconds >= 0),
     intent           TEXT NOT NULL DEFAULT 'auto' CHECK (intent IN (${inList(VIEWER_INTENTS)})),
     access_mode      TEXT NULL,
     is_staff         BOOLEAN NOT NULL DEFAULT FALSE,
     is_test          BOOLEAN NOT NULL DEFAULT FALSE,
     PRIMARY KEY (occurrence_id, enrollment_id)
   )`,

  /** Reporting reads filter the excluded out, so the exclusion is part of the index. */
  `CREATE INDEX IF NOT EXISTS idx_bvp_reportable
     ON broadcast_viewer_people (occurrence_id, is_staff, is_test)`,

  /**
   * The rollup. One row per occurrence, so a finished broadcast's numbers survive deleting
   * the hot rows — which is both the retention story and the rollback for this task.
   *
   * `peak_concurrency` is SAMPLED, not continuous: it is updated whenever an aggregate read
   * observes a higher value. The dictionary's wording is "maximum observed", and this is what
   * makes that literally true rather than aspirational.
   */
  `CREATE TABLE IF NOT EXISTS broadcast_occurrence_metrics (
     occurrence_id      UUID PRIMARY KEY REFERENCES broadcast_occurrences(id) ON DELETE CASCADE,
     unique_attendees   INTEGER NOT NULL DEFAULT 0 CHECK (unique_attendees >= 0),
     peak_concurrency   INTEGER NOT NULL DEFAULT 0 CHECK (peak_concurrency >= 0),
     peak_at            TIMESTAMPTZ NULL,
     watch_seconds      BIGINT NOT NULL DEFAULT 0 CHECK (watch_seconds >= 0),
     deliberate_viewers INTEGER NOT NULL DEFAULT 0 CHECK (deliberate_viewers >= 0),
     auto_viewers       INTEGER NOT NULL DEFAULT 0 CHECK (auto_viewers >= 0),
     rolled_up_at       TIMESTAMPTZ NULL,
     updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
];

/**
 * Fail loudly at boot if a table is missing, rather than at the first heartbeat.
 *
 * `bool_or` per ADR-003: a single-column select comes back from Sequelize as a raw array, and
 * the `array_agg` shape some older ensure files use produced a false-negative violation on
 * prod boot. One row, one boolean per table, no array handling.
 */
export async function assertBroadcastTelemetrySchema(): Promise<void> {
  const checks = REQUIRED_TABLES
    .map((t) => `bool_or(table_name = '${t}') AS has_${t}`)
    .join(', ');
  const [row] = await sequelize.query<Record<string, boolean>>(
    `SELECT ${checks} FROM information_schema.tables WHERE table_schema = 'public'`,
    { type: 'SELECT' as never },
  ) as unknown as Array<Record<string, boolean>>;

  const missing = REQUIRED_TABLES.filter((t) => !row || row[`has_${t}`] !== true);
  if (missing.length) {
    throw new Error(
      `SchemaInvariantViolation: broadcast telemetry tables missing: ${missing.join(', ')}`,
    );
  }
}

export async function ensureBroadcastTelemetrySchema(): Promise<void> {
  for (const statement of BROADCAST_TELEMETRY_STATEMENTS) {
    await sequelize.query(statement);
  }
  await assertBroadcastTelemetrySchema();
}

export default ensureBroadcastTelemetrySchema;
