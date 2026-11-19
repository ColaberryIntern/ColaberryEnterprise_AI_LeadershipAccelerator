/**
 * classCheckinWindow.ts — is a live class open for check-in right now?
 *
 * The room QR is printed on the deck and can be scanned at any time: during class, an hour
 * early in the parking lot, or five days early while someone is reviewing the slides (Ali,
 * 2026-11-19, on Session 3). Only a scan inside the class window is attendance. A scan before
 * it still captures the visitor's name and email, and the page tells them when the class
 * starts; a scan after it is too late to count.
 *
 * Pure: no database, no clock of its own. Times are the session's stored Central wall-clock
 * values, resolved through `classInstant` so DST follows the class's own date.
 */
import { classInstant } from './centralDate';

export type ClassWindow = 'before' | 'open' | 'ended';

/** Check-in opens this long before the scheduled start (people arrive early). */
export const CHECKIN_OPENS_MINUTES_BEFORE = 60;
/** ...and stays open this long after the scheduled end (classes run over). */
export const CHECKIN_CLOSES_MINUTES_AFTER = 30;

export function classWindowAt(args: {
  sessionDate: string;
  startTime: string;
  endTime: string | null | undefined;
  status: string | null | undefined;
  now: Date;
}): ClassWindow {
  if (args.status === 'completed' || args.status === 'cancelled') return 'ended';
  if (args.status === 'live') return 'open';
  const start = classInstant(args.sessionDate, args.startTime).getTime();
  if (Number.isNaN(start)) return 'open'; // a malformed row must never lock a real class out
  const endRaw = args.endTime ? classInstant(args.sessionDate, args.endTime).getTime() : NaN;
  const end = Number.isNaN(endRaw) || endRaw < start ? start + 2 * 60 * 60 * 1000 : endRaw;
  const t = args.now.getTime();
  if (t < start - CHECKIN_OPENS_MINUTES_BEFORE * 60 * 1000) return 'before';
  if (t > end + CHECKIN_CLOSES_MINUTES_AFTER * 60 * 1000) return 'ended';
  return 'open';
}
