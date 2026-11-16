import { sequelize } from '../../config/database';
import { NO_INTERVIEW, PREP_SKILLS } from '../../db/ensureCareerPrepSchema';
import type { InterviewType, Observation, ObservationSource, SessionTime } from './readiness';

/**
 * Career Prep v27, CP1.5: every read the summary, the dashboard and the rollup need, for ONE
 * student, in six queries (CP5.1 added the active plans' days, for the campus card's session line). No logic here beyond shaping rows; the views are pure (prepViews.ts).
 * A database error propagates to the route (500 with a logged error_class).
 */
export interface PrepInterview {
  id: string; source: 'real' | 'added' | 'practice'; company: string; role: string; type: InterviewType;
  startsAt: Date | null; targetReadiness: number | null; practiceUntil: string | null;
  /** Practice questions from the job description (CP3.3), when there were some. */
  questions?: string[] | null;
}
export interface TrendPoint { date: string; interviewId: string; readiness: number | null }
export interface PrepData {
  enrollmentId: string;
  firstName: string | null;
  observations: Observation[];
  sourceRefs: Array<{ source: ObservationSource; ref: string }>;
  sessions: SessionTime[];
  interviews: PrepInterview[];
  trend: TrendPoint[];
  /** CP5.1: each active plan's interview and the minutes planned per date (absent in older fixtures). */
  plans?: Array<{ interviewId: string | null; days: Array<{ date: string; minutes: number }> }>;
}

export const SKILL_KEYS = PREP_SKILLS.map((s) => s.key);
type Row = Record<string, unknown>;
const rows = async (sql: string, replacements: Record<string, unknown>): Promise<Row[]> =>
  (await sequelize.query(sql, { replacements }))[0] as Row[];

/** A stored plan's days as { date, minutes }: the minutes are the sum of that day's segments. */
function planDays(raw: unknown): Array<{ date: string; minutes: number }> {
  if (!Array.isArray(raw)) return [];
  return raw.map((d: { date?: unknown; segments?: Array<{ minutes?: unknown }> }) => ({
    date: String(d.date ?? ''), minutes: (Array.isArray(d.segments) ? d.segments : []).reduce((n, s) => n + (Number(s.minutes) || 0), 0),
  }));
}

export async function loadPrepData(enrollmentId: string, now: Date): Promise<PrepData> {
  const r = { e: enrollmentId, now };
  const [person, obs, sessions, interviews, trend, plans] = await Promise.all([
    rows(`SELECT NULLIF(split_part(trim(full_name), ' ', 1), '') AS first_name FROM enrollments WHERE id = :e`, r),
    rows(`SELECT skill_key, value, source, source_ref, observed_at, weight FROM prep_observations
           WHERE enrollment_id = :e AND observed_at > :now::timestamptz - INTERVAL '90 days'`, r),
    rows(`SELECT started_at, seconds_active, status FROM prep_sessions
           WHERE enrollment_id = :e AND started_at > :now::timestamptz - INTERVAL '400 days'`, r),
    rows(`SELECT id, source, company, role, type, starts_at, target_readiness, practice_until, questions FROM career_interviews
           WHERE enrollment_id = :e AND (starts_at IS NULL OR starts_at > :now::timestamptz - INTERVAL '1 day')
           ORDER BY starts_at NULLS LAST, created_at`, r),
    rows(`SELECT date::text AS date, interview_id, readiness FROM prep_readiness_daily
           WHERE enrollment_id = :e AND date > (:now::timestamptz - INTERVAL '84 days')::date ORDER BY date`, r),
    rows(`SELECT interview_id, days FROM prep_plans WHERE enrollment_id = :e AND status = 'active'`, r),
  ]);
  return {
    enrollmentId,
    firstName: (person[0]?.first_name as string | undefined) ?? null,
    observations: obs.map((o) => ({ skill: String(o.skill_key), value: Number(o.value), source: o.source as ObservationSource, observedAt: new Date(o.observed_at as string), weight: Number(o.weight ?? 1) })),
    sourceRefs: obs.map((o) => ({ source: o.source as ObservationSource, ref: String(o.source_ref) })),
    sessions: sessions.map((s) => ({ startedAt: new Date(s.started_at as string), secondsActive: Number(s.seconds_active), status: String(s.status) })),
    interviews: interviews.map((i) => ({
      id: String(i.id), source: i.source as PrepInterview['source'], company: String(i.company), role: String(i.role), type: i.type as InterviewType,
      startsAt: i.starts_at ? new Date(i.starts_at as string) : null, targetReadiness: i.target_readiness === null ? null : Number(i.target_readiness),
      practiceUntil: (i.practice_until as string | null) ?? null,
      questions: Array.isArray(i.questions) ? (i.questions as string[]) : null,
    })),
    trend: trend.map((t) => ({ date: String(t.date), interviewId: String(t.interview_id ?? NO_INTERVIEW), readiness: t.readiness === null ? null : Number(t.readiness) })),
    plans: plans.map((p) => ({ interviewId: (p.interview_id as string | null) ?? null, days: planDays(p.days) })),
  };
}
