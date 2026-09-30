import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';

/**
 * What a person actually DID in the programme: class attendance and curriculum use.
 *
 * These are the two surfaces Ali named first (2026-09-09) and the two the 360
 * was most conspicuously missing. The profile could say somebody was enrolled
 * and could not say whether they had ever turned up.
 *
 * ── WHY THIS IS THE BIGGEST GAP THE AUDIT FOUND ─────────────────────────────
 *
 * timeline_card_progress holds 3,884 rows for three people alone — more than
 * every source the original timeline read, combined. It is the record of the
 * curriculum being used, and nothing in the admin surface read it.
 *
 * ── ABSENT IS NOT ZERO ──────────────────────────────────────────────────────
 *
 * attendanceRate is null when no attendance was ever recorded, and a number
 * only when rows exist. A cohort that never took a register produces null,
 * which reads as "not recorded"; 0 would read as "nobody came".
 */

export interface AttendanceCount {
  status: string;
  count: number;
}

export interface SessionRow {
  title: string | null;
  sessionDate: string | null;
  status: string | null;
  durationMinutes: number | null;
}

export interface ClassActivityPanel {
  /** Every status the register actually used, counted. Not a fixed vocabulary. */
  attendanceByStatus: AttendanceCount[];
  attendanceTotal: number;
  /** present+late over total. Null when nothing was recorded — never 0. */
  attendanceRate: number | null;
  recentSessions: SessionRow[];
  /** Participation inside the live room, which attendance alone does not show. */
  presenceEvents: number;
  pollResponses: number;
  pulseChecks: number;
  lastSeenInClass: string | null;
}

export interface CurriculumPanel {
  byStatus: AttendanceCount[];
  completed: number;
  /** Cards this person has any progress row for. */
  total: number;
  completionRate: number | null;
  quizzesTaken: number;
  averageQuizScore: number | null;
  totalAttempts: number;
  lastCompleted: { title: string | null; type: string | null; week: number | null; at: string | null } | null;
  weeksTouched: number;
  reflections: number;
  surveys: number;
}

/** Attendance, live-room participation, and the sessions themselves. */
export async function loadClassActivity(enrollmentIds: string[]): Promise<ClassActivityPanel | null> {
  if (enrollmentIds.length === 0) return null;

  const [byStatus, sessions, participation] = await Promise.all([
    sequelize.query<{ status: string; count: string }>(
      `SELECT status::text AS status, COUNT(*)::text AS count
       FROM attendance_records WHERE enrollment_id IN (:ids)
       GROUP BY status::text ORDER BY COUNT(*) DESC`,
      { type: QueryTypes.SELECT, replacements: { ids: enrollmentIds } },
    ),
    sequelize.query<SessionRow & { attended: string }>(
      `SELECT ls.title, ls.session_date AS "sessionDate", ar.status::text AS status,
              ar.duration_minutes AS "durationMinutes", ar.created_at AS attended
       FROM attendance_records ar
       LEFT JOIN live_sessions ls ON ls.id = ar.session_id
       WHERE ar.enrollment_id IN (:ids)
       ORDER BY ls.session_date DESC NULLS LAST LIMIT 15`,
      { type: QueryTypes.SELECT, replacements: { ids: enrollmentIds } },
    ),
    sequelize.query<{ presence: string; polls: string; pulse: string; last_seen: string | null }>(
      `SELECT
         (SELECT COUNT(*) FROM session_presence_events WHERE enrollment_id IN (:ids))::text AS presence,
         (SELECT COUNT(*) FROM session_poll_responses WHERE enrollment_id IN (:ids))::text AS polls,
         (SELECT COUNT(*) FROM session_pulse WHERE enrollment_id IN (:ids))::text AS pulse,
         (SELECT MAX(created_at) FROM session_presence_events WHERE enrollment_id IN (:ids)) AS last_seen`,
      { type: QueryTypes.SELECT, replacements: { ids: enrollmentIds } },
    ),
  ]);

  const counts = byStatus.map((r) => ({ status: r.status, count: Number(r.count) }));
  const total = counts.reduce((sum, r) => sum + r.count, 0);
  // 'late' counts as attended. Someone who joined late was in the room.
  const attended = counts
    .filter((r) => r.status === 'present' || r.status === 'late')
    .reduce((sum, r) => sum + r.count, 0);

  const p = participation[0];
  return {
    attendanceByStatus: counts,
    attendanceTotal: total,
    attendanceRate: total > 0 ? Math.round((attended / total) * 100) : null,
    recentSessions: sessions.map((s) => ({
      title: s.title,
      sessionDate: s.sessionDate,
      status: s.status,
      durationMinutes: s.durationMinutes,
    })),
    presenceEvents: Number(p?.presence ?? 0),
    pollResponses: Number(p?.polls ?? 0),
    pulseChecks: Number(p?.pulse ?? 0),
    lastSeenInClass: p?.last_seen ?? null,
  };
}

/** Curriculum consumption: cards progressed, quizzes taken, reflections written. */
export async function loadCurriculum(enrollmentIds: string[]): Promise<CurriculumPanel | null> {
  if (enrollmentIds.length === 0) return null;

  const [byStatus, quiz, last, extras] = await Promise.all([
    sequelize.query<{ status: string; count: string }>(
      `SELECT status AS status, COUNT(*)::text AS count
       FROM timeline_card_progress WHERE enrollment_id IN (:ids)
       GROUP BY status ORDER BY COUNT(*) DESC`,
      { type: QueryTypes.SELECT, replacements: { ids: enrollmentIds } },
    ),
    sequelize.query<{ taken: string; avg_score: string | null; attempts: string; weeks: string }>(
      `SELECT COUNT(*) FILTER (WHERE tcp.quiz_score IS NOT NULL)::text AS taken,
              AVG(tcp.quiz_score) FILTER (WHERE tcp.quiz_score IS NOT NULL)::text AS avg_score,
              COALESCE(SUM(tcp.attempts), 0)::text AS attempts,
              COUNT(DISTINCT tc.week)::text AS weeks
       FROM timeline_card_progress tcp
       LEFT JOIN timeline_cards tc ON tc.id = tcp.card_id
       WHERE tcp.enrollment_id IN (:ids)`,
      { type: QueryTypes.SELECT, replacements: { ids: enrollmentIds } },
    ),
    sequelize.query<{ title: string | null; type: string | null; week: number | null; at: string | null }>(
      `SELECT tc.title, tc.type, tc.week, tcp.completed_at AS at
       FROM timeline_card_progress tcp
       LEFT JOIN timeline_cards tc ON tc.id = tcp.card_id
       WHERE tcp.enrollment_id IN (:ids) AND tcp.completed_at IS NOT NULL
       ORDER BY tcp.completed_at DESC LIMIT 1`,
      { type: QueryTypes.SELECT, replacements: { ids: enrollmentIds } },
    ),
    sequelize.query<{ reflections: string; surveys: string }>(
      `SELECT
         (SELECT COUNT(*) FROM reflection_entries WHERE enrollment_id IN (:ids))::text AS reflections,
         (SELECT COUNT(*) FROM timeline_survey_responses WHERE enrollment_id IN (:ids))::text AS surveys`,
      { type: QueryTypes.SELECT, replacements: { ids: enrollmentIds } },
    ),
  ]);

  const counts = byStatus.map((r) => ({ status: r.status, count: Number(r.count) }));
  const total = counts.reduce((sum, r) => sum + r.count, 0);
  const completed = counts.find((r) => r.status === 'completed')?.count ?? 0;
  const q = quiz[0];

  return {
    byStatus: counts,
    completed,
    total,
    completionRate: total > 0 ? Math.round((completed / total) * 100) : null,
    quizzesTaken: Number(q?.taken ?? 0),
    averageQuizScore: q?.avg_score != null ? Math.round(Number(q.avg_score) * 10) / 10 : null,
    totalAttempts: Number(q?.attempts ?? 0),
    lastCompleted: last[0] ?? null,
    weeksTouched: Number(q?.weeks ?? 0),
    reflections: Number(extras[0]?.reflections ?? 0),
    surveys: Number(extras[0]?.surveys ?? 0),
  };
}
