import cron from 'node-cron';
import { sequelize } from '../../config/database';
import { NO_INTERVIEW } from '../../db/ensureCareerPrepSchema';
import { centralDate, readiness } from './readiness';
import { loadPrepData, type PrepData } from './prepData';
import { readingsFor } from './prepViews';
import { careerPrepEnrollmentIds } from './careerPrepFlag';

/**
 * Career Prep v27, CP1.5: prep_readiness_daily, the rows the readiness trend chart reads.
 *
 * One row per (student, interview, Central date); NO_INTERVIEW holds the general readiness.
 * UPSERT, so re-running a day rewrites the same rows (idempotent: same row count, latest values).
 * Runs nightly at 01:30 Central for every student Career Prep is ON for (the career_prep allow-list)
 * who has an observation in the last 90 days, and on demand after a session writes observations
 * (CP4.5). Nobody else gets derived rows written until M4 opens Career Prep to them.
 *
 * Failure: one student's failure is logged with an error_class and the run continues; the job
 * never retries itself (tomorrow's run, or the next session, rewrites the row).
 */
export interface RollupRow { interviewId: string; date: string; readiness: number | null; skills: Record<string, number> }

export function rollupRows(data: PrepData, now: Date): RollupRow[] {
  const readings = readingsFor(data, now);
  const skills: Record<string, number> = {};
  for (const r of readings) if (r.score !== null) skills[r.skill] = r.score;
  const date = centralDate(now);
  return [
    { interviewId: NO_INTERVIEW, date, readiness: readiness(readings, null), skills },
    ...data.interviews.map((i) => ({ interviewId: i.id, date, readiness: readiness(readings, i.type), skills })),
  ];
}

export async function rollupFor(enrollmentId: string, now = new Date()): Promise<number> {
  const rows = rollupRows(await loadPrepData(enrollmentId, now), now);
  for (const r of rows) {
    await sequelize.query(
      `INSERT INTO prep_readiness_daily (enrollment_id, interview_id, date, readiness, skills)
       VALUES (:e, :i, :d, :r, CAST(:s AS JSONB))
       ON CONFLICT (enrollment_id, interview_id, date) DO UPDATE SET readiness = EXCLUDED.readiness, skills = EXCLUDED.skills`,
      { replacements: { e: enrollmentId, i: r.interviewId, d: r.date, r: r.readiness, s: JSON.stringify(r.skills) } },
    );
  }
  return rows.length;
}

export async function rollupAll(now = new Date(), allowed: () => Promise<string[]> = careerPrepEnrollmentIds): Promise<{ students: number; failed: number }> {
  const ids = await allowed();
  if (!ids.length) return { students: 0, failed: 0 };
  const [list] = await sequelize.query(
    `SELECT DISTINCT enrollment_id FROM prep_observations
      WHERE observed_at > :now::timestamptz - INTERVAL '90 days' AND enrollment_id::text IN (:ids)`,
    { replacements: { now, ids } },
  );
  let failed = 0;
  for (const row of list as Array<{ enrollment_id: string }>) {
    try { await rollupFor(row.enrollment_id, now); } catch (err) {
      failed++;
      console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', service: 'backend', event: 'career_prep_rollup_failed',
        outcome: 'failure', error_class: (err as Error)?.name || 'UpstreamUnavailable', context: { message: String((err as Error)?.message).slice(0, 200) } }));
    }
  }
  return { students: (list as unknown[]).length, failed };
}

let started = false;
/** Registers the nightly rollup once per process (01:30 America/Chicago). */
export function startCareerPrepRollupCron(): void {
  if (started) return;
  started = true;
  cron.schedule('30 1 * * *', () => {
    const t0 = Date.now();
    rollupAll().then((r) => console.log(JSON.stringify({ timestamp: new Date().toISOString(), level: 'info', service: 'backend',
      event: 'career_prep_rollup', outcome: r.failed ? 'partial' : 'success', duration_ms: Date.now() - t0, context: r })))
      .catch((err) => console.error(JSON.stringify({ level: 'error', service: 'backend', event: 'career_prep_rollup_failed', outcome: 'failure',
        error_class: (err as Error)?.name || 'UpstreamUnavailable' })));
  }, { timezone: 'America/Chicago' });
}
