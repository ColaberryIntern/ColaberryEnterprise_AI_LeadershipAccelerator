import { buildMyProgress, MyProgressInputs, MyProgressPayload } from './myProgressModel';

/**
 * C120: the I/O half of the My Progress celebration (the pure half is myProgressModel.ts). READ-ONLY: every source is a SELECT
 * (no findOrCreate), so opening the room never writes. Every read binds the enrollment id the route took from the token; the
 * caller can pass nothing else.
 *
 * Sources (all existing, nothing new is computed here):
 *   week        curriculumCompletionService.getStudentWeekBreakdown (the same breakdown Reese's my_curriculum_progress reads)
 *   points      pointsService.getTotalsForEnrollments + progressionService.getRungNamesForEnrollments (the campus look's line)
 *   XP          xp_events summed per stream (the classroom progression's Builder / Learning / Community XP)
 *   milestones  student_milestones (the latched program milestones)
 *   latest win  the most recently completed timeline card
 *   background  onboarding_profiles.extracted (allow-listed in the model) and whether a resume file is on record
 *
 * Failure modes: any read that throws propagates (the route answers 500 with a generic message and logs the error class). A
 * missing enrollment throws MyProgressError(EnrollmentNotFound) (404). A learner with no cohort gets week: null; no resume
 * gets background: null. Not retried: it is a page read and the client simply asks again. DB timeouts are the pool's.
 */
export class MyProgressError extends Error {
  constructor(message: string, public readonly error_class: 'EnrollmentNotFound') { super(message); this.name = 'MyProgressError'; }
}

export interface MyProgressDeps {
  enrollment: (id: string) => Promise<(MyProgressInputs['enrollment'] & { cohort_id: string | null }) | null>;
  weeks: (cohortId: string, id: string) => Promise<MyProgressInputs['weeks']>;
  pointsTotal: (id: string) => Promise<number>;
  rung: (id: string, total: number) => Promise<string | null>;
  xp: (id: string) => Promise<MyProgressInputs['xp']>;
  milestones: (id: string) => Promise<MyProgressInputs['milestones']>;
  latestCard: (id: string) => Promise<MyProgressInputs['latestCard']>;
  profile: (id: string) => Promise<MyProgressInputs['profile']>;
}

type Rows<T> = [T[], unknown];

function defaultDeps(): MyProgressDeps {
  // Required lazily so route tests that never reach a read stay cheap (the same pattern as campusLookService).
  const { sequelize } = require('../../config/database') as { sequelize: { query: (sql: string, o: unknown) => Promise<unknown> } };
  const q = <T>(sql: string, bind: unknown[]): Promise<T[]> => (sequelize.query(sql, { bind }) as Promise<Rows<T>>).then((r) => r[0]);
  const { getStudentWeekBreakdown } = require('../curriculumCompletionService') as {
    getStudentWeekBreakdown: (c: string, e: string) => Promise<MyProgressInputs['weeks']> };
  const { getTotalsForEnrollments } = require('../pointsService') as { getTotalsForEnrollments: (ids: string[]) => Promise<Map<string, number>> };
  const { getRungNamesForEnrollments } = require('../progression/progressionService') as {
    getRungNamesForEnrollments: (ids: string[], t: Map<string, number>) => Promise<Map<string, string>> };
  return {
    enrollment: async (id) => (await q<MyProgressInputs['enrollment'] & { cohort_id: string | null }>(
      `SELECT e.full_name, e.cohort_id, c.name AS cohort_name, e.intake_data_json
         FROM enrollments e LEFT JOIN cohorts c ON c.id = e.cohort_id
        WHERE e.id = $1`, [id]))[0] ?? null,
    weeks: (cohortId, id) => getStudentWeekBreakdown(cohortId, id),
    pointsTotal: async (id) => (await getTotalsForEnrollments([id])).get(id) ?? 0,
    rung: async (id, total) => (await getRungNamesForEnrollments([id], new Map([[id, total]]))).get(id) ?? null,
    xp: async (id) => {
      const rows = await q<{ stream: string; amount: number }>(
        `SELECT stream, COALESCE(SUM(amount), 0)::int AS amount FROM xp_events WHERE enrollment_id = $1 GROUP BY stream`, [id]);
      const by = new Map(rows.map((r) => [r.stream, Number(r.amount) || 0]));
      return { builder: by.get('builder') ?? 0, learning: by.get('learning') ?? 0, community: by.get('community') ?? 0 };
    },
    milestones: (id) => q(
      `SELECT milestone_type, source_ref, achieved_at, evidence FROM student_milestones WHERE enrollment_id = $1 ORDER BY achieved_at`, [id]),
    latestCard: async (id) => (await q<{ title: string; completed_at: string }>(
      `SELECT c.title, p.completed_at
         FROM timeline_card_progress p JOIN timeline_cards c ON c.id = p.card_id
        WHERE p.enrollment_id = $1 AND p.status = 'completed' AND p.completed_at IS NOT NULL
        ORDER BY p.completed_at DESC LIMIT 1`, [id]))[0] ?? null,
    profile: async (id) => (await q<{ resume_file_name: string | null; extracted: unknown }>(
      `SELECT resume_file_name, extracted FROM onboarding_profiles WHERE enrollment_id = $1`, [id]))[0] ?? null,
  };
}

let depsOverride: MyProgressDeps | null = null;
/** Test seam. */
export function __setMyProgressDepsForTests(d: MyProgressDeps | null): void { depsOverride = d; }

export async function getMyProgress(enrollmentId: string): Promise<MyProgressPayload> {
  const d = depsOverride ?? defaultDeps();
  const enrollment = await d.enrollment(enrollmentId);
  if (!enrollment) throw new MyProgressError('No enrollment for this account', 'EnrollmentNotFound');
  const [weeks, pointsTotal, xp, milestones, latestCard, profile] = await Promise.all([
    enrollment.cohort_id ? d.weeks(enrollment.cohort_id, enrollmentId) : Promise.resolve(null),
    d.pointsTotal(enrollmentId), d.xp(enrollmentId), d.milestones(enrollmentId), d.latestCard(enrollmentId), d.profile(enrollmentId),
  ]);
  const rungName = await d.rung(enrollmentId, pointsTotal);
  return buildMyProgress({ enrollment, weeks, pointsTotal, rungName, xp, milestones, latestCard, profile });
}
