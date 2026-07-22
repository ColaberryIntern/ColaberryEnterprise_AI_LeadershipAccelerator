import StudentPointsEvent from '../models/StudentPointsEvent';
import { award, hasAwarded } from './pointsService';
import { centralDateKey } from './centralDate';

/**
 * Daily streak — server-authoritative, idempotent, escalating.
 *
 * The old streak was client-side localStorage: a fixed Mon–Sun row, no
 * gap-reset, no points. This replaces it with a real ledger-backed streak:
 *
 *  - The window is the LAST 7 Central days (rolling, ending today) — not a
 *    fixed calendar week.
 *  - Consecutive days are derived from the `daily_streak:<centralDate>` events
 *    in the points ledger, so a missed day RESETS the run (no silent inflation).
 *  - Each claim awards escalating points (longer runs pay more, capped), and
 *    those points fold straight into the student's total score and show up in
 *    the Schedule points history.
 *  - Claiming twice in one Central day is a no-op (idempotent on the event key).
 */

export const STREAK_EVENT_TYPE = 'daily_streak';
const keyFor = (dateKey: string): string => `${STREAK_EVENT_TYPE}:${dateKey}`;

// centralDateKey now lives in ./centralDate so the points economy (streaks +
// daily caps + HUD) shares ONE Central-day boundary. Re-exported here so
// existing consumers (and this service's test) keep importing it from
// streakService unchanged.
export { centralDateKey };

/** Previous calendar day for a 'YYYY-MM-DD' key (pure date arithmetic, tz-safe). */
function prevKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/** Short weekday label for a date key, e.g. 'Mon'. */
function labelFor(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
}

/** Escalating award for the Nth consecutive day: base 5, +3/day, capped at 30. */
export function streakPointsFor(consecutiveDay: number): number {
  return Math.min(5 + Math.max(0, consecutiveDay - 1) * 3, 30);
}

/** Count consecutive claimed days ending at (and including) `endKey`, walking back. */
function consecutiveEndingAt(set: Set<string>, endKey: string): number {
  let c = 0;
  let k = endKey;
  while (set.has(k)) { c++; k = prevKey(k); }
  return c;
}

/** All claimed Central-date keys + total streak points for an enrollment. */
async function loadClaims(enrollmentId: string): Promise<{ set: Set<string>; totalPoints: number }> {
  const rows = await StudentPointsEvent.findAll({
    where: { enrollment_id: enrollmentId, event_type: STREAK_EVENT_TYPE },
    attributes: ['event_key', 'points'],
  });
  const set = new Set<string>();
  let totalPoints = 0;
  for (const r of rows as any[]) {
    const k = String(r.event_key || '').split(':')[1];
    if (k) set.add(k);
    totalPoints += r.points || 0;
  }
  return { set, totalPoints };
}

export interface StreakDay { date: string; label: string; hit: boolean; is_today: boolean; }
export interface StreakView {
  count: number;                 // current consecutive-day run (alive if today OR yesterday claimed)
  claimed_today: boolean;
  week: StreakDay[];             // last 7 Central days, oldest → today
  total_streak_points: number;
  next_points: number;           // points a claim right now would award (0 if already claimed)
}

/** Compute the current streak view (no writes). */
export async function getStreak(enrollmentId: string, nowMs: number = Date.now()): Promise<StreakView> {
  const { set, totalPoints } = await loadClaims(enrollmentId);
  const todayKey = centralDateKey(nowMs);
  const claimedToday = set.has(todayKey);
  // The run is "alive" through yesterday until today's claim lands.
  const count = claimedToday
    ? consecutiveEndingAt(set, todayKey)
    : consecutiveEndingAt(set, prevKey(todayKey));

  const keys: string[] = [];
  let k = todayKey;
  for (let i = 0; i < 7; i++) { keys.push(k); k = prevKey(k); }
  keys.reverse();
  const week: StreakDay[] = keys.map((key) => ({
    date: key, label: labelFor(key), hit: set.has(key), is_today: key === todayKey,
  }));

  return {
    count,
    claimed_today: claimedToday,
    week,
    total_streak_points: totalPoints,
    next_points: claimedToday ? 0 : streakPointsFor(count + 1),
  };
}

/**
 * Claim today's streak. Idempotent per Central day. On a fresh claim, awards
 * escalating points for the new consecutive-day count and returns the updated
 * view. A gap since the last claim resets the run to day 1.
 */
export async function claimStreak(
  enrollmentId: string,
  nowMs: number = Date.now(),
): Promise<{ awarded: boolean; points: number; streak: StreakView }> {
  const todayKey = centralDateKey(nowMs);
  if (await hasAwarded(enrollmentId, keyFor(todayKey))) {
    return { awarded: false, points: 0, streak: await getStreak(enrollmentId, nowMs) };
  }
  const { set } = await loadClaims(enrollmentId);
  const newCount = consecutiveEndingAt(set, prevKey(todayKey)) + 1; // resets to 1 after a gap
  const pts = streakPointsFor(newCount);
  const res = await award(enrollmentId, {
    eventType: STREAK_EVENT_TYPE,
    eventKey: keyFor(todayKey),
    points: pts,
    metadata: { streak_day: newCount, date: todayKey },
  });
  return { awarded: res.awarded, points: res.points, streak: await getStreak(enrollmentId, nowMs) };
}
