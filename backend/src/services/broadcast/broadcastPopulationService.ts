/**
 * broadcastPopulationService - the cross-occurrence reads C8.10 needs, and the rollup
 * writer the schema has been waiting for.
 *
 * Rules live in `broadcastPopulationPolicy`; this file only moves them to and from
 * Postgres, the same split `broadcastTelemetryService` uses.
 *
 * WHY THIS FILE IS NEW WHEN THE MEASUREMENT IS NOT. `broadcast_viewer_people` already
 * records one row per person per airing, with `playing_seconds` and staff/test flags. That
 * primitive is shipped and is not re-implemented here. What did not exist is any query
 * that crosses occurrences: the only read in the subsystem, `readLiveAudience`, answers
 * "who is watching THIS broadcast RIGHT NOW" within a 45-second freshness window. There
 * was no way to ask "how many distinct learners over a month", which is the question
 * C2.3's break-even is denominated in. This file adds that question and nothing else.
 *
 * THE READ SIDE PROPAGATES. `broadcastTelemetryService`'s header states the rule and the
 * reason: a read that silently returns zero publishes a fabricated zero, and the metrics
 * dictionary calls that a defect rather than a cosmetic issue. Nothing here is best-effort.
 *
 * COUNT(DISTINCT enrollment_id), never COUNT(*), for the same reason the live read gives:
 * the unit is a PERSON. Someone who attended four airings is one learner.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { coverageFor, type DateWindow, type InstrumentCoverage } from './broadcastPopulationPolicy';

/** The house timezone. Month boundaries are wall-clock local, not UTC. */
export const REPORT_TIMEZONE = 'America/Chicago';

export interface PopulationRow {
  airings: number;
  learners: number;
  /** People who chose to watch, on at least one airing in the window. */
  deliberate: number;
  /** Everyone else. Exclusive with `deliberate`, so the two sum to `learners`. */
  auto: number;
  watchSeconds: number;
}

export interface WindowPopulation extends PopulationRow {
  window: DateWindow;
  coverage: InstrumentCoverage;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * The closed-open day window for one calendar month.
 *
 * Exported because the policy's outage comparison and the SQL must agree on what
 * "October 2026" means, and two places computing that separately is how they drift.
 */
export function monthWindow(year: number, month: number): DateWindow {
  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    throw new Error(`broadcast population: year ${year} is out of range`);
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`broadcast population: month ${month} is not 1-12`);
  }
  const nextY = month === 12 ? year + 1 : year;
  const nextM = month === 12 ? 1 : month + 1;
  return { from: `${year}-${pad(month)}-01`, to: `${nextY}-${pad(nextM)}-01` };
}

/**
 * The window clause, shared by both queries so they can never disagree about the month.
 *
 * `AT TIME ZONE` converts a local wall clock to an instant, which is what makes a class
 * that airs at 19:00 Central on the 31st land in the month a human would put it in. A UTC
 * boundary would push it into the next one.
 *
 * `content_started_at`, not `scheduled_start_at`: a broadcast that was scheduled and never
 * went live did not air, and counting it would make the denominator of every rate wrong.
 */
const WINDOW_SQL = `o.content_started_at IS NOT NULL
      AND o.content_started_at >= (make_timestamp(:y, :m, 1, 0, 0, 0) AT TIME ZONE '${REPORT_TIMEZONE}')
      AND o.content_started_at <  ((make_timestamp(:y, :m, 1, 0, 0, 0) + interval '1 month') AT TIME ZONE '${REPORT_TIMEZONE}')`;

/** Exported for the query test, which asserts the window and the exclusions survive edits. */
export const POPULATION_SQL = `
  SELECT
    COUNT(DISTINCT o.id)::text                                            AS airings,
    COUNT(DISTINCT p.enrollment_id)::text                                 AS learners,
    COUNT(DISTINCT p.enrollment_id)
      FILTER (WHERE p.intent = 'deliberate')::text                        AS deliberate,
    COALESCE(SUM(p.playing_seconds), 0)::text                             AS watch_seconds
  FROM broadcast_occurrences o
  LEFT JOIN broadcast_viewer_people p
    ON p.occurrence_id = o.id
   AND p.is_staff = FALSE
   AND p.is_test  = FALSE
  WHERE ${WINDOW_SQL}`;

/**
 * Distinct learners, watch time and airings for one calendar month.
 *
 * The join is a LEFT JOIN on purpose. An INNER JOIN would drop an airing that nobody
 * watched, and then "two airings, no audience" would be indistinguishable from "no
 * airings" - the exact conflation `classifyPopulation` exists to prevent. The airing count
 * has to survive an empty audience for the policy to have anything to reason about.
 *
 * `deliberate` counts a person once if they chose to watch on ANY airing in the window;
 * `auto` is everyone else. Defined that way so the two are exclusive and sum to the total,
 * rather than double-counting someone who drifted in once and chose in once.
 */
export async function readMonthlyPopulation(
  year: number, month: number,
): Promise<WindowPopulation> {
  const window = monthWindow(year, month);

  const rows = await sequelize.query<{
    airings: string; learners: string; deliberate: string; watch_seconds: string;
  }>(POPULATION_SQL, { replacements: { y: year, m: month }, type: QueryTypes.SELECT });

  const r = rows[0];
  const num = (v: string | undefined): number => {
    const n = parseInt(v ?? '0', 10);
    return Number.isFinite(n) ? n : 0;
  };
  const learners = num(r?.learners);
  const deliberate = num(r?.deliberate);

  return {
    window,
    coverage: coverageFor(window),
    airings: num(r?.airings),
    learners,
    deliberate,
    auto: Math.max(0, learners - deliberate),
    watchSeconds: num(r?.watch_seconds),
  };
}

/** Exported for the query test. */
export const ROLLUP_SQL = `
  INSERT INTO broadcast_occurrence_metrics (
    occurrence_id, unique_attendees, watch_seconds, deliberate_viewers, auto_viewers,
    rolled_up_at, updated_at
  )
  SELECT
    :occ,
    COUNT(DISTINCT p.enrollment_id),
    COALESCE(SUM(p.playing_seconds), 0),
    COUNT(DISTINCT p.enrollment_id) FILTER (WHERE p.intent = 'deliberate'),
    COUNT(DISTINCT p.enrollment_id) FILTER (WHERE p.intent <> 'deliberate'),
    :now, :now
  FROM broadcast_viewer_people p
  WHERE p.occurrence_id = :occ AND p.is_staff = FALSE AND p.is_test = FALSE
  ON CONFLICT (occurrence_id) DO UPDATE SET
    unique_attendees   = EXCLUDED.unique_attendees,
    watch_seconds      = EXCLUDED.watch_seconds,
    deliberate_viewers = EXCLUDED.deliberate_viewers,
    auto_viewers       = EXCLUDED.auto_viewers,
    rolled_up_at       = EXCLUDED.rolled_up_at,
    updated_at         = EXCLUDED.updated_at`;

/**
 * Fill the rollup columns the schema declared and nothing has ever written.
 *
 * `unique_attendees`, `watch_seconds`, `deliberate_viewers`, `auto_viewers` and
 * `rolled_up_at` have existed in `broadcast_occurrence_metrics` since the telemetry schema
 * shipped, written by nothing - `recordPeakSample` touches only `peak_concurrency`,
 * `peak_at` and `updated_at`. A declared column that nothing writes is worse than a
 * missing one: it reads as a capability on inspection.
 *
 * IDEMPOTENT BY CONSTRUCTION, as CLAUDE.md requires of every side-effecting service. It
 * recomputes from the viewer rows and overwrites rather than accumulating, so running it
 * twice leaves exactly the state running it once does, and running it after late beats
 * arrive corrects the number instead of inflating it. It deliberately does NOT touch
 * `peak_concurrency` or `peak_at`, which are sampled live and cannot be recovered after
 * the fact.
 *
 * Note the ON CONFLICT: `recordPeakSample` may already have created the row during the
 * broadcast, so this must update rather than insert in the common case.
 */
export async function rollUpOccurrence(occurrenceId: string, nowMs: number): Promise<void> {
  await sequelize.query(ROLLUP_SQL, {
    replacements: { occ: occurrenceId, now: new Date(nowMs) },
  });
}

/** Exported for the query test. */
export const UNROLLED_SQL = `
  SELECT o.id::text AS id
  FROM broadcast_occurrences o
  LEFT JOIN broadcast_occurrence_metrics m ON m.occurrence_id = o.id
  WHERE o.ended_at IS NOT NULL
    AND (m.rolled_up_at IS NULL OR m.rolled_up_at < o.ended_at)
  ORDER BY o.ended_at DESC
  LIMIT :lim`;

/**
 * Finished broadcasts whose rollup is missing or older than the broadcast's own end.
 *
 * The staleness half matters: a beat can land after `ended_at` while a player drains, so a
 * rollup taken at the moment of ending can be short. Re-rolling anything whose rollup
 * predates the end is what makes the number eventually correct rather than merely prompt.
 */
export async function listOccurrencesNeedingRollup(limit = 50): Promise<string[]> {
  const rows = await sequelize.query<{ id: string }>(
    UNROLLED_SQL, { replacements: { lim: limit }, type: QueryTypes.SELECT },
  );
  return rows.map((r) => r.id);
}
