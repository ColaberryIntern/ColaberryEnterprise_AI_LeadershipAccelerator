import { findInternshipCohort, internshipSettings } from '../internship/internshipCohortService';
import type { RequiredMeeting } from '../internship/internshipCohortService';
import { findLatestApplication } from '../internship/internshipApplicationService';

/**
 * Campus round 7 (Basecamp C63, Ali 2026-10-26): "an intern view which is like member, but they have classes during the week. The
 * sessions are open to all members except the Monday call. That is for interns only."
 *
 * The weekly sessions already exist as the internship cohort's required meetings (cohorts.settings_json.required_meetings:
 * Mon interns-only standup; Tue / Wed / Fri public AI sessions). Until now only interns could read them (the internship dashboard
 * answers 404 to everyone else). This is the one member-readable view, and the interns-only rule is enforced HERE, on the server:
 * a non-intern never receives the Monday call, so the browser cannot leak it.
 *
 * Intern = the latest internship application is 'active' (an activated intern). An applicant still in process is not an intern
 * for this purpose (the nav tab's wider rule counts them; the call is for working interns).
 *
 * FAILURE: no internship cohort -> no sessions (a recurrence with no rooms behind it would send people nowhere). A database error
 * propagates to the route (500); the campus then shows no weekday sessions rather than invented ones.
 */
export interface WeekdaySession {
  day: string;
  /** Local start time as stored, e.g. "9:00 AM", in America/Chicago (the cohort's "CT"). */
  time: string;
  title: string;
  audience: 'interns_only' | 'public';
  room_id: string | null;
  room_name: string | null;
  join_url: string | null;
  registration_url: string | null;
}

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

/** Pure: the sessions this person may see, in weekday order. A meeting with no time or an unknown day is dropped (no guessing). */
export function sessionsFor(meetings: readonly RequiredMeeting[], isIntern: boolean): WeekdaySession[] {
  return meetings
    .filter((m) => DAYS.includes(String(m.day).toLowerCase()) && typeof m.time === 'string' && m.time.trim() !== '')
    .map((m): WeekdaySession => ({
      day: String(m.day).toLowerCase(),
      time: m.time!.trim(),
      title: (m.title || m.kind || 'Session').trim(),
      audience: m.audience === 'interns_only' ? 'interns_only' : 'public',
      room_id: m.room_id ?? null,
      room_name: m.room_name ?? null,
      join_url: m.join_url ?? null,
      registration_url: m.registration_url ?? null,
    }))
    .filter((s) => s.audience === 'public' || isIntern)
    .sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day));
}

export async function isActiveIntern(enrollmentId: string): Promise<boolean> {
  const app = await findLatestApplication(enrollmentId);
  return app?.state === 'active';
}

/** previewIntern: a staff preview of the intern view (the route grants it only to accounts allowed to preview). */
export async function getWeekdaySessions(enrollmentId: string, opts: { previewIntern?: boolean } = {}): Promise<{ intern: boolean; sessions: WeekdaySession[] }> {
  const [cohort, real] = await Promise.all([findInternshipCohort(), isActiveIntern(enrollmentId)]);
  const intern = real || opts.previewIntern === true;
  if (!cohort) return { intern, sessions: [] };
  return { intern, sessions: sessionsFor(internshipSettings(cohort).required_meetings ?? [], intern) };
}
