import type { RequiredMeeting } from '../../../services/internshipApi';

/**
 * Is one of the intern's required meetings happening right now?
 *
 * Pure and timezone-safe: the schedule is stored as a Central day + local time
 * ("Monday", "9:00 AM", "CT"), so "now" is compared in Central via Intl (which
 * handles DST), never against the viewer's own clock. A meeting counts as live
 * from its start for LIVE_WINDOW_MINUTES — long enough to still say "join" a bit
 * after the top of the hour, short enough not to linger all day.
 */
export const LIVE_WINDOW_MINUTES = 75;

export interface LiveMeeting {
  title: string;
  room_slug: string | null;
  room_id: string | null;
  room_name: string | null;
  /** The meeting's day — its attendance key. */
  day: string;
}

const DAY_INDEX: Record<string, number> = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6,
};

/** "9:00 AM" -> minutes past midnight, or null if unparseable. */
export function parseTimeToMinutes(time?: string): number | null {
  if (!time) return null;
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(time.trim());
  if (!m) return null;
  let hour = parseInt(m[1], 10) % 12;
  if (/PM/i.test(m[3])) hour += 12;
  return hour * 60 + parseInt(m[2], 10);
}

/** The current Central weekday (0-6) and minutes past midnight. */
export function centralNowParts(now: Date): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', weekday: 'long', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now);
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10) % 24;
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
  return { day: DAY_INDEX[weekday] ?? -1, minutes: hour * 60 + minute };
}

export function findLiveMeeting(
  meetings: readonly RequiredMeeting[],
  now: Date = new Date(),
): LiveMeeting | null {
  const { day, minutes } = centralNowParts(now);
  for (const m of meetings) {
    if ((DAY_INDEX[m.day] ?? -2) !== day) continue;
    const start = parseTimeToMinutes(m.time);
    if (start == null) continue;
    if (minutes >= start && minutes < start + LIVE_WINDOW_MINUTES) {
      return {
        title: m.title || m.kind,
        room_slug: m.room_slug ?? null,
        room_id: m.room_id ?? null,
        room_name: m.room_name ?? null,
        day: m.day,
      };
    }
  }
  return null;
}
