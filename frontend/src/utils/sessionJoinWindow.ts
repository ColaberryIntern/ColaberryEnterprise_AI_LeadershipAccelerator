import { parseSessionTimeToHHMM } from './sessionTime';

/**
 * Shared "Join Room" gate for live class sessions: enabled 30 min before a
 * session's start time through 30 min after, independent of the `status`
 * column (which a slower backend cron flips on a different schedule and
 * also drives attendance tracking — this is a client-side button gate only).
 */
export const JOIN_ROOM_WINDOW_MS = 30 * 60 * 1000;

export function parseSessionStartMs(sessionDate: string, startTime: string): number | null {
  const hhmm = parseSessionTimeToHHMM(startTime);
  if (!hhmm) return null;
  const [y, m, d] = sessionDate.split('-').map(Number);
  const [h, min] = hhmm.split(':').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, h, min, 0, 0).getTime();
}

export function canJoinRoom(sessionDate: string, startTime: string, now: number): boolean {
  const startMs = parseSessionStartMs(sessionDate, startTime);
  if (startMs == null) return false;
  return now >= startMs - JOIN_ROOM_WINDOW_MS && now <= startMs + JOIN_ROOM_WINDOW_MS;
}
