import { sequelize } from '../../config/database';
import { env } from '../../config/env';
import {
  getRosterWeekBreakdown, weeksOneToThreeClear, weekFromSessionTitle, paceBandFor,
  PaceBand, StudentWeekRow,
} from '../curriculumCompletionService';
import { internActivitySignals, ActivitySignal } from './internConsoleActivity';
import { getProjectDelivery, ProjectStage } from '../projectDeliveryService';

/**
 * internConsoleRoster — one row per active intern, for the Intern Console's top table.
 *
 * ── WHAT IS AND IS NOT ON THIS ROW ──────────────────────────────────────────────────────
 *
 * Every number here is on the Verified-stat allowlist in the run's execution contract, which
 * exists because of one instruction:
 *
 *     "leave attendance off for now. Don't use any stats that aren't working or you can't
 *      verify."  (Ali, 2026-10-01)
 *
 * So there is **no attendance field of any kind** on this row. The whole
 * `internship_meeting_attendance` table held 7 join rows across 2 interns when this was written,
 * and there is no denominator anywhere; `consoleAttendance()` exists, is tested, and is
 * deliberately called by nothing. There is also **no best-or-average cert score**: practice
 * sittings are scored on sets of 1, 10, 15 and 60 items, and a 1-item sitting scoring 1000 is not
 * a score. The sitting COUNT and the last sitting date are facts; an aggregate across those sets
 * would not be.
 *
 * ── ONE QUERY PER SOURCE, NOT ONE PER INTERN ────────────────────────────────────────────
 *
 * Six loaders, each batched: identity, scheduled weeks, training, cert, activity (three of its
 * own), projects. Drawing this table costs the same number of queries for fifty interns as for
 * one. Calling the per-intern services in a loop would be roughly thirty queries per intern,
 * one of them a ten-way union.
 */

/** Cert, as the roster shows it: counts and a date. Never an aggregate score — see the header. */
export interface ConsoleCert {
  readonly sittings: number;
  readonly completed: number;
  readonly last_sitting_at: string | null;
  /** False when `CERT_PREP_ENABLED` is off, so the panel can say so instead of showing zeros. */
  readonly available: boolean;
}

export interface ConsolePace {
  readonly weeks_completed: number;
  readonly scheduled_week: number;
  readonly delta: number;
  readonly band: PaceBand;
}

export interface ConsoleTraining {
  readonly weeks: StudentWeekRow[];
  readonly weeks_completed: number;
  readonly weeks_1_3_clear: boolean;
  /**
   * Null when there is nothing to pace against — see `paceFor`. A null here is the honest
   * answer, and the reason is carried beside it rather than left for the reader to guess.
   */
  readonly pace: ConsolePace | null;
  readonly pace_unavailable: 'no_cohort' | 'cohort_has_no_sessions' | null;
}

export interface ConsoleProject {
  readonly project_id: string;
  readonly name: string | null;
  readonly stage: ProjectStage;
  readonly tasks_total: number;
  readonly tasks_complete: number;
  readonly tasks_pct: number;
  readonly has_repo: boolean;
  readonly command_center_url: string | null;
}

export interface ConsoleRosterRow {
  readonly enrollment_id: string;
  readonly name: string;
  readonly email: string | null;
  /** From `internship_applications.state` — the column is `state`, not `status`. */
  readonly application_state: string | null;
  /**
   * The id of that same LATEST application row, so a console row can open the applicant in the
   * Applications mode. Null when they hold no application at all — the console's Open control
   * renders unavailable rather than linking nowhere.
   *
   * It must come from the same lateral as `application_state`: taking the state from one row and
   * the id from another would open a record that says something different from what the console
   * just showed.
   */
  readonly application_id: string | null;
  readonly joined_at: string | null;
  /** Day 1 is the day they joined, which is how a person counts their own first day. */
  readonly day: number | null;
  readonly cohort: { id: string | null; name: string | null; type: string | null };
  readonly activity: ActivitySignal;
  readonly training: ConsoleTraining;
  readonly cert: ConsoleCert;
  /** Null for an intern with no project, which is the COMMON case — 8 of 10 when written. */
  readonly project: ConsoleProject | null;
}

const DAY_MS = 86_400_000;

interface IdentityRow {
  enrollment_id: string;
  name: string | null;
  email: string | null;
  joined_at: string | Date | null;
  cohort_id: string | null;
  cohort_name: string | null;
  cohort_type: string | null;
  application_state: string | null;
  application_id: string | null;
}

/**
 * The intern population.
 *
 * Two traps, both found in production data rather than reasoned about:
 *
 *  1. **`DISTINCT ON (e.id)`.** An enrollment could hold more than one active internship
 *     membership row, and the roster must be one row per intern — a duplicate would be read as
 *     two interns with the same name.
 *  2. **The application state comes from a LATERAL taking the LATEST row.** One real intern has
 *     two application rows: a `withdrawn` one from 2026-09-21 and an `active` one from the next
 *     day, because reapplying opens a NEW application rather than reviving the old record. A
 *     plain join returns both; a join that happened to pick the older row would label a working
 *     intern as withdrawn on the dashboard their manager reads.
 *
 * Population is `cohort_memberships`, never `enrollments.cohort_id`: an intern's enrollment still
 * points at their CLASS cohort, so filtering on it returns nobody and an empty console reads as
 * "there are no interns" rather than as a wrong query.
 */
async function loadIdentity(only?: readonly string[]): Promise<IdentityRow[]> {
  // Scoping to one intern uses the SAME predicate rather than a second query, so a detail page can
  // never show a row the roster would not have shown — including the "is this person actually an
  // active intern" part, which is what makes the detail endpoint's 404 trustworthy.
  const scope = only && only.length ? 'AND e.id IN (:only)' : '';
  const [rows] = await sequelize.query(
    `SELECT DISTINCT ON (e.id)
            e.id::text                                          AS enrollment_id,
            COALESCE(NULLIF(TRIM(e.full_name), ''), e.email)    AS name,
            e.email,
            cm.joined_at,
            co.id::text                                         AS cohort_id,
            co.name                                             AS cohort_name,
            co.cohort_type,
            ia.state                                            AS application_state,
            ia.id::text                                         AS application_id
       FROM cohort_memberships cm
       JOIN cohorts ic      ON ic.id = cm.cohort_id
       JOIN enrollments e   ON e.id = cm.enrollment_id
       LEFT JOIN cohorts co ON co.id = e.cohort_id
       LEFT JOIN LATERAL (
         SELECT a.state, a.id FROM internship_applications a
          WHERE a.enrollment_id = e.id
          ORDER BY a.updated_at DESC NULLS LAST, a.created_at DESC
          LIMIT 1
       ) ia ON TRUE
      WHERE cm.membership_type = 'internship'
        AND cm.status = 'active'
        AND ic.cohort_type = 'ai_internship'
        ${scope}
      ORDER BY e.id, cm.joined_at DESC`,
    only && only.length ? { replacements: { only: [...only] } } : undefined,
  ) as [IdentityRow[], unknown];
  return rows;
}

/**
 * The week each cohort has actually reached, read off its session titles.
 *
 * Returns no entry for a cohort with no sessions at all, which is the distinction `paceFor`
 * depends on: a cohort that has sessions but none delivered yet is genuinely at week 0, while a
 * cohort with no sessions tells us nothing about the schedule.
 */
async function loadScheduledWeeks(cohortIds: readonly string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const ids = cohortIds.filter(Boolean);
  if (ids.length === 0) return out;

  const [rows] = await sequelize.query(
    `SELECT cohort_id::text AS cohort_id, title, status
       FROM live_sessions WHERE cohort_id IN (:ids) AND status <> 'cancelled'`,
    { replacements: { ids: [...ids] } },
  ) as [Array<{ cohort_id: string; title: string | null; status: string }>, unknown];

  for (const r of rows) {
    const current = out.get(r.cohort_id) ?? 0;
    const week = r.status === 'completed' || r.status === 'live' ? weekFromSessionTitle(r.title) : 0;
    out.set(r.cohort_id, Math.max(current, week));
  }
  return out;
}

/**
 * Cert sitting counts per intern. One query; empty when the feature is off.
 *
 * `env.certPrepEnabled === false` yields an empty map rather than throwing, and the row then
 * carries `available: false` — a panel that says "cert prep is off" is useful, a panel showing
 * zero sittings for everyone is a lie.
 */
async function loadCert(enrollmentIds: readonly string[]): Promise<Map<string, ConsoleCert>> {
  const out = new Map<string, ConsoleCert>();
  if (enrollmentIds.length === 0 || !env.certPrepEnabled) return out;

  const [rows] = await sequelize.query(
    `SELECT enrollment_id::text AS enrollment_id,
            count(*)::int                                        AS sittings,
            count(*) FILTER (WHERE status = 'completed')::int     AS completed,
            max(completed_at)                                    AS last_sitting_at
       FROM cert_sessions WHERE enrollment_id IN (:ids) GROUP BY enrollment_id`,
    { replacements: { ids: [...enrollmentIds] } },
  ) as [Array<{ enrollment_id: string; sittings: number; completed: number; last_sitting_at: string | Date | null }>, unknown];

  for (const r of rows) {
    out.set(r.enrollment_id, {
      sittings: Number(r.sittings),
      completed: Number(r.completed),
      last_sitting_at: r.last_sitting_at ? new Date(r.last_sitting_at).toISOString() : null,
      available: true,
    });
  }
  return out;
}

/** How many weeks this student has cleared — the same count the class dashboard paces on. */
export function weeksCompletedFrom(rows: readonly StudentWeekRow[]): number {
  // The unscheduled bucket (`week: null`) is excluded: it is not a week anyone is behind on.
  return rows.filter((r) => r.week !== null && r.weekDone).length;
}

/**
 * Pace, or an honest refusal to give one.
 *
 * The class dashboard computes `paceBandFor(weeksCompleted - scheduledWeek)` unconditionally. For
 * a cohort with no sessions that makes `scheduledWeek` 0, every delta non-negative, and **every
 * student green or gold** — a badge that looks like a measurement and is not one. That matters
 * here and not there: 8 of the 10 interns sit in a cohort with zero live sessions, so the
 * unconditional form would paint almost the whole console green.
 *
 * So pace is null unless there is something real to compare against. A cohort that HAS sessions
 * but has delivered none is genuinely at week 0 and does get a band — an intern two weeks in
 * before the class starts is really ahead.
 */
export function paceFor(
  weeksCompleted: number,
  cohortId: string | null,
  scheduledWeeks: Map<string, number>,
): { pace: ConsolePace | null; unavailable: ConsoleTraining['pace_unavailable'] } {
  if (!cohortId) return { pace: null, unavailable: 'no_cohort' };
  if (!scheduledWeeks.has(cohortId)) return { pace: null, unavailable: 'cohort_has_no_sessions' };

  const scheduledWeek = scheduledWeeks.get(cohortId)!;
  const delta = weeksCompleted - scheduledWeek;
  return {
    pace: { weeks_completed: weeksCompleted, scheduled_week: scheduledWeek, delta, band: paceBandFor(delta) },
    unavailable: null,
  };
}

/** Day 1 is the join day. Null when we do not know when they joined. */
export function dayOfInternship(joinedAt: string | Date | null, now: Date): number | null {
  if (!joinedAt) return null;
  const started = new Date(joinedAt);
  if (Number.isNaN(started.getTime())) return null;
  return Math.max(1, Math.floor((now.getTime() - started.getTime()) / DAY_MS) + 1);
}

const CERT_OFF: ConsoleCert = { sittings: 0, completed: 0, last_sitting_at: null, available: false };

/**
 * The whole roster.
 *
 * Fail-soft is deliberate per source: a broken cert query must not blank the training column for
 * ten people. Identity is the exception — with no roster there is nothing to render, so that one
 * throws.
 */
export async function getConsoleRoster(
  opts: { now?: Date; enrollmentIds?: readonly string[] } = {},
): Promise<ConsoleRosterRow[]> {
  const now = opts.now ?? new Date();
  const identity = await loadIdentity(opts.enrollmentIds);
  if (identity.length === 0) return [];

  const enrollmentIds = identity.map((r) => r.enrollment_id);
  const cohortIds = [...new Set(identity.map((r) => r.cohort_id).filter((id): id is string => !!id))];

  const soft = async <T>(what: string, run: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await run();
    } catch (err: any) {
      console.warn(`[InternConsoleRoster] ${what} unavailable:`, err?.message);
      return fallback;
    }
  };

  const [scheduledWeeks, training, cert, activity, projects] = await Promise.all([
    soft('scheduled weeks', () => loadScheduledWeeks(cohortIds), new Map<string, number>()),
    soft('training', () => getRosterWeekBreakdown(enrollmentIds), new Map<string, StudentWeekRow[]>()),
    soft('cert', () => loadCert(enrollmentIds), new Map<string, ConsoleCert>()),
    soft('activity', () => internActivitySignals(enrollmentIds, { now }), new Map<string, ActivitySignal>()),
    soft('projects', () => getProjectDelivery({ internsOnly: true }), []),
  ]);

  // Newest project per intern wins: an intern may hold more than one, and the console's column is
  // "what are they building now".
  const projectBy = new Map<string, ConsoleProject>();
  for (const p of projects) {
    if (!p.enrollment_id || projectBy.has(p.enrollment_id)) continue;
    projectBy.set(p.enrollment_id, {
      project_id: p.project_id,
      name: p.name,
      stage: p.stage,
      tasks_total: p.tasks_total,
      tasks_complete: p.tasks_complete,
      tasks_pct: p.tasks_pct,
      has_repo: p.has_repo,
      command_center_url: p.command_center_url,
    });
  }

  const rows = identity.map((r) => {
    const weeks = training.get(r.enrollment_id) ?? [];
    const weeksCompleted = weeksCompletedFrom(weeks);
    const { pace, unavailable } = paceFor(weeksCompleted, r.cohort_id, scheduledWeeks);

    return {
      enrollment_id: r.enrollment_id,
      name: r.name ?? r.email ?? r.enrollment_id,
      email: r.email,
      application_state: r.application_state,
      application_id: r.application_id,
      joined_at: r.joined_at ? new Date(r.joined_at).toISOString() : null,
      day: dayOfInternship(r.joined_at, now),
      cohort: { id: r.cohort_id, name: r.cohort_name, type: r.cohort_type },
      // An intern whose activity lookup found nothing is reported as never, not omitted.
      activity: activity.get(r.enrollment_id) ?? {
        last_activity_at: null, last_activity_source: null, days_since: null,
        level: 'unknown' as const, days: [], graced: false,
      },
      training: {
        weeks,
        weeks_completed: weeksCompleted,
        weeks_1_3_clear: weeksOneToThreeClear(weeks),
        pace,
        pace_unavailable: unavailable,
      },
      cert: cert.get(r.enrollment_id) ?? (env.certPrepEnabled
        ? { sittings: 0, completed: 0, last_sitting_at: null, available: true }
        : CERT_OFF),
      project: projectBy.get(r.enrollment_id) ?? null,
    };
  });

  // Longest-serving first, which is the order a manager reads a roster in.
  return rows.sort((a, b) => (a.joined_at ?? '') .localeCompare(b.joined_at ?? ''));
}

/**
 * The KPI row above the table.
 *
 * Every count here is derived from the roster rows themselves — no second query, so a KPI can
 * never disagree with the table it sits above. And every one of them is a count of rows, not a
 * rate: there is no "average anything" here, because the averages the design asked for were
 * attendance and cert score, and neither is a fact (see the header).
 *
 * `never_active` is kept apart from `dark_10_plus` deliberately. Someone who has never started
 * needs a different conversation from someone who stopped, and folding them together loses the
 * one group that is always worth acting on.
 */
export interface ConsoleCounts {
  readonly interns: number;
  readonly weeks_1_3_clear: number;
  readonly no_project: number;
  readonly quiet_4_plus: number;
  readonly dark_10_plus: number;
  readonly never_active: number;
  readonly cert_started: number;
  readonly paused: number;
  /** How many rows could not be paced at all, so the KPI row can say so rather than imply 100%. */
  readonly pace_unavailable: number;
}

export function consoleCounts(rows: readonly ConsoleRosterRow[]): ConsoleCounts {
  const since = (r: ConsoleRosterRow) => r.activity.days_since;
  return {
    interns: rows.length,
    weeks_1_3_clear: rows.filter((r) => r.training.weeks_1_3_clear).length,
    no_project: rows.filter((r) => r.project === null).length,
    // A never-active intern is NOT counted as quiet or dark: they are counted as never.
    quiet_4_plus: rows.filter((r) => since(r) !== null && since(r)! >= 4).length,
    dark_10_plus: rows.filter((r) => since(r) !== null && since(r)! >= 10).length,
    never_active: rows.filter((r) => since(r) === null).length,
    cert_started: rows.filter((r) => r.cert.available && r.cert.sittings > 0).length,
    paused: rows.filter((r) => r.application_state === 'paused').length,
    pace_unavailable: rows.filter((r) => r.training.pace === null).length,
  };
}
