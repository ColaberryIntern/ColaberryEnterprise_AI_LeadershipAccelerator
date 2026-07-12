/**
 * bcRetry — shared transient-failure backoff for Basecamp API calls.
 *
 * Basecamp rate-limits (HTTP 429) when a caller bursts requests; bcSyncService
 * walks every project -> todoset -> todolist -> todo each cycle and was logging
 * hundreds of 429s per run (so the ops mirror synced incompletely). The host
 * scripts already back off (launchPmoOps `rawFetch`); this is the ops-services
 * equivalent. 503 (transient upstream) is treated the same.
 */
export const BC_RETRYABLE_STATUS = new Set([429, 503]);

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Delay before retrying a retryable response. Honors a `Retry-After` header
 * (seconds) when present and sane, else capped exponential backoff
 * (1s, 2s, 4s, 8s ...). Pure + exported for tests.
 * @param retryAfter the raw `Retry-After` header value (or null)
 * @param attempt 0-based retry attempt number
 */
export function bcBackoffMs(retryAfter: string | null, attempt: number): number {
  const ra = parseInt(retryAfter || '', 10);
  if (Number.isFinite(ra) && ra > 0) return Math.min(ra * 1000, 30000);
  return Math.min(1000 * 2 ** Math.max(0, attempt), 8000);
}

// Proactive pacing. Reactive backoff alone is too slow at sync volume (hundreds
// of calls): if most calls 429 and each then waits seconds, a full sync runs for
// many minutes. Basecamp's limit is ~50 requests / 10s; pacing every BC call at
// BC_MIN_INTERVAL_MS keeps us comfortably under it so 429s rarely happen at all,
// and the sync stays bounded + predictable. Module-level clock is shared across
// the ops BC callers (same account/IP).
export const BC_MIN_INTERVAL_MS = Number(process.env.BC_MIN_INTERVAL_MS) || 250;

/** Ms to wait so the next call is >= minIntervalMs after the previous. Pure. */
export function paceDelayMs(lastCallAt: number, now: number, minIntervalMs: number): number {
  return Math.max(0, lastCallAt + minIntervalMs - now);
}

let lastBcCallAt = 0;
/** Await this before each BC request to stay under the rate limit. */
export async function bcPace(minIntervalMs: number = BC_MIN_INTERVAL_MS): Promise<void> {
  const wait = paceDelayMs(lastBcCallAt, Date.now(), minIntervalMs);
  if (wait > 0) await sleep(wait);
  lastBcCallAt = Date.now();
}
