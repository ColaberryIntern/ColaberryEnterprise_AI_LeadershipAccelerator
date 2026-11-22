import { centralDateKey } from '../../centralDate';
import { quietUntil } from '../delivery/quietHours';
import { atCentral } from '../messages/promotionPlan';

/**
 * CH10.4 WhatsApp's sending rules (W5, W6), pure so they are tested without a database or a clock.
 *
 * Pacing: after each send the next is no sooner than 40 s plus a random 0 to 40 s (never a fixed
 * interval). Window: only 8:00 AM to 8:00 PM Central (on top of the hub's quiet hours). Cap: at most
 * the daily cap per Central day. A send that may not happen now waits (a hold); it never bursts later.
 */
export const PACE_MIN_MS = 40_000;
export const PACE_JITTER_MS = 40_000;
export const WINDOW = { start: '20:00', end: '08:00' } as const; // the closed part: 8 PM to 8 AM Central
export const BREAKER_MS = 48 * 3600_000;
export const DISCONNECTED_HOLD_MS = 10 * 60_000;
export const CHECK_FAILED_HOLD_MS = 5 * 60_000;
/** A pre-flight or dedup check failing this long since the first claim fails the delivery (no endless wait). */
export const CHECK_GIVE_UP_MS = 24 * 3600_000;
/** The W5 look-back margin: WhatsApp's clock is not ours, and its timestamps are whole seconds. */
export const SKEW_MARGIN_S = 120;

export function nextSendAt(now: Date, random: () => number): Date {
  const jitter = Math.floor(Math.max(0, Math.min(0.999999, random())) * PACE_JITTER_MS);
  return new Date(now.getTime() + PACE_MIN_MS + jitter);
}

/** When the 8 AM to 8 PM Central window opens again, or null when it is open now. */
export function windowHoldUntil(now: Date): Date | null {
  return quietUntil(now, WINDOW);
}

function nextDayKey(key: string): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** When the daily cap allows the next send (8 AM Central tomorrow), or null when it allows one now. */
export function dailyCapHoldUntil(state: { day: string | null; count: number }, cap: number, now: Date): Date | null {
  const today = centralDateKey(now.getTime());
  if (state.day !== today || state.count < cap) return null;
  return atCentral(nextDayKey(today), WINDOW.end);
}

/** The W5 match: compare what was sent with what we would send, after normalizing. */
export function normalizeText(s: string): string {
  return s.normalize('NFC').replace(/\s+/g, ' ').trim();
}

export type DedupResult = { kind: 'none' } | { kind: 'one'; id: string } | { kind: 'many'; ids: string[] };

/**
 * Of the messages our number sent to the group since the first claim (minus the skew margin), the ones
 * whose text is exactly this delivery's and that no OTHER delivery has recorded as its own.
 */
export function findEarlierSend(sent: Array<{ id: string; text: string | null }>, expected: string, recordedElsewhere: Set<string>): DedupResult {
  const want = normalizeText(expected);
  const ids = sent.filter((m) => m.text !== null && normalizeText(m.text) === want && !recordedElsewhere.has(m.id)).map((m) => m.id);
  if (ids.length === 0) return { kind: 'none' };
  if (ids.length === 1) return { kind: 'one', id: ids[0] };
  return { kind: 'many', ids };
}

export function lookBackFrom(firstClaimedAt: Date): number {
  return Math.floor(firstClaimedAt.getTime() / 1000) - SKEW_MARGIN_S;
}
