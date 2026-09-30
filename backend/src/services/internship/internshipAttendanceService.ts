import InternshipMeetingAttendance from '../../models/InternshipMeetingAttendance';

/**
 * Intern meeting attendance — capture and summarise.
 *
 * Capture is idempotent per (enrollment, meeting, occurrence date): the join
 * click records one row for today's occurrence, and clicking again the same day
 * is a no-op. Weeks are distinct rows, so the record is a true per-session log a
 * manager can read across every session.
 */
export interface AttendanceRow {
  meeting_key: string;
  session_date: string;
  joined_at: string;
}

export interface AttendanceSummary {
  /** Distinct meeting-occurrences attended. */
  total: number;
  /** How many occurrences of each meeting were attended, by meeting_key. */
  by_meeting: Record<string, number>;
  /** Most recent join, ISO, or null. */
  last_attended_at: string | null;
}

/**
 * Fold attendance rows into a manager-facing summary. Pure, so the counting is
 * tested without a database.
 */
export function summarizeAttendance(rows: readonly AttendanceRow[]): AttendanceSummary {
  const by_meeting: Record<string, number> = {};
  let last = '';
  for (const r of rows) {
    by_meeting[r.meeting_key] = (by_meeting[r.meeting_key] || 0) + 1;
    if (r.joined_at > last) last = r.joined_at;
  }
  return { total: rows.length, by_meeting, last_attended_at: last || null };
}

/** Today's date in Central time, as YYYY-MM-DD (the occurrence key). */
export function centralDateKey(now: Date = new Date()): string {
  // en-CA gives YYYY-MM-DD; the timezone shifts it to the Central calendar day.
  return now.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
}

/**
 * Record that an intern joined a meeting today. Idempotent on
 * (enrollment, meeting_key, session_date) — a second click the same day changes
 * nothing. Never throws for a duplicate; the unique index makes the second insert
 * a found row.
 */
export async function recordMeetingJoin(
  enrollmentId: string,
  meetingKey: string,
  sessionDate: string = centralDateKey(),
): Promise<{ recorded: boolean; already: boolean }> {
  const [, created] = await InternshipMeetingAttendance.findOrCreate({
    where: { enrollment_id: enrollmentId, meeting_key: meetingKey, session_date: sessionDate },
    defaults: {
      enrollment_id: enrollmentId,
      meeting_key: meetingKey,
      session_date: sessionDate,
      joined_at: new Date(),
      source: 'join_click',
    } as any,
  });
  return { recorded: true, already: !created };
}

/** Everything a reviewer needs to see this intern's attendance across sessions. */
export async function meetingAttendanceSummary(enrollmentId: string): Promise<AttendanceSummary> {
  const rows = await InternshipMeetingAttendance.findAll({
    where: { enrollment_id: enrollmentId },
    attributes: ['meeting_key', 'session_date', 'joined_at'],
    order: [['joined_at', 'DESC']],
  });
  return summarizeAttendance(rows.map((r) => ({
    meeting_key: (r as any).meeting_key,
    session_date: String((r as any).session_date),
    joined_at: new Date((r as any).joined_at).toISOString(),
  })));
}
