/**
 * Is this signed webhook delivery fresh enough to act on?
 *
 * WHY A VALID SIGNATURE IS NOT ENOUGH. Zoom signs `v0:{timestamp}:{body}`, and the
 * signature stays valid forever — it proves the request was genuine when it was
 * made, never that it was made recently. Anyone who captures one delivery (a proxy
 * log, a mirrored request, an error report with headers attached) can replay it
 * verbatim, as many times as they like, and today it would be accepted every time.
 *
 * The timestamp is already in the HMAC input, so it cannot be altered without
 * breaking the signature. That makes it trustworthy — and means checking it costs
 * nothing beyond comparing it to the clock.
 *
 * WHY THE WINDOW IS GENEROUS. Five minutes is the usual choice and it is too tight
 * here: Zoom retries a failed delivery on its own schedule, and this backend is
 * occasionally down for a minute during a deploy. A window that rejects a legitimate
 * retry loses a recording permanently, which is a worse failure than accepting a
 * replay of an event that is idempotent anyway. Fifteen minutes either side.
 *
 * WHY FUTURE TIMESTAMPS ARE BOUNDED TOO. A clock-skewed or forged-forward timestamp
 * would otherwise stay "fresh" indefinitely, which defeats the whole check.
 */

/** Either side of now. Deliberately wider than the usual five minutes. */
export const REPLAY_WINDOW_MS = 15 * 60 * 1000;

export type FreshnessVerdict =
  | { fresh: true; ageMs: number }
  | { fresh: false; reason: 'missing' | 'malformed' | 'too_old' | 'too_far_ahead'; ageMs: number | null };

/**
 * Zoom sends `x-zm-request-timestamp` in SECONDS. Treating it as milliseconds makes
 * every delivery look like 1970 and rejects all of them, so the unit is asserted
 * rather than assumed: anything that parses to a plausible second-scale epoch is
 * read as seconds, and a millisecond-scale value is read as milliseconds.
 */
function toMillis(raw: string): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  // ~2001 in seconds is ~1e9; the same instant in milliseconds is ~1e12.
  return n < 1e11 ? n * 1000 : n;
}

export function judgeDeliveryFreshness(
  timestampHeader: string | string[] | undefined,
  nowMs: number = Date.now(),
): FreshnessVerdict {
  const raw = Array.isArray(timestampHeader) ? timestampHeader[0] : timestampHeader;
  if (!raw) return { fresh: false, reason: 'missing', ageMs: null };

  const sentMs = toMillis(String(raw));
  if (sentMs === null) return { fresh: false, reason: 'malformed', ageMs: null };

  const ageMs = nowMs - sentMs;
  if (ageMs > REPLAY_WINDOW_MS) return { fresh: false, reason: 'too_old', ageMs };
  if (ageMs < -REPLAY_WINDOW_MS) return { fresh: false, reason: 'too_far_ahead', ageMs };
  return { fresh: true, ageMs };
}

/**
 * A stable id for one logical delivery.
 *
 * The occurrence uuid plus the event name identifies the thing that happened; the
 * timestamp is deliberately NOT included, because Zoom's own retry of the same
 * event carries a new timestamp and must collapse onto the same key rather than
 * being treated as a second event.
 */
export function deliveryKey(eventName: string, occurrenceUuid: string, meetingId: string): string {
  return [eventName, occurrenceUuid || `meeting:${meetingId}`].join(':');
}
