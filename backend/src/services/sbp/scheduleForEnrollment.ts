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
 * Null is a NORMAL outcome, not an error: a cohort with no recorded start date
 * means tasks materialize without due dates, exactly as they did before dates
 * existed. A missing cohort date must never cost a student their build.
 */
import { BuildPlan } from './planContract';
import { buildSchedule, Schedule } from './buildSchedule';

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

export async function scheduleForEnrollment(
  enrollmentId: string,
  plan: BuildPlan,
  correlationId: string | null,
): Promise<Schedule | null> {
  try {
    const { sequelize } = await import('../../config/database');
    const [rows]: any = await sequelize.query(
      `SELECT c.start_date FROM enrollments e
         JOIN cohorts c ON c.id = e.cohort_id
        WHERE e.id = $eid AND c.start_date IS NOT NULL LIMIT 1`,
      { bind: { eid: enrollmentId } },
    );
    const start = rows?.[0]?.start_date;
    if (!start) {
      log('sbp_schedule_skipped', correlationId, 'partial', { enrollmentId, reason: 'cohort has no start_date' });
      return null;
    }

    const storiesByRelease = new Map<string, string[]>();
    for (const rel of plan.releases) {
      storiesByRelease.set(rel.key, plan.stories.filter((s) => s.release === rel.key).map((s) => s.id));
    }
    const schedule = buildSchedule({
      window: { cohortStart: new Date(start) },
      releases: plan.releases,
      storiesByRelease,
    });
    log('sbp_schedule_built', correlationId, 'success', {
      buildWeeks: schedule.buildWeeks, capacity: schedule.capacity, totalTasks: schedule.totalTasks,
      demoRelease: schedule.demoReleaseKey, demoDay: schedule.demoDay.toISOString().slice(0, 10),
    });
    return schedule;
  } catch (err: any) {
    log('sbp_schedule_failed', correlationId, 'failure', { enrollmentId, message: err?.message });
    return null;
  }
}
