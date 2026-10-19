import { centralDateKey, centralWallClockToInstant } from '../centralDate';

/**
 * Game Room play-time math (Colaberry Campus C10). Pure: no clock, no I/O; every instant is passed in from the SERVER clock.
 *
 * The daily allowance is 15 minutes of CREDITED play per learner per Central day. Credit is earned only by the server measuring the
 * gap between a run's own heartbeats; the client never sends a duration. A gap is credited up to 30 s (a client beats every 15 s, so
 * one missed beat is tolerated and a client that beats less often simply earns less), never past what is left today, never negative
 * (clock skew), and never for a run whose Central day has ended (a run belongs to the day it started).
 */
export const DAILY_CAP_S = 15 * 60;
export const MAX_GAP_CREDIT_S = 30;

/** Seconds to credit for one beat or submit. */
export function creditFor(args: { nowMs: number; lastBeatMs: number; usedTodayS: number; runDate: string }): number {
  if (centralDateKey(args.nowMs) !== args.runDate) return 0; // the run's day is over
  const gap = Math.floor((args.nowMs - args.lastBeatMs) / 1000);
  const left = Math.max(0, DAILY_CAP_S - args.usedTodayS);
  return Math.max(0, Math.min(gap, MAX_GAP_CREDIT_S, left));
}

/** True once the run's Central day has ended (beats and submits are then refused: RunExpired). */
export const runExpired = (nowMs: number, runDate: string): boolean => centralDateKey(nowMs) !== runDate;

/** The next midnight Central after `nowMs` (when the allowance resets). DST-aware. */
export function resetsAt(nowMs: number): Date {
  const today = centralDateKey(nowMs);
  const next = new Date(Date.parse(`${today}T00:00:00Z`) + 36 * 3600 * 1000); // lands inside tomorrow whatever the DST shift
  return centralWallClockToInstant(new Date(`${next.toISOString().slice(0, 10)}T00:00:00Z`));
}

/** The Central calendar date of the Monday that starts the current Central week (the leaderboard's window). */
export function centralWeekStart(nowMs: number): string {
  const today = centralDateKey(nowMs);
  const d = new Date(`${today}T00:00:00Z`);
  const mondayOffset = (d.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(d.getTime() - mondayOffset * 86400000).toISOString().slice(0, 10);
}
