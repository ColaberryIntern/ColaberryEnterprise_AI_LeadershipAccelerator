/**
 * watchRetry — how long to wait before re-sending a watch beat that failed.
 *
 * THE BUG THIS PREVENTS (reported in production 20 Nov 2026 by Swati Raman as
 * "a save every ~0.3 s, mostly 429"). The watch endpoint is rate limited per
 * participant at 30 requests a minute (participantLimiter.ts). A healthy player
 * flushes a beat every 15 seconds of playback, so it sits far under that budget
 * and never sees a 429 — until one send fails for any reason at all.
 *
 * What happens then is the trap. VideoEmbed deliberately re-credits the seconds
 * from a REJECTED beat back into its buffer, so a failed save does not destroy
 * watch time (19 Nov 2026). But re-crediting restores the buffer to at least
 * FLUSH_AFTER_S, which is the very condition that triggers a flush — and the
 * next playhead sample arrives about 0.3 s later. So the client sends again
 * immediately, fails again, re-credits again, and sends again: roughly three
 * requests a second for the rest of the limiter's window. ONE transient failure
 * becomes a self-sustaining storm, and the protection against losing watch time
 * is what sustains it.
 *
 * THE RULE INSTEAD: after a failure, wait before trying again. The server is
 * already telling us how long to wait — express-rate-limit runs with
 * `standardHeaders: true`, so a 429 carries `RateLimit-Reset`, the seconds left
 * in the window. Honouring it is both faster and gentler than guessing. When
 * there is no usable hint (a network drop, a 500, a CORS failure) fall back to
 * exponential back-off.
 *
 * Waiting costs nothing the learner can see: the buffer keeps accumulating
 * during the wait and goes out as one larger beat. The server expects exactly
 * that — watchProgressMath's `beatCeilingS` sizes its per-beat ceiling from the
 * last ACCEPTED beat, so a backlog that built up behind a rate limit arrives
 * with a ceiling large enough to carry it.
 */

/** First wait after a failure with no server hint. Doubles per consecutive failure. */
export const BASE_RETRY_MS = 5_000;

/** Ceiling on any wait. Past this we are no longer backing off, we are giving up on
 *  reporting at all, and the buffer would drift further from what was really watched.
 *  It also stops an absurd or hostile Retry-After header from stalling tracking for hours. */
export const MAX_RETRY_MS = 120_000;

/** Never retry faster than this, even if the server says the window is already clear. */
export const MIN_RETRY_MS = 1_000;

/** Spread, so many players (tabs, or several cards on one page) that failed together do not
 *  all return at the same instant and recreate the burst the back-off exists to prevent. */
export const RETRY_JITTER = 0.25;

/**
 * Read one header off an error, without assuming which HTTP client produced it.
 * Axios exposes a lowercased plain object; a fetch Response exposes a Headers
 * instance with .get(). Anything else yields null rather than throwing, because
 * a rejection reason is whatever the caller happened to throw.
 */
const headerOf = (err: unknown, name: string): string | null => {
  const headers = (err as { response?: { headers?: unknown } } | null | undefined)?.response?.headers;
  if (!headers) return null;
  if (typeof (headers as Headers).get === 'function') {
    const viaGet = (headers as Headers).get(name);
    return viaGet == null ? null : String(viaGet);
  }
  const bag = headers as Record<string, unknown>;
  const raw = bag[name] ?? bag[name.toLowerCase()];
  return raw == null ? null : String(raw);
};

/**
 * Seconds of wait named by a header value, or null if it does not name one.
 * `RateLimit-Reset` is delta-seconds. `Retry-After` is either delta-seconds or
 * an HTTP date, and both spellings appear in the wild, so both are accepted.
 */
const parseDelayS = (raw: string | null): number | null => {
  if (raw == null) return null;
  const text = raw.trim();
  if (text === '') return null;
  if (/^\d+(\.\d+)?$/.test(text)) {
    const n = Number(text);
    return Number.isFinite(n) ? n : null;
  }
  const at = Date.parse(text);
  if (!Number.isNaN(at)) return Math.max(0, (at - Date.now()) / 1000);
  return null;
};

const clamp = (ms: number) => Math.min(MAX_RETRY_MS, Math.max(MIN_RETRY_MS, Math.round(ms)));

/**
 * How long to wait before sending the next beat after a failure.
 *
 * @param err the rejection reason, inspected for a server-sent retry hint
 * @param consecutiveFailures 1 for the first failure, 2 for the second, and so on
 * @param rand injectable for deterministic tests; defaults to Math.random
 */
export function retryDelayMs(err: unknown, consecutiveFailures: number, rand: () => number = Math.random): number {
  const attempt = Math.max(1, Math.floor(Number(consecutiveFailures)) || 1);

  // The server's own number beats any guess we could make about its window.
  const hintS = parseDelayS(headerOf(err, 'ratelimit-reset')) ?? parseDelayS(headerOf(err, 'retry-after'));
  if (hintS != null && Number.isFinite(hintS) && hintS >= 0) {
    // Jitter UPWARD only here. Returning before the window the server named would
    // earn another 429 and teach us nothing.
    return clamp(hintS * 1000 * (1 + rand() * RETRY_JITTER));
  }

  const backoff = Math.min(BASE_RETRY_MS * 2 ** (attempt - 1), MAX_RETRY_MS);
  return clamp(backoff * (1 + (rand() * 2 - 1) * RETRY_JITTER));
}
