import { sequelize } from '../../config/database';
import { centralDate, type InterviewType } from './readiness';
import { questionsFromJd } from './jdQuestions';
import type { LlmCall } from './careerPrepLlm';

/**
 * Career Prep v27 (CP3.3): the interviews a student prepares for (career_interviews).
 *
 *   real      linked from hire_interviews (an employer booked them on hire.refactored.ai), confirmed
 *             and still ahead. IDEMPOTENT: hire_interview_id is UNIQUE, so linking twice adds nothing.
 *             Release 2 adds interviews from the job-search inbox.
 *   added     the student typed it in (and may paste the job description for practice questions).
 *   practice  "Create one for me": no date, a 4-day practice window.
 *
 * Every function takes the student's enrollment id from the caller (the route reads it from the
 * session token), never from the request body.
 */
const FORMAT_TYPE: Record<string, InterviewType> = { intro: 'recruiter', walkthrough: 'hiring_manager', working: 'technical' };
const PRACTICE_DAYS = 4;

export async function linkHireInterviews(enrollmentId: string, now = new Date()): Promise<number> {
  const [rows] = await sequelize.query(
    `INSERT INTO career_interviews (enrollment_id, source, company, role, type, starts_at, hire_interview_id)
     SELECT h.enrollment_id, 'real', h.employer_company, h.employer_role,
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

export interface AddInput { company: string; role: string; type: InterviewType; startsAt: string | null; jdText?: string }

export async function addInterview(enrollmentId: string, input: AddInput, call?: LlmCall): Promise<{ id: string; questions: string[] | null }> {
  const questions = input.jdText ? await questionsFromJd(input.jdText, input.role, input.type, call) : null;
  const [rows] = await sequelize.query(
    `INSERT INTO career_interviews (enrollment_id, source, company, role, type, starts_at, jd_text, questions)
     VALUES (:e, 'added', :company, :role, :type, :startsAt, :jd, CAST(:q AS JSONB)) RETURNING id`,
    { replacements: { e: enrollmentId, company: input.company, role: input.role, type: input.type, startsAt: input.startsAt,
      jd: input.jdText ?? null, q: questions ? JSON.stringify(questions) : null } },
  );
  return { id: String((rows as Array<{ id: string }>)[0].id), questions };
}

export interface PracticeInput { role: string; type: InterviewType }

/** The practice window ends PRACTICE_DAYS Central days from today (inclusive of today). */
export function practiceUntil(now: Date): string {
  const today = Date.parse(`${centralDate(now)}T12:00:00Z`);
  return new Date(today + (PRACTICE_DAYS - 1) * 86_400_000).toISOString().slice(0, 10);
}

export async function createPractice(enrollmentId: string, input: PracticeInput, now = new Date()): Promise<{ id: string; practiceUntil: string }> {
  const until = practiceUntil(now);
  const [rows] = await sequelize.query(
    `INSERT INTO career_interviews (enrollment_id, source, company, role, type, starts_at, practice_until)
     VALUES (:e, 'practice', 'Practice interview', :role, :type, NULL, :until) RETURNING id`,
    { replacements: { e: enrollmentId, role: input.role, type: input.type, until } },
  );
  return { id: String((rows as Array<{ id: string }>)[0].id), practiceUntil: until };
}

export { FORMAT_TYPE };
