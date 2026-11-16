/**
 * Career Prep v27, CP4.5: WHEN a reminder goes out. Pure; every time is Central (America/Chicago), the
 * product's one time zone (there is no per-student time zone to read).
 *
 *   tonight    today at 6:00 PM Central. Asked for after 6:00 PM, it is refused (the card is not offered
 *              then); "Same time tomorrow" is the choice instead.
 *   tomorrow   the next Central calendar date, at the same Central clock time the session started (or the
 *              time it was asked for). Stepped by calendar date, never by adding 24 hours, so DST is exact.
 *
 * QUIET HOURS: nothing is sent from 9:00 PM to 8:00 AM Central. A time that falls inside them moves to
 * 8:00 AM Central (the same morning, or the next one when it is late evening).
 */
export type ReminderKind = 'tonight' | 'tomorrow';
export const QUIET_START_HOUR = 21;
export const QUIET_END_HOUR = 8;
export const TONIGHT_HOUR = 18;
export class TooLateError extends Error { constructor() { super('too late for tonight'); this.name = 'TooLateError'; } }

const FMT = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

/** The Central calendar date and clock time of an instant. */
export function centralClock(at: Date): { date: string; hour: number; minute: number } {
  const p = Object.fromEntries(FMT.formatToParts(at).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24, minute: Number(p.minute) };
}

/** The instant a Central wall-clock time happens (CST is UTC-6, CDT UTC-5; the one that round-trips wins). */
export function centralToInstant(date: string, hour: number, minute: number): Date {
  const [y, m, d] = date.split('-').map(Number);
  for (const offset of [5, 6]) {
    const t = new Date(Date.UTC(y, m - 1, d, hour + offset, minute));
    const c = centralClock(t);
    if (c.date === date && c.hour === hour && c.minute === minute) return t;
  }
  // A wall time skipped by the spring-forward hour: the hour after it.
  return new Date(Date.UTC(y, m - 1, d, hour + 5, minute));
}

/** The next Central calendar date (noon UTC keeps the step clear of any DST edge). */
export function nextCentralDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1, 12)).toISOString().slice(0, 10);
}

export function inQuietHours(at: Date): boolean {
  const { hour } = centralClock(at);
  return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
}

/** Out of quiet hours: unchanged when allowed, else 8:00 AM Central (this morning, or tomorrow when late). */
export function afterQuietHours(at: Date): Date {
  if (!inQuietHours(at)) return at;
  const c = centralClock(at);
  return centralToInstant(c.hour >= QUIET_START_HOUR ? nextCentralDate(c.date) : c.date, QUIET_END_HOUR, 0);
}

/** When a reminder of this kind, asked for at `now` (for a session that started at `from`), is sent. */
export function reminderTime(kind: ReminderKind, now: Date, from: Date = now): Date {
  if (kind === 'tonight') {
    const at = centralToInstant(centralClock(now).date, TONIGHT_HOUR, 0);
    if (now.getTime() >= at.getTime()) throw new TooLateError();
    return at;
  }
  const c = centralClock(from);
  return afterQuietHours(centralToInstant(nextCentralDate(centralClock(now).date), c.hour, c.minute));
}
