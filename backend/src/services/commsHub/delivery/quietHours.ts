import type { CommsHubQuietHours } from '../../../models/CommsHubSettings';
import { centralDateKey } from '../../centralDate';
import { centralParts } from '../messages/draftFacts';
import { atCentral } from '../messages/promotionPlan';

/**
 * Quiet hours (CH7.2): a Central wall-clock window, e.g. { start: '21:00', end: '08:00' }, during which
 * nothing is sent. A window may cross midnight. Returns the instant the window ends (when sending may
 * resume), or null when `now` is outside it, there is no window, or the window is malformed or empty.
 * The end is computed in Central with the two-pass conversion, so it is right across daylight saving.
 */
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

function minutesOf(hhmm: string): number | null {
  const m = HHMM.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function nextDay(key: string): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function quietUntil(now: Date, q: CommsHubQuietHours | null | undefined): Date | null {
  if (!q) return null;
  const start = minutesOf(q.start);
  const end = minutesOf(q.end);
  if (start === null || end === null || start === end) return null;
  const at = centralParts(now).minutes;
  const today = centralDateKey(now.getTime());
  if (start < end) {
    // Same-day window, e.g. 12:00-13:00.
    return at >= start && at < end ? atCentral(today, q.end) : null;
  }
  // Crosses midnight, e.g. 21:00-08:00: quiet from start to midnight (ends tomorrow) and from midnight to end (ends today).
  if (at >= start) return atCentral(nextDay(today), q.end);
  if (at < end) return atCentral(today, q.end);
  return null;
}
