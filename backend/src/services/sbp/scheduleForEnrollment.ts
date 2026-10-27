/**
 * scheduleForEnrollment — real cohort dates for one student's build.
 *
 * Extracted from sbpOrchestrator because the schedule is now needed on TWO
 * paths rather than one. Publishing needs it (due dates go into the documents
 * and into the materialized tasks) and so does the sync-time document refresh,
 * which rewrites `.colaberry/plan.json` with the same dates. A second copy of
 * this lookup is exactly how the two would drift — one writing a demo day the
 * other never mentions.
 *
 * Null is a NORMAL outcome, not an error: with no anchor to date against, tasks
 * materialize without due dates, exactly as they did before dates existed. A
 * missing date must never cost a student their build.
 *
 * TWO ANCHORS, because there are now two kinds of learner.
 *
 * A cohort learner is anchored on `cohorts.start_date` and always has been. A
 * SELF-PACED learner has no cohort at all — `enrollments.cohort_id` is nullable
 * precisely so they can exist — and until this function grew a second anchor
 * they fell through an INNER JOIN and got no dates whatsoever. Measured on
 * production 2026-10-27: cohort learners carried due dates on 74.3% of their
 * tasks, cohort-less learners on 10.5%.
 *
 * The self-paced anchor is the day their PLAN WAS PUBLISHED, not the day they
 * signed up. Signup date is the tempting choice and it is wrong: somebody who
 * enrolled in July and had a plan built in November would find every deadline
 * already in the past, which is the born-overdue failure this file exists to
 * prevent. For a learner working on their own time, the programme starts when
 * there is a programme to work on.
 *
 * Everything downstream is deliberately unchanged. The same relative week
 * offsets apply, so a self-paced learner gets the same shaped programme as a
 * cohort, beginning on their own day. That is a DEFAULT, not a policy: no new
 * pacing rule is invented here, and changing the self-paced length later means
 * changing week numbers and nothing else.
 *
 * `publishedAt` is the OTHER half of the window and just as load-bearing as the
 * cohort start. The cohort says when the build window would open; the publish
 * timestamp says when the plan actually existed. Feed only the first and you
 * get what the July 2026 cohort got — 21 builds published 2026-08-14..08-17
 * against a window that opened on the 13th, and 44 tasks overdue before anyone
 * had read them.
 */
import { BuildPlan } from './planContract';
import { buildSchedule, Schedule, DEFAULT_PREP_WEEK, DEFAULT_START_WEEK } from './buildSchedule';

function log(event: string, correlationId: string | null | undefined, outcome: string, ctx: Record<string, unknown>): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'error' : 'info',
    service: 'sbp-schedule',
    event,
    correlation_id: correlationId ?? null,
    outcome,
    context: ctx,
  }));
}

/** Which clock dated this build. Logged so a date can always be explained. */
export type ScheduleAnchorKind = 'cohort_start' | 'self_paced_plan_published';

/**
 * The anchor for a learner with no cohort.
 *
 * Returns null rather than reaching for `Date.now()`. A wall-clock anchor would
 * re-date the whole build every time the documents were refreshed, which is the
 * same drift `publishedAt` was introduced to stop — and a schedule that moves
 * when you look at it is not a deadline.
 */
export function selfPacedAnchor(
  publishedAt: Date | null,
  enrollmentCreatedAt: Date | string | null | undefined,
): Date | null {
  if (publishedAt && !Number.isNaN(publishedAt.getTime())) return publishedAt;
  // Fallback for a plan that has never published: the signup date is the only
  // other fixed point we hold, and it is strictly better than no dates at all.
  if (!enrollmentCreatedAt) return null;
  const created = new Date(enrollmentCreatedAt);
  return Number.isNaN(created.getTime()) ? null : created;
}

export async function scheduleForEnrollment(
  enrollmentId: string,
  plan: BuildPlan,
  correlationId: string | null,
  /**
   * When the plan was published — `build_plans.published_at`, or the current
   * moment on the publish path itself. Pass the STORED timestamp on every
   * subsequent read (document refresh, prompt rebuild): a floor that tracked
   * the wall clock would push the student's deadlines out a little further
   * every time they synced their repo.
   */
  publishedAt?: Date | string | null,
): Promise<Schedule | null> {
  try {
    const { sequelize } = await import('../../config/database');
    // LEFT JOIN on purpose. The inner join this replaced silently dropped every
    // cohort-less learner, and a learner who returns no row cannot be told apart
    // from a learner who does not exist.
    const [rows]: any = await sequelize.query(
      `SELECT c.start_date, e.created_at FROM enrollments e
         LEFT JOIN cohorts c ON c.id = e.cohort_id
        WHERE e.id = $eid LIMIT 1`,
      { bind: { eid: enrollmentId } },
    );
    const row = rows?.[0];
    if (!row) {
      log('sbp_schedule_skipped', correlationId, 'partial', { enrollmentId, reason: 'enrollment not found' });
      return null;
    }

    const asOf = publishedAt ? new Date(publishedAt) : null;
    const asOfValid = asOf && !Number.isNaN(asOf.getTime()) ? asOf : null;

    const cohortStart = row.start_date ? new Date(row.start_date) : null;
    const anchorKind: ScheduleAnchorKind = cohortStart ? 'cohort_start' : 'self_paced_plan_published';
    const anchor = cohortStart ?? selfPacedAnchor(asOfValid, row.created_at);
    if (!anchor || Number.isNaN(anchor.getTime())) {
      log('sbp_schedule_skipped', correlationId, 'partial', {
        enrollmentId, reason: 'no cohort start and no self-paced anchor',
      });
      return null;
    }

    const storiesByRelease = new Map<string, string[]>();
    for (const rel of plan.releases) {
      storiesByRelease.set(rel.key, plan.stories.filter((s) => s.release === rel.key).map((s) => s.id));
    }
    const schedule = buildSchedule({
      window: {
        cohortStart: anchor,
        asOf: asOfValid ?? undefined,
      },
      releases: plan.releases,
      storiesByRelease,
    });
    log('sbp_schedule_built', correlationId, 'success', {
      // Which clock dated this build. Without it, a self-paced learner's dates
      // look like a cohort's and nobody can tell why they differ.
      anchorKind,
      anchor: anchor.toISOString().slice(0, 10),
      buildWeeks: schedule.buildWeeks, capacity: schedule.capacity, totalTasks: schedule.totalTasks,
      demoRelease: schedule.demoReleaseKey, demoDay: schedule.demoDay.toISOString().slice(0, 10),
      buildStart: schedule.buildStart.toISOString().slice(0, 10),
      // Loud on purpose: a compressed window is the one fact that explains why
      // this student's dates differ from the cohort's nominal ones.
      publishedAt: asOf ? asOf.toISOString().slice(0, 10) : null,
      windowFloored: schedule.buildWeeks < DEFAULT_PREP_WEEK - DEFAULT_START_WEEK,
    });
    return schedule;
  } catch (err: any) {
    log('sbp_schedule_failed', correlationId, 'failure', { enrollmentId, message: err?.message });
    return null;
  }
}
