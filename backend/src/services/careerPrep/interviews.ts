import { sequelize } from '../../config/database';
import { centralDate, type InterviewType } from './readiness';
import { questionsFromJd } from './jdQuestions';
import type { LlmCall } from './careerPrepLlm';

/**
 * Career Prep v27 (CP3.3): the interviews a student prepares for (career_interviews).
 *
 *   real      linked from hire_interviews (an employer booked them on hire.refactored.ai), confirmed
 *             and still ahead. IDEMPOTENT: hire_interview_id is UNIQUE. Company and role are cut to the
 *             column width (120), so one long employer name can never fail the whole link.
 *             CP8.3: also a placement interview an employer booked from the job-search inbox's reply
 *             (placementLink.ts, a module of its own so the booking work never loads the model client;
 *             IDEMPOTENT on placement_interview_id).
 *   added     the student typed it in (and may paste the job description for practice questions).
 *   practice  "Create one for me": no date, a 4-day practice window.
 *
 * RETRY-SAFE: saving the same interview again within 10 minutes (a double click, a network retry)
 * returns the first row and does not call the model again. The check and the insert run under a
 * per-student advisory lock, so two identical requests at once still make one row. The slow model
 * call happens after the row is saved, outside the lock; its result is written onto that row.
 *
 * Every function takes the student's enrollment id from the caller (the session token).
 */
const PRACTICE_DAYS = 4;
const DEDUPE_WINDOW = "INTERVAL '10 minutes'";

export async function linkHireInterviews(enrollmentId: string, now = new Date()): Promise<number> {
  const [rows] = await sequelize.query(
    `INSERT INTO career_interviews (enrollment_id, source, company, role, type, starts_at, hire_interview_id)
     SELECT h.enrollment_id, 'real', LEFT(h.employer_company, 120), LEFT(h.employer_role, 120),
            CASE h.format WHEN 'intro' THEN 'recruiter' WHEN 'walkthrough' THEN 'hiring_manager' ELSE 'technical' END,
            h.starts_at, h.id
       FROM hire_interviews h
      WHERE h.enrollment_id = :e AND h.status = 'confirmed' AND h.starts_at > :now
     ON CONFLICT (hire_interview_id) DO NOTHING
     RETURNING id`,
    { replacements: { e: enrollmentId, now } },
  );
  return (rows as unknown[]).length;
}

type Row = { id: string; questions: string[] | null };

/** Insert unless the same interview was saved in the last 10 minutes; one student at a time. */
async function insertOnce(enrollmentId: string, match: string, insert: string, replacements: Record<string, unknown>): Promise<{ row: Row; created: boolean }> {
  return sequelize.transaction(async (transaction) => {
    await sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:lockKey))', { replacements: { lockKey: `career_interviews:${enrollmentId}` }, transaction });
    const [found] = await sequelize.query(`SELECT id, questions FROM career_interviews WHERE ${match} AND created_at > NOW() - ${DEDUPE_WINDOW} ORDER BY created_at DESC LIMIT 1`,
      { replacements, transaction });
    const existing = (found as Row[])[0];
    if (existing) return { row: { id: String(existing.id), questions: existing.questions ?? null }, created: false };
    const [made] = await sequelize.query(insert, { replacements, transaction });
    return { row: { id: String((made as Array<{ id: string }>)[0].id), questions: null }, created: true };
  });
}

export interface AddInput { company: string; role: string; type: InterviewType; startsAt: string | null; jdText?: string }

export async function addInterview(enrollmentId: string, input: AddInput, call?: LlmCall): Promise<{ id: string; questions: string[] | null; duplicate: boolean }> {
  const r = { e: enrollmentId, company: input.company, role: input.role, type: input.type, startsAt: input.startsAt, jd: input.jdText ?? null };
  const { row, created } = await insertOnce(enrollmentId,
    `enrollment_id = :e AND source = 'added' AND company = :company AND role = :role AND type = :type AND starts_at IS NOT DISTINCT FROM CAST(:startsAt AS TIMESTAMPTZ)`,
    `INSERT INTO career_interviews (enrollment_id, source, company, role, type, starts_at, jd_text) VALUES (:e, 'added', :company, :role, :type, :startsAt, :jd) RETURNING id`, r);
  if (!created) return { id: row.id, questions: row.questions, duplicate: true };
  const questions = input.jdText ? await questionsFromJd(input.jdText, input.role, input.type, call) : null;
  if (questions) {
    await sequelize.query('UPDATE career_interviews SET questions = CAST(:q AS JSONB) WHERE id = :id AND enrollment_id = :e',
      { replacements: { q: JSON.stringify(questions), id: row.id, e: enrollmentId } });
  }
  return { id: row.id, questions, duplicate: false };
}

export interface PracticeInput { role: string; type: InterviewType }

/** The practice window ends PRACTICE_DAYS Central days from today (inclusive of today). */
export function practiceUntil(now: Date): string {
  const today = Date.parse(`${centralDate(now)}T12:00:00Z`);
  return new Date(today + (PRACTICE_DAYS - 1) * 86_400_000).toISOString().slice(0, 10);
}

export async function createPractice(enrollmentId: string, input: PracticeInput, now = new Date()): Promise<{ id: string; practiceUntil: string; duplicate: boolean }> {
  const until = practiceUntil(now);
  const { row, created } = await insertOnce(enrollmentId,
    `enrollment_id = :e AND source = 'practice' AND role = :role AND type = :type`,
    `INSERT INTO career_interviews (enrollment_id, source, company, role, type, starts_at, practice_until)
     VALUES (:e, 'practice', 'Practice interview', :role, :type, NULL, :until) RETURNING id`,
    { e: enrollmentId, role: input.role, type: input.type, until });
  return { id: row.id, practiceUntil: until, duplicate: !created };
}
