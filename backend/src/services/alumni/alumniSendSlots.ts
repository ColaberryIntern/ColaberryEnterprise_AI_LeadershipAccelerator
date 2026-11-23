/**
 * AL1 send spacing (Ali, 2026-11-23): "I want these to go out at least 5 minutes apart on weekdays.
 * I want everyone to be able to get 10 emails before the end of the year." He chose waking hours:
 * 6:00 AM to 11:00 PM Central, Monday to Friday.
 *
 * The campaign therefore sends ONE email every 5 minutes inside that window. Each send gets its own
 * 5-minute slot, and the slots are dealt out a wave at a time: everyone's Email 1, then everyone's
 * Email 2, and so on, with at least a day between any one person's emails and no email before its
 * own first day (the "Happy New Year" email never goes before Dec 29).
 *
 * Pure planning, no I/O. The booker (scripts/ensureDaAlumniHolidayCampaign) passes in the slots
 * already taken by earlier bookings, so a re-run never doubles a slot.
 *
 * Failure mode handled: a person who cannot get all ten emails before the last day is left out
 * entirely (plan entry null) and their slots are freed. Nobody is booked for part of the series.
 */
import { classInstant } from '../centralDate';

export interface SlotRules {
  /** First and last calendar day (YYYY-MM-DD, Central) a send may go out. */
  firstDay: string;
  lastDay: string;
  /** Daily window, Central wall clock; the end is exclusive. */
  startClock: string;
  endClock: string;
  /** Minutes between consecutive sends in the campaign. */
  gapMinutes: number;
  /** Hours between one person's consecutive emails. */
  minPersonGapHours: number;
}

export const AL1_SLOT_RULES: SlotRules = {
  firstDay: '2026-11-24', lastDay: '2026-12-31',
  startClock: '06:00', endClock: '23:00',
  gapMinutes: 5, minPersonGapHours: 24,
};

/** Email 1 starts Tue Nov 24 at 10:00 AM CT, as Ali approved. */
export const AL1_FIRST_SEND = classInstant('2026-11-24', '10:00');

const pad = (n: number) => String(n).padStart(2, '0');

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Monday to Friday. A calendar date's weekday does not depend on the time zone. */
export function isWeekday(day: string): boolean {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
  return dow >= 1 && dow <= 5;
}

function clockMinutes(clock: string): number {
  const [h, m] = clock.split(':').map(Number);
  return h * 60 + m;
}

/** Every send slot (epoch ms, ascending) the rules allow, at or after notBefore. */
export function sendSlots(rules: SlotRules, notBefore: number): number[] {
  const out: number[] = [];
  const from = clockMinutes(rules.startClock), to = clockMinutes(rules.endClock);
  for (let day = rules.firstDay; day <= rules.lastDay; day = addDays(day, 1)) {
    if (!isWeekday(day)) continue;
    for (let m = from; m < to; m += rules.gapMinutes) {
      const t = classInstant(day, `${pad(Math.floor(m / 60))}:${pad(m % 60)}`).getTime();
      if (t >= notBefore) out.push(t);
    }
  }
  return out;
}

/** First index in a sorted array whose value is >= x. */
function lowerBound(a: number[], x: number): number {
  let lo = 0, hi = a.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (a[mid] < x) lo = mid + 1; else hi = mid; }
  return lo;
}

/**
 * Deal out slots: people.length people, stepNotBefore.length emails each. Returns, per person in
 * the order given, their send times (epoch ms, one per email, ascending), or null when the whole
 * series does not fit. Deterministic: the same inputs always give the same plan.
 */
export function planSends(people: number, stepNotBefore: number[], slots: number[], taken: Set<number>, minPersonGapMs: number): Array<number[] | null> {
  const free = slots.filter((t) => !taken.has(t));
  const used = new Uint8Array(free.length);
  const plan: Array<number[] | null> = Array.from({ length: people }, () => []);
  const usedBy: number[][] = Array.from({ length: people }, () => []);
  for (let k = 0; k < stepNotBefore.length; k++) {
    for (let i = 0; i < people; i++) {
      const mine = plan[i];
      if (!mine) continue;
      const lo = Math.max(stepNotBefore[k], mine.length ? mine[mine.length - 1] + minPersonGapMs : -Infinity);
      let j = lowerBound(free, lo);
      while (j < free.length && used[j]) j++;
      if (j >= free.length) {
        for (const u of usedBy[i]) used[u] = 0; // free their slots: all ten or none
        plan[i] = null;
        continue;
      }
      used[j] = 1; usedBy[i].push(j); mine.push(free[j]);
    }
  }
  return plan;
}

/** Each email's first allowed instant: 00:00 CT on its day, and never before Email 1's start or `now`. */
export function stepStarts(stepDays: string[], now: number, firstSend = AL1_FIRST_SEND.getTime()): number[] {
  return stepDays.map((d, k) => Math.max(now, k === 0 ? firstSend : classInstant(d, '00:00').getTime()));
}
