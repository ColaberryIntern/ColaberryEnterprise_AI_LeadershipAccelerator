/**
 * acceleratorCurrentClassesService — the "what is running right now" snapshot
 * that heads the Accelerator admin page.
 *
 * The question this answers is narrower than "list the cohorts": it is *which
 * classes are in flight today, and how are those students doing*. Three rules
 * define that, and each exists because a cohort table row alone gets it wrong:
 *
 *  1. A class must have scheduled live sessions. Without this the self-paced
 *     "Explorer — Prospects" pool (325 members, no sessions, open forever)
 *     dominates every average on the page while teaching nobody. A prospect
 *     pool is not a class.
 *  2. It must have started — its first session is today or earlier. A cohort
 *     that starts in November has no attendance to report in September, and
 *     showing it as 0% reads as failure rather than as "not begun".
 *  3. It must not have finished — its last session is today or later. Status
 *     alone cannot carry this: cohorts routinely teach out their final weeks
 *     while still marked `open`, and are marked `completed` by hand, late.
 *
 * Selection is a pure function over already-fetched rows so the rules above are
 * unit-testable without a database; `now` is injected rather than read from the
 * clock for the same reason.
 */
import { Op, QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
// MUST come from '../models', never from '../models/Cohort' directly. The model
// FILES only define columns; every association is wired in models/index.ts, so
// a direct import yields a Cohort that has no `program` association and throws
// "Association with alias program does not exist" the first time this runs.
// That is a RUNTIME failure only — it typechecks, unit-tests pass, and CI is
// green, because the include is resolved by Sequelize at query time.
import { Cohort, LiveSession } from '../models';

/** One cohort reduced to the fields the selection rules actually read. */
export interface ClassCandidate {
  id: string;
  status: string;
  sessionCount: number;
  firstSessionDate: string | null;
  lastSessionDate: string | null;
}

export type ClassPhase = 'in_flight' | 'starting_soon' | 'finished' | 'not_a_class';

/** ISO `YYYY-MM-DD` for a Date, in UTC. Session dates are stored date-only, so
 *  comparing as strings avoids the naive-`new Date(wallclock)` timezone trap. */
export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Which phase a cohort is in today. Pure. Exported for its own tests, and
 * because "starting soon" is worth showing even though it is not "current":
 * an empty dashboard on the day before an intake is not a useful answer.
 */
export function classifyCohort(c: ClassCandidate, now: Date): ClassPhase {
  if (c.sessionCount === 0) return 'not_a_class';
  const today = isoDay(now);
  const first = c.firstSessionDate;
  const last = c.lastSessionDate;
  if (first && first > today) return 'starting_soon';
  if (last && last < today) return 'finished';
  return 'in_flight';
}

/** The cohorts teaching today, in the order a reader wants them: soonest to finish first. */
export function selectCurrentClasses<T extends ClassCandidate>(rows: T[], now: Date): T[] {
  return rows
    .filter((r) => classifyCohort(r, now) === 'in_flight')
    .sort((a, b) => String(a.lastSessionDate ?? '').localeCompare(String(b.lastSessionDate ?? '')));
}

/** The cohorts whose first session is still ahead, nearest intake first. */
export function selectStartingSoon<T extends ClassCandidate>(rows: T[], now: Date): T[] {
  return rows
    .filter((r) => classifyCohort(r, now) === 'starting_soon')
    .sort((a, b) => String(a.firstSessionDate ?? '').localeCompare(String(b.firstSessionDate ?? '')));
}

export interface CurrentClassStats {
  cohort_id: string;
  name: string;
  program_name: string | null;
  status: string;
  start_date: string | null;
  sessions_total: number;
  sessions_completed: number;
  /** Whole-percent progress through the scheduled sessions. */
  pct_complete: number;
  first_session_date: string | null;
  last_session_date: string | null;
  next_session: {
    id: string;
    session_number: number;
    title: string;
    session_date: string;
    start_time: string | null;
  } | null;
  enrollments_active: number;
  avg_readiness: number | null;
  avg_attendance: number | null;
  /** Active students whose attendance has fallen below ATTENDANCE_RISK_FLOOR. */
  at_risk_count: number;
  /** Null when the count could not be computed — distinct from 0, which is a
   *  claim that the review queue is empty. */
  submissions_pending: number | null;
}

/** Below this attendance percentage a student is surfaced as at risk. */
export const ATTENDANCE_RISK_FLOOR = 60;

/**
 * The members of `enum_enrollments_status`, verified against production.
 *
 * Pinned here because Postgres REJECTS a comparison against a literal that is
 * not a member of the enum — `status NOT IN ('withdrawn','cancelled')` does not
 * quietly match nothing, it raises `invalid input value for enum` and 500s the
 * whole endpoint. A typo is an outage, not a wrong number, so the exclusion list
 * below is checked against this one in tests.
 */
export const ENROLLMENT_STATUSES = ['active', 'completed', 'withdrawn', 'suspended'] as const;

/**
 * Statuses that mean "no longer a student in this class".
 *
 * Only `withdrawn`, matching `cohortService.getCohortDependents`, which uses the
 * same rule. `suspended` is deliberately NOT excluded: suspension is routine and
 * transient on this platform (the CCPP dashboard re-suspends nightly), so
 * treating it as "gone" would undercount live classes on any given morning.
 */
export const DEPARTED_ENROLLMENT_STATUSES = ['withdrawn'] as const;

/** `assignment_submissions.status` values that mean "a human still owes this a
 *  review" — as opposed to `reviewed` / `flagged`, which have been looked at. */
export const AWAITING_REVIEW_STATUSES = ['pending', 'submitted'] as const;

/**
 * One query per concern rather than one wide join: the session aggregate and
 * the enrollment aggregate have different grains, and joining them would
 * multiply the per-student rows by the session count and silently inflate every
 * average — the classic fan-out. Both are keyed by cohort_id and merged in JS.
 */
async function loadCohortRollups(): Promise<Map<string, {
  sessionCount: number; completed: number; first: string | null; last: string | null;
}>> {
  const rows = await sequelize.query<{
    cohort_id: string; session_count: string; completed: string; first_date: string | null; last_date: string | null;
  }>(
    `SELECT cohort_id,
            COUNT(*)                                          AS session_count,
            COUNT(*) FILTER (WHERE status = 'completed')      AS completed,
            MIN(session_date)::text                           AS first_date,
            MAX(session_date)::text                           AS last_date
       FROM live_sessions
      WHERE status <> 'cancelled'
      GROUP BY cohort_id`,
    { type: QueryTypes.SELECT }
  );
  return new Map(rows.map((r) => [r.cohort_id, {
    sessionCount: Number(r.session_count),
    completed: Number(r.completed),
    first: r.first_date ? String(r.first_date).slice(0, 10) : null,
    last: r.last_date ? String(r.last_date).slice(0, 10) : null,
  }]));
}

async function loadEnrollmentRollups(cohortIds: string[]): Promise<Map<string, {
  active: number; avgReadiness: number | null; avgAttendance: number | null; atRisk: number;
}>> {
  if (!cohortIds.length) return new Map();
  const rows = await sequelize.query<{
    cohort_id: string; active: string; avg_readiness: string | null;
    avg_attendance: string | null; at_risk: string;
  }>(
    `SELECT cohort_id,
            COUNT(*)                                                    AS active,
            AVG(readiness_score)  FILTER (WHERE readiness_score  IS NOT NULL) AS avg_readiness,
            AVG(attendance_score) FILTER (WHERE attendance_score IS NOT NULL) AS avg_attendance,
            COUNT(*) FILTER (WHERE attendance_score IS NOT NULL
                               AND attendance_score < :floor)           AS at_risk
       FROM enrollments
      WHERE cohort_id IN (:ids)
        AND status NOT IN (:departed)
      GROUP BY cohort_id`,
    {
      replacements: {
        ids: cohortIds,
        floor: ATTENDANCE_RISK_FLOOR,
        departed: [...DEPARTED_ENROLLMENT_STATUSES],
      },
      type: QueryTypes.SELECT,
    }
  );
  const num = (v: string | null) => (v == null ? null : Math.round(Number(v) * 10) / 10);
  return new Map(rows.map((r) => [r.cohort_id, {
    active: Number(r.active),
    avgReadiness: num(r.avg_readiness),
    avgAttendance: num(r.avg_attendance),
    atRisk: Number(r.at_risk),
  }]));
}

/**
 * Submissions still awaiting a human review, per cohort.
 *
 * The table is `assignment_submissions`. An earlier version of this queried a
 * table called `submissions`, which does not exist — and because the failure was
 * swallowed silently, every cohort reported "0 awaiting review" as though the
 * queue were empty. A metric that cannot be computed must not render as a
 * reassuring zero, so the failure is now LOGGED with an error class, and the
 * caller distinguishes "none pending" from "could not tell" via a null.
 */
async function loadPendingSubmissions(cohortIds: string[]): Promise<Map<string, number> | null> {
  if (!cohortIds.length) return new Map();
  try {
    const rows = await sequelize.query<{ cohort_id: string; pending: string }>(
      `SELECT e.cohort_id, COUNT(*) AS pending
         FROM assignment_submissions s
         JOIN enrollments e ON e.id = s.enrollment_id
        WHERE e.cohort_id IN (:ids)
          AND s.status IN (:awaiting)
        GROUP BY e.cohort_id`,
      {
        replacements: { ids: cohortIds, awaiting: [...AWAITING_REVIEW_STATUSES] },
        type: QueryTypes.SELECT,
      }
    );
    return new Map(rows.map((r) => [r.cohort_id, Number(r.pending)]));
  } catch (err: any) {
    // Fail soft on the METRIC, loudly in the log: one unavailable count must not
    // blank a dashboard that is otherwise correct, but it must not pass for zero.
    console.error(JSON.stringify({
      level: 'error',
      service: 'accelerator-current-classes',
      event: 'pending_submissions_query_failed',
      outcome: 'partial',
      error_class: err?.name || 'QueryError',
      context: { message: err?.message },
    }));
    return null;
  }
}

async function loadNextSessions(cohortIds: string[], today: string) {
  if (!cohortIds.length) return new Map<string, CurrentClassStats['next_session']>();
  const rows = await LiveSession.findAll({
    where: {
      cohort_id: { [Op.in]: cohortIds },
      session_date: { [Op.gte]: today },
      status: { [Op.notIn]: ['cancelled', 'completed'] },
    },
    order: [['session_date', 'ASC'], ['start_time', 'ASC']],
  });
  const byCohort = new Map<string, CurrentClassStats['next_session']>();
  for (const s of rows) {
    // Ordered ascending, so the first row seen per cohort is the next session.
    if (byCohort.has(s.cohort_id)) continue;
    byCohort.set(s.cohort_id, {
      id: s.id,
      session_number: s.session_number,
      title: s.title,
      session_date: String(s.session_date).slice(0, 10),
      start_time: s.start_time ?? null,
    });
  }
  return byCohort;
}

export interface CurrentClassesSnapshot {
  as_of: string;
  current: CurrentClassStats[];
  starting_soon: Array<{
    cohort_id: string; name: string; program_name: string | null;
    first_session_date: string | null; enrollments_active: number; sessions_total: number;
  }>;
  totals: {
    classes_in_flight: number;
    students_in_class: number;
    avg_attendance: number | null;
    avg_readiness: number | null;
    at_risk_count: number;
  };
}

/**
 * The snapshot rendered above the Cohorts table. Aggregates only over classes
 * that are actually in flight, so the headline numbers describe teaching in
 * progress rather than the whole historical cohort estate.
 */
export async function getCurrentClassesSnapshot(now: Date = new Date()): Promise<CurrentClassesSnapshot> {
  const today = isoDay(now);

  const cohorts = await Cohort.findAll({
    include: [{ association: 'program', attributes: ['id', 'name'], required: false }],
  });
  const rollups = await loadCohortRollups();

  const candidates = cohorts.map((c) => {
    const r = rollups.get(c.id);
    return {
      id: c.id,
      status: c.status,
      sessionCount: r?.sessionCount ?? 0,
      firstSessionDate: r?.first ?? null,
      lastSessionDate: r?.last ?? null,
      row: c,
      rollup: r,
    };
  });

  const inFlight = selectCurrentClasses(candidates, now);
  const soon = selectStartingSoon(candidates, now);
  const allIds = [...inFlight, ...soon].map((c) => c.id);

  const [enrolls, pending, nextSessions] = await Promise.all([
    loadEnrollmentRollups(allIds),
    loadPendingSubmissions(inFlight.map((c) => c.id)),
    loadNextSessions(inFlight.map((c) => c.id), today),
  ]);

  const current: CurrentClassStats[] = inFlight.map((c) => {
    const row: any = c.row;
    const e = enrolls.get(c.id);
    const total = c.sessionCount;
    const done = c.rollup?.completed ?? 0;
    return {
      cohort_id: c.id,
      name: row.name,
      program_name: row.program?.name ?? null,
      status: row.status,
      start_date: row.start_date ? String(row.start_date).slice(0, 10) : null,
      sessions_total: total,
      sessions_completed: done,
      pct_complete: total > 0 ? Math.round((done / total) * 100) : 0,
      first_session_date: c.firstSessionDate,
      last_session_date: c.lastSessionDate,
      next_session: nextSessions.get(c.id) ?? null,
      enrollments_active: e?.active ?? 0,
      avg_readiness: e?.avgReadiness ?? null,
      avg_attendance: e?.avgAttendance ?? null,
      at_risk_count: e?.atRisk ?? 0,
      submissions_pending: pending ? (pending.get(c.id) ?? 0) : null,
    };
  });

  // Headline averages are weighted by head count, not by cohort: a 49-student
  // class and a 2-student class must not contribute equally to "how are they
  // doing". Cohorts with no score yet are excluded from the average rather than
  // counted as zero, which would read as failure instead of as "not measured".
  const weighted = (pick: (s: CurrentClassStats) => number | null): number | null => {
    let num = 0;
    let den = 0;
    for (const s of current) {
      const v = pick(s);
      if (v == null || s.enrollments_active === 0) continue;
      num += v * s.enrollments_active;
      den += s.enrollments_active;
    }
    return den === 0 ? null : Math.round((num / den) * 10) / 10;
  };

  return {
    as_of: now.toISOString(),
    current,
    starting_soon: soon.map((c) => {
      const row: any = c.row;
      return {
        cohort_id: c.id,
        name: row.name,
        program_name: row.program?.name ?? null,
        first_session_date: c.firstSessionDate,
        enrollments_active: enrolls.get(c.id)?.active ?? 0,
        sessions_total: c.sessionCount,
      };
    }),
    totals: {
      classes_in_flight: current.length,
      students_in_class: current.reduce((n, s) => n + s.enrollments_active, 0),
      avg_attendance: weighted((s) => s.avg_attendance),
      avg_readiness: weighted((s) => s.avg_readiness),
      at_risk_count: current.reduce((n, s) => n + s.at_risk_count, 0),
    },
  };
}
