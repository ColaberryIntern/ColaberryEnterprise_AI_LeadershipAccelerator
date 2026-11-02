/**
 * Which room has a SCHEDULED session right now, derived at read time.
 *
 * ## Why this exists
 *
 * The weekly timetable drove nothing. `cohorts.settings_json.required_meetings` has
 * held the Monday intern standup and the Tuesday/Wednesday/Friday public sessions, each
 * already carrying the `community_rooms.id` it runs in, and at a session's start time
 * precisely nothing happened: no job opened a room, wrote presence, or marked anything.
 * The schedule was a label on a page. Reported as "there is only one scheduled meeting
 * and it's not the room we are in."
 *
 * ## Why read time and not a cron
 *
 * A job that writes "in session" onto a room at 9:00 and clears it at 10:00 has to be
 * idempotent, has to survive a missed tick, has to not double-fire when two containers
 * overlap during a deploy, and leaves the room wrong until someone notices. Deriving the
 * answer from the timetable whenever the hallway is read has none of those failure modes,
 * because there is no state to get stuck: the schedule IS the source, and the answer is
 * recomputed from `now` on every request. Simplest, deterministic, no blast radius.
 *
 * ## What this is NOT
 *
 * It is not liveness. `live_since` means Zoom reported a meeting STARTED; this means the
 * timetable says a session is due. They are independent and both are worth saying: a
 * session can be in its window with nobody having started the call, and a call can run
 * at a time no session is scheduled. Conflating them would be the same mistake as
 * reading a browser heartbeat as "a meeting is happening".
 *
 * ## Two things it deliberately refuses to do
 *
 * - It never invents an occurrence. A meeting whose stored time cannot be read produces
 *   NO window, rather than one at `convertTo24h`'s 10:00 fallback — the same discipline
 *   `formatCentralClock` applies, for the same reason. `internshipAttendanceService`
 *   carries the matching doctrine for the weekly pattern.
 * - It never guesses a room. A meeting with no `room_id` is skipped, because the whole
 *   point is binding a session to the room it happens in.
 */

import { classInstant, centralDateKey, centralWeekdayName, isReadableClockTime } from '../centralDate';

/**
 * How long a scheduled session is assumed to run.
 *
 * ASSUMPTION, LOGGED: `required_meetings` stores a day and a start time and NO duration
 * or end time, so an end has to come from somewhere. One hour is the honest single
 * default — the canonical meetings are a 9:00 standup and three 10:00/9:00 sessions —
 * and it is a named constant rather than a literal so that when durations are stored per
 * meeting, this is the one place that changes. A shorter guess would close the standup's
 * window while it was still running; a longer one would hold a room all morning.
 */
export const SESSION_MINUTES = 60;

/**
 * How long before the start time a session begins to show.
 *
 * Matches the 15 minutes the campus panel already treats as imminent, so the door and
 * the panel cannot disagree about whether something is about to happen.
 */
export const LEAD_MINUTES = 15;

/** The slice of a weekly session this module needs. Structural, so `WeekdaySession` fits. */
export interface ScheduledMeeting {
  day: string;
  time: string;
  title: string;
  room_id: string | null;
}

export interface RoomSession {
  title: string;
  /** ISO instant of the real Central start, DST-aware via `classInstant`. */
  start_at: string;
  end_at: string;
  /** False while inside the lead window and the session has not started yet. */
  in_progress: boolean;
}

const MINUTE_MS = 60_000;

/**
 * The Central calendar dates a window open at `now` could belong to.
 *
 * Yesterday is included because a session starting at 23:30 is still running after
 * midnight, and tomorrow because a lead window opens before the start — a session at
 * 00:05 is visible at 23:50 the day before. Neither happens with the current timetable,
 * and both would be silent, date-dependent bugs if the timetable ever changed.
 */
function candidateDateKeys(now: Date): string[] {
  const ms = now.getTime();
  return [centralDateKey(ms - 86_400_000), centralDateKey(ms), centralDateKey(ms + 86_400_000)];
}

/** Pure: the window a single meeting occupies on one Central date, or null. */
function windowOn(
  meeting: ScheduledMeeting,
  dateKey: string,
  sessionMinutes: number,
): { start: Date; end: Date } | null {
  if (centralWeekdayName(dateKey) !== String(meeting.day ?? '').trim().toLowerCase()) return null;
  const start = classInstant(dateKey, meeting.time);
  if (Number.isNaN(start.getTime())) return null;
  return { start, end: new Date(start.getTime() + sessionMinutes * MINUTE_MS) };
}

/**
 * The scheduled session each room is in, keyed by `community_rooms.id`.
 *
 * A room appears only while `now` falls in `[start - LEAD_MINUTES, end)`. Half-open at
 * the end, so a session finishing at 10:00 does not keep the room claimed at 10:00.
 *
 * When two meetings would claim one room at once — which the current timetable never
 * does, but nothing prevents — the one already running wins over the one about to
 * start, and an earlier start wins over a later one. Deterministic rather than
 * whichever the array happened to hold first.
 */
export function roomSessionWindows(
  meetings: readonly ScheduledMeeting[],
  now: Date = new Date(),
  opts: { sessionMinutes?: number; leadMinutes?: number } = {},
): Map<string, RoomSession> {
  const sessionMinutes = opts.sessionMinutes ?? SESSION_MINUTES;
  const leadMinutes = opts.leadMinutes ?? LEAD_MINUTES;
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) return new Map();

  const keys = candidateDateKeys(now);
  const out = new Map<string, RoomSession>();

  for (const meeting of meetings ?? []) {
    const roomId = String(meeting?.room_id ?? '').trim();
    if (!roomId) continue;
    // No window at all rather than one at the 10:00 fallback. See the header.
    if (!isReadableClockTime(meeting?.time)) continue;

    for (const key of keys) {
      const w = windowOn(meeting, key, sessionMinutes);
      if (!w) continue;
      if (nowMs < w.start.getTime() - leadMinutes * MINUTE_MS) continue;
      if (nowMs >= w.end.getTime()) continue;

      const candidate: RoomSession = {
        title: String(meeting.title ?? '').trim() || 'Session',
        start_at: w.start.toISOString(),
        end_at: w.end.toISOString(),
        in_progress: nowMs >= w.start.getTime(),
      };
      const held = out.get(roomId);
      if (!held || beats(candidate, held)) out.set(roomId, candidate);
    }
  }
  return out;
}

/** Running beats about-to-start; otherwise the earlier start wins. */
function beats(candidate: RoomSession, held: RoomSession): boolean {
  if (candidate.in_progress !== held.in_progress) return candidate.in_progress;
  return Date.parse(candidate.start_at) < Date.parse(held.start_at);
}
