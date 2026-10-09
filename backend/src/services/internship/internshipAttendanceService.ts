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

/**
 * ── THE CONSOLE'S ATTENDANCE, WHICH DELIBERATELY HAS NO PERCENTAGE ──────────────────────
 *
 * The Intern Console design asks for "9/12 - 75%". There is no honest way to produce the 12.
 *
 * `internship_meeting_attendance` records **joins only**: a row appears when an intern clicks
 * into a meeting. Nothing anywhere records that a meeting was scheduled and missed.
 * `required_meetings` (DEFAULT_INTERNSHIP_SETTINGS, internshipCohortService.ts) is a weekly
 * *pattern* of four meetings, not a list of occurrences — turning it into a denominator means
 * multiplying it by a week count, and that invents every one of the following: holidays, weeks
 * before the intern joined, a cancelled session, a session moved, and the intern's own paused
 * weeks. The resulting "75%" would be a number no table can be asked to confirm.
 *
 * So `expected` and `pct` are typed as the literal `null`. Not `number | null`: literal `null`,
 * so that assigning a computed denominator is a compile error rather than a quiet regression.
 * `basis` names which fact the reader is holding. When a scheduled-occurrence table exists this
 * widens to a real ratio and `basis` becomes the thing that changed.
 *
 * Note the type is a *second* line of defence and not the first: `ts-jest` runs with
 * `isolatedModules`, so a fabricated percentage would still execute under a green suite. The
 * test that no input produces a percentage is what actually holds this.
 */
export interface ConsoleAttendance {
  /** Distinct meeting-occurrences this intern joined. A count, not a rate. */
  readonly attended: number;
  readonly by_meeting: Record<string, number>;
  readonly last_attended_at: string | null;
  /** Always null — no table records a scheduled-and-missed occurrence. See above. */
  readonly expected: null;
  /** Always null. A percentage here would be fabricated. */
  readonly pct: null;
  /** Names what the numbers above are made of, so the absence above is readable. */
  readonly basis: 'joins_only';
}

/**
 * Project a join summary into the console's shape. Pure, so "no input yields a percentage"
 * can be asserted across every fixture without a database.
 *
 * `expected` and `pct` are emitted as explicit keys rather than omitted: a missing key invites
 * `attended / (expected ?? 12)` downstream, which is the fabrication this exists to prevent.
 */
export function toConsoleAttendance(summary: AttendanceSummary): ConsoleAttendance {
  return {
    attended: summary.total,
    by_meeting: summary.by_meeting,
    last_attended_at: summary.last_attended_at,
    expected: null,
    pct: null,
    basis: 'joins_only',
  };
}

/** This intern's attendance, in the shape the Intern Console renders. */
export async function consoleAttendance(enrollmentId: string): Promise<ConsoleAttendance> {
  return toConsoleAttendance(await meetingAttendanceSummary(enrollmentId));
}
