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
 * this particular repository?
 *
 * The distinction decides whether the sweep keeps going. A failure specific to one repo
 * says nothing about the next student and must not stop the run.
 *
 * ## A BARE 403 IS NOT THROTTLING
 *
 * GitHub overloads 403 for two unrelated things: rate limiting, and plain permission
 * denial on a private repository the caller cannot read. This originally counted any 403
 * as throttling, and the second production sweep proved that wrong within minutes:
 * 21 connections synced fine, then three consecutive 403s tripped the back-off and the
 * sweep stopped. Those three were `ColaberryIntern/AI_Pathway`, `AcceleratorTesting` and
 * `OpportunityPulse` -- internal repositories that 403 permanently, not a throttled
 * client. Rate limits apply to the caller, and the caller had just made 21 successful
 * calls.
 *
 * That combination was self-starving. Those connections have never synced, so they sort
 * FIRST on every sweep; they fail permanently; and back-off then stopped the run before
 * it reached any real student behind them. Permanent poison at the head of the queue
 * would have blocked the backlog forever, on a schedule, silently.
 *
 * So throttling now requires an EXPLICIT signal: a 429, or GitHub's own rate-limit
 * wording. A bare 403 is treated as a problem with that one repository -- logged, counted
 * as a failure, and stepped over.
 *
 * The trade is deliberate and lopsided. A false back-off starves every student behind the
 * bad connection, on every run. A missed back-off costs at most one paced sweep of
 * pointless calls, and pacing already prevents the burst that caused the original
 * incident. `githubService` surfaces only the status and not the response body, so this
 * is the strongest inference available without changing that shared service.
 *
 * Statuses are matched on a word boundary, so a file count of 4030 is not a rate limit.
 */
export function isRateLimited(message: unknown): boolean {
  if (typeof message !== 'string' || !message) return false;
  if (/(?:rate.?limit|secondary rate|abuse detection|too many requests)/i.test(message)) return true;
  return /\b429\b/.test(message);
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
