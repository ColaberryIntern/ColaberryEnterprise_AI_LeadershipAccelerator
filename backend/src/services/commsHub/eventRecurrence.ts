import { classInstant, centralDateKey } from '../centralDate';
import type { CommsHubRepeatRule } from '../../models/CommsHubEvent';

/**
 * Occurrences of a hub event (CH2.2). Pure. Recurrence is computed on the Central CALENDAR, never by
 * adding milliseconds: "every Tuesday at 6:00 PM" stays 6:00 PM across the daylight-saving change,
 * which a fixed 7*24h step would move by an hour. Each occurrence keeps the first one's duration.
 */
export const MAX_OCCURRENCES = 60;
export const MAX_REPEAT_DAYS = 366;

export interface Occurrence { starts_at: Date; ends_at: Date | null }

function addDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Same day of month, n months on; null when that month has no such day (the 31st in a 30-day month is skipped). */
function addMonths(dateKey: string, months: number): string | null {
  const [y, m, d] = dateKey.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, d, 12));
  return target.getUTCDate() === d ? target.toISOString().slice(0, 10) : null;
}

/** "HH:MM" of an instant on the Central clock. */
export function centralClock(instant: Date): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Chicago', hour: '2-digit', minute: '2-digit', hour12: false })
    .format(instant).replace(/^24/, '00');
}

export function expandOccurrences(startsAt: Date, endsAt: Date | null, rule: CommsHubRepeatRule | null): Occurrence[] {
  const duration = endsAt ? endsAt.getTime() - startsAt.getTime() : null;
  const first: Occurrence = { starts_at: startsAt, ends_at: endsAt };
  if (!rule) return [first];
  const startKey = centralDateKey(startsAt.getTime());
  const clock = centralClock(startsAt);
  const out: Occurrence[] = [first];
  for (let n = 1; out.length < MAX_OCCURRENCES; n += 1) {
    const key = rule.freq === 'monthly' ? addMonths(startKey, n) : addDays(startKey, n * (rule.freq === 'weekly' ? 7 : 14));
    if (rule.freq === 'monthly' && n > 24) break;
    if (key === null) continue;
    if (key > rule.until) break;
    const s = classInstant(key, clock);
    out.push({ starts_at: s, ends_at: duration === null ? null : new Date(s.getTime() + duration) });
  }
  return out;
}

/** The occurrences that start at or after `from` (for "next" and previews). */
export function upcomingOccurrences(startsAt: Date, endsAt: Date | null, rule: CommsHubRepeatRule | null, from: Date): Occurrence[] {
  return expandOccurrences(startsAt, endsAt, rule).filter((o) => o.starts_at.getTime() >= from.getTime());
}
