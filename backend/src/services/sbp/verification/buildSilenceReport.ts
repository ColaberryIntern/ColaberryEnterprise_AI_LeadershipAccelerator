/**
 * buildSilenceReport - which build projects have stopped being heard from.
 *
 * ----------------------------------------------------------------------------
 * WHY SILENCE AND NOT FREQUENCY
 * ----------------------------------------------------------------------------
 * The ask behind this was "sync more than once a night". Measured, there is no nightly sync and
 * no scheduled verification job anywhere: the live cadence is already per commit and it works.
 * Frequency was never the weak point. A project whose webhook fires verifies dozens of times a
 * week; a project whose webhook was never registered verifies never, and until this module the
 * platform could not tell those two apart. Silence looks identical to "nothing to do".
 *
 * ----------------------------------------------------------------------------
 * WHY THIS REPORTS BUCKETS AND NAMES ONLY THE NEVER-DELIVERED
 * ----------------------------------------------------------------------------
 * Measured against production on 2026-11-18, the 14-day rule in the original plan names **28 of
 * 43** bound projects that have a published plan. Not a tail: the majority. Every one of them is
 * on an ACTIVE enrollment, so scoping to live enrollments removes nothing, and it cannot: the
 * enrollment table holds 1,379 active against 64 withdrawn, which makes "active" the default
 * state rather than evidence that anybody is working.
 *
 * A finding that lists 28 projects every run is noise, and noise gets tuned out inside a week.
 * That is the same failure this workstream exists to end, one level up: a report that looks like
 * oversight and produces none. So the finding carries the RATIO and the BUCKETS, and names only
 * the projects that have NEVER delivered a single webhook. Those three are a broken setup
 * somebody can fix today. The other 25 are a cohort-wide pattern, which is a conversation rather
 * than 25 alerts. The full list stays available, through `listQuietProjects`, for whoever wants
 * to work it.
 *
 * Decided with Ali on 2026-11-18, against those measured numbers rather than in the abstract.
 *
 * ----------------------------------------------------------------------------
 * THE THRESHOLDS ARE STATED, NOT INVENTED
 * ----------------------------------------------------------------------------
 * 14 days is the plan's own figure. The 30 and 60 day bands are chosen to separate "this student
 * paused" from "this project is over", and they are stated here rather than tuned silently.
 * `critical` is reserved for a project that has NEVER been heard from while bound, planned and
 * on an active enrollment, because that is a setup that has never worked, as against work that
 * stopped. The ratio alone is never critical: a majority being quiet is a fact about the cohort,
 * and promoting it to critical every single run is how a report stops being read.
 */

import { QueryTypes } from 'sequelize';

import { sequelize } from '../../../config/database';

/** Days of silence before a project is counted quiet at all. The plan's own figure. */
export const QUIET_AFTER_DAYS = 14;
/** The band edges, in days, separating "paused" from "over". */
export const BAND_DAYS = { paused: 30, over: 60 } as const;

export interface SilenceBuckets {
  /** Bound, planned, active, and never once delivered a webhook. */
  never_delivered: number;
  over_60_days: number;
  from_30_to_60_days: number;
  from_14_to_30_days: number;
  /** Heard from inside the quiet window. */
  delivering: number;
}

export interface QuietProject {
  project_id: string;
  slug: string;
  /** ISO timestamp, or null for a project that has never delivered. */
  last_delivery_at: string | null;
  /** Whole days since the last delivery, or null when there has never been one. */
  days_quiet: number | null;
}

export interface BuildSilenceReport {
  /** Bound to a project, with a published plan, on an active enrollment. */
  population: number;
  /** How many of those have not been heard from in QUIET_AFTER_DAYS. */
  quiet: number;
  buckets: SilenceBuckets;
  /** Only the never-delivered ones are named in the report. See the header. */
  never_delivered: QuietProject[];
  /** Null when the query could not run; the caller must not read that as "nothing is quiet". */
  ok: boolean;
  reason: string | null;
}

/** Finding shape, matching `healthReportService`'s own so this slots in without translation. */
export interface SilenceFinding {
  severity: 'critical' | 'warning' | 'info';
  category: string;
  message: string;
  count?: number;
}

const EMPTY_BUCKETS: SilenceBuckets = {
  never_delivered: 0,
  over_60_days: 0,
  from_30_to_60_days: 0,
  from_14_to_30_days: 0,
  delivering: 0,
};

/**
 * The population, once: bound to a project, that project has a published plan, and the
 * enrollment behind it is not withdrawn. Written once and reused by both queries below so the
 * report and the list can never disagree about who is in scope.
 */
const POPULATION_CTE = `
  WITH bound AS (
    SELECT c.project_id,
           c.repo_owner || '/' || c.repo_name AS slug
      FROM github_connections c
     WHERE c.project_id IS NOT NULL
       AND c.repo_owner IS NOT NULL
       AND c.repo_name IS NOT NULL
  ), published AS (
    SELECT DISTINCT project_id FROM build_plans WHERE status = 'published'
  ), last_seen AS (
    SELECT repo_full_name, MAX(received_at) AS last_delivery
      FROM github_webhook_deliveries
     GROUP BY repo_full_name
  ), scoped AS (
    SELECT b.project_id, b.slug, l.last_delivery
      FROM bound b
      JOIN published p ON p.project_id = b.project_id
      LEFT JOIN projects pr ON pr.id = b.project_id
      LEFT JOIN enrollments e ON e.id = pr.enrollment_id
      LEFT JOIN last_seen l ON l.repo_full_name = b.slug
     WHERE e.status IS NULL OR e.status::text <> 'withdrawn'
  )`;

interface BucketRow {
  bucket: string;
  projects: string | number;
}

interface QuietRow {
  project_id: string;
  slug: string;
  last_delivery: Date | string | null;
}

const iso = (v: Date | string | null): string | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

const daysSince = (v: string | null, now: Date): number | null => {
  if (!v) return null;
  const then = new Date(v).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((now.getTime() - then) / 86400000);
};

/**
 * Count the population into buckets, and name the never-delivered.
 *
 * FAILS SOFT, with `ok: false`. This runs inside a health report that must still render, and a
 * caller must never read a failed query as "nothing is quiet": that is the difference between
 * "we looked and all is well" and "we did not find out", and the whole point of this module is
 * that those two are not the same.
 */
export async function buildSilenceReport(now: Date = new Date()): Promise<BuildSilenceReport> {
  const empty: BuildSilenceReport = {
    population: 0,
    quiet: 0,
    buckets: { ...EMPTY_BUCKETS },
    never_delivered: [],
    ok: false,
    reason: null,
  };

  try {
    const rows = await sequelize.query<BucketRow>(
      `${POPULATION_CTE}
       SELECT CASE
                WHEN last_delivery IS NULL
                  THEN 'never_delivered'
                WHEN last_delivery < NOW() - (INTERVAL '1 day' * ${BAND_DAYS.over})
                  THEN 'over_60_days'
                WHEN last_delivery < NOW() - (INTERVAL '1 day' * ${BAND_DAYS.paused})
                  THEN 'from_30_to_60_days'
                WHEN last_delivery < NOW() - (INTERVAL '1 day' * ${QUIET_AFTER_DAYS})
                  THEN 'from_14_to_30_days'
                ELSE 'delivering'
              END AS bucket,
              COUNT(*) AS projects
         FROM scoped
        GROUP BY 1`,
      { type: QueryTypes.SELECT },
    );

    const buckets = { ...EMPTY_BUCKETS };
    for (const r of rows) {
      if (r.bucket in buckets) {
        (buckets as unknown as Record<string, number>)[r.bucket] = Number(r.projects);
      }
    }

    const named = await sequelize.query<QuietRow>(
      `${POPULATION_CTE}
       SELECT project_id, slug, last_delivery
         FROM scoped
        WHERE last_delivery IS NULL
        ORDER BY slug`,
      { type: QueryTypes.SELECT },
    );

    const population = Object.values(buckets).reduce((n, v) => n + v, 0);
    return {
      population,
      quiet: population - buckets.delivering,
      buckets,
      never_delivered: named.map((r) => ({
        project_id: r.project_id,
        slug: r.slug,
        last_delivery_at: iso(r.last_delivery),
        days_quiet: null,
      })),
      ok: true,
      reason: null,
    };
  } catch (err: any) {
    return { ...empty, reason: err?.message || String(err) };
  }
}

/** Every quiet project, for whoever is going to work the list. Not in the report. */
export async function listQuietProjects(now: Date = new Date()): Promise<QuietProject[]> {
  try {
    const rows = await sequelize.query<QuietRow>(
      `${POPULATION_CTE}
       SELECT project_id, slug, last_delivery
         FROM scoped
        WHERE last_delivery IS NULL
           OR last_delivery < NOW() - (INTERVAL '1 day' * ${QUIET_AFTER_DAYS})
        ORDER BY last_delivery NULLS FIRST`,
      { type: QueryTypes.SELECT },
    );
    return rows.map((r) => {
      const at = iso(r.last_delivery);
      return {
        project_id: r.project_id,
        slug: r.slug,
        last_delivery_at: at,
        days_quiet: daysSince(at, now),
      };
    });
  } catch {
    return [];
  }
}

/**
 * PURE. Turn the report into at most one finding, or null when there is nothing to say.
 *
 * Separate from the query so the wording and the severity rules are testable without a database,
 * which is the half most likely to drift: a threshold is easy to change and a message is easy to
 * make vague.
 */
export function silenceFinding(report: BuildSilenceReport): SilenceFinding | null {
  if (!report.ok) {
    // "We could not find out" is reported as itself. Reporting nothing would be indistinguishable
    // from a healthy cohort, which is the exact confusion this module exists to remove.
    return {
      severity: 'warning',
      category: 'Build sync',
      message: 'The build silence check could not run, so nothing is known about which projects '
        + `have stopped reporting. ${report.reason ? `Reason: ${report.reason}` : ''}`.trim(),
    };
  }
  if (report.population === 0) {
    return null;
  }
  if (report.quiet === 0) {
    return {
      severity: 'info',
      category: 'Build sync',
      message: `All ${report.population} bound build projects have reported in within `
        + `${QUIET_AFTER_DAYS} days.`,
      count: 0,
    };
  }

  const b = report.buckets;
  const names = report.never_delivered.map((p) => p.slug).join(', ');
  const bands = [
    b.never_delivered ? `${b.never_delivered} never` : '',
    b.over_60_days ? `${b.over_60_days} over ${BAND_DAYS.over} days` : '',
    b.from_30_to_60_days ? `${b.from_30_to_60_days} ${BAND_DAYS.paused} to ${BAND_DAYS.over} days` : '',
    b.from_14_to_30_days ? `${b.from_14_to_30_days} ${QUIET_AFTER_DAYS} to ${BAND_DAYS.paused} days` : '',
  ].filter(Boolean).join(', ');

  const head = `${report.quiet} of ${report.population} bound build projects have not reported a `
    + `push in ${QUIET_AFTER_DAYS} days (${bands}).`;

  // Critical is reserved for a setup that has NEVER worked, as against work that stopped. Those
  // are the only ones named, and they are the only ones somebody can fix today.
  if (b.never_delivered > 0) {
    return {
      severity: 'critical',
      category: 'Build sync',
      message: `${head} ${b.never_delivered} have never delivered a single webhook while bound to `
        + `a project with a published plan, which means their setup has never worked: ${names}.`,
      count: report.quiet,
    };
  }

  return { severity: 'warning', category: 'Build sync', message: head, count: report.quiet };
}
