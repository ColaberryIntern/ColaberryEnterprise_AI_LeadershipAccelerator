/**
 * repoTreeRateLimit — pace the sweep, and stop it when GitHub says stop.
 *
 * ## Found on the first production run
 *
 * The first real sweep selected 25 connections and every one of them failed with
 * `GitHub API error: 403`, each in about 28ms. Not auth, and not an exhausted quota: a
 * single sync run immediately afterwards succeeded. The sweep was firing two calls per
 * connection with no delay, roughly 50 requests inside a second, which is precisely what
 * GitHub's secondary rate limit exists to stop.
 *
 * The batch cap alone was never enough. A cap bounds how MANY requests a run makes; it
 * says nothing about how FAST it makes them, and it was the speed that got us blocked.
 *
 * ## Two rules
 *
 * **Pace.** Wait between connections. GitHub asks for roughly a second between requests
 * from the same caller, so the default is deliberately above that.
 *
 * **Yield.** When several connections in a row come back rate-limited, the sweep stops
 * rather than working through the rest of the batch. Continuing would turn one blocked
 * request into twenty-five, deepen the block, and stamp nothing useful. The backlog is
 * ordered oldest-first and `last_sync_at` is only stamped on success, so everything
 * skipped is simply picked up by the next run.
 *
 * PURE. No I/O, no clock, no timers -- the sleeping itself belongs to the caller.
 */

/** Consecutive rate-limited failures before the sweep gives up for this run. */
export const MAX_CONSECUTIVE_RATE_LIMITED = 3;

/** Milliseconds between connections. Above GitHub's ~1/sec guidance, on purpose. */
export const DEFAULT_DELAY_MS = 1500;

/**
 * Does this error mean GitHub is throttling us, rather than something being wrong with
 * the repository?
 *
 * The distinction decides whether the sweep keeps going. A 404 on one student's deleted
 * repo says nothing about the next student and must not stop the run. A 403 or 429 says
 * the next request will fail too.
 *
 * `githubService` throws plain `Error`s whose message carries the status
 * (`GitHub API error: 403`), so matching the message is what is available. The status is
 * matched with a boundary so a repository id or byte count that happens to contain 403
 * cannot be mistaken for one.
 */
export function isRateLimited(message: unknown): boolean {
  if (typeof message !== 'string' || !message) return false;
  if (/\b(?:rate limit|secondary rate|abuse detection|too many requests)\b/i.test(message)) return true;
  return /\b(?:403|429)\b/.test(message);
}

/** Has the sweep seen enough consecutive throttling to stop for this run? */
export function shouldBackOff(consecutiveRateLimited: number): boolean {
  return consecutiveRateLimited >= MAX_CONSECUTIVE_RATE_LIMITED;
}

/**
 * How long to wait before the next connection.
 *
 * Zero for the first, so a sweep of one connection costs nothing, and a fixed delay
 * thereafter. Fixed rather than exponential: this is steady-state pacing to stay under a
 * documented limit, not recovery from a failure.
 */
export function delayBefore(index: number, delayMs: number = DEFAULT_DELAY_MS): number {
  if (index <= 0) return 0;
  return Number.isFinite(delayMs) && delayMs > 0 ? Math.floor(delayMs) : 0;
}
