/**
 * Inbox Sync Backoff — per-provider retry gating for syncAllMailboxes().
 *
 * WHY: before this module existed, a failing mailbox (rate-limited or dead OAuth
 * grant) got retried every 60s forever with no backoff, which does nothing but keep
 * hammering the upstream API during an active rate-limit window.
 *
 * FAILURE MODEL:
 *   - What happens if a provider fails: it's skipped on subsequent sync ticks until
 *     its backoff window elapses. Other providers are never affected — each provider
 *     has its own independent backoff entry, keyed by provider name.
 *   - Retry strategy: if the failure message includes an explicit "Retry after
 *     <ISO-8601>" hint (Gmail sometimes includes this on rate-limit errors), that
 *     timestamp is honored. Otherwise, exponential backoff from a 30s base, doubling
 *     per consecutive failure, capped at 30 minutes (matches the cooldown_ms default
 *     already used by openclawCircuitBreaker.ts elsewhere in this repo for the same
 *     kind of external-API back-pressure — chosen independently here, not imported,
 *     per backend/CLAUDE.md's ban on cross-feature imports between agents/openclaw
 *     and inbox).
 *   - Recovery path: automatic. The very next sync tick after the backoff window
 *     elapses tries the provider again; a success clears the backoff entirely. No
 *     manual intervention is needed for a transient rate-limit.
 *   - Explicit failure modes NOT handled: a dead OAuth grant (invalid_grant) will
 *     keep failing every attempt once its backoff window elapses, forever — that is
 *     correct, not a bug. More retries cannot fix a dead credential; only a human
 *     re-running scripts/inbox-auth-helper.js can. This module's job is only to slow
 *     down how often we ask, not to determine whether the failure is fixable.
 *
 * In-memory only, resets on process restart — an accepted tradeoff (a restart is
 * exactly when retrying immediately is reasonable anyway), same choice
 * openclawCircuitBreaker.ts makes for its own state.
 */

const BASE_DELAY_MS = 30_000; // 30s
const MAX_DELAY_MS = 30 * 60_000; // 30 min ceiling

interface BackoffEntry {
  consecutiveFailures: number;
  nextAttemptAt: number; // epoch ms
}

const backoffState = new Map<string, BackoffEntry>();

/**
 * Extracts an explicit "Retry after <ISO-8601 date>" hint from an error message,
 * if present. Returns null if no such hint is found or it doesn't parse.
 */
export function parseRetryAfter(message: string | undefined | null): Date | null {
  if (!message) return null;
  const match = message.match(/Retry after (\S+)/i);
  if (!match) return null;
  const parsed = new Date(match[1]);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Pure function: given how many consecutive failures a provider has had, an
 * optional explicit retry-after hint, and the current time, compute when the next
 * attempt should be allowed.
 */
export function computeNextAttempt(
  consecutiveFailures: number,
  retryAfterHint: Date | null,
  now: Date,
): Date {
  const exponential = Math.min(
    BASE_DELAY_MS * Math.pow(2, Math.max(0, consecutiveFailures - 1)),
    MAX_DELAY_MS,
  );
  const exponentialAt = new Date(now.getTime() + exponential);

  if (retryAfterHint && retryAfterHint.getTime() > exponentialAt.getTime()) {
    return retryAfterHint;
  }
  return exponentialAt;
}

/**
 * Returns true if `provider` is currently within its backoff window and the sync
 * loop should skip attempting it this tick.
 */
export function shouldSkip(provider: string, now: Date = new Date()): boolean {
  const entry = backoffState.get(provider);
  if (!entry) return false;
  return now.getTime() < entry.nextAttemptAt;
}

/**
 * Records a sync failure for `provider`, advancing its backoff window.
 */
export function recordFailure(provider: string, errorMessage: string, now: Date = new Date()): void {
  const existing = backoffState.get(provider);
  const consecutiveFailures = (existing?.consecutiveFailures || 0) + 1;
  const retryAfterHint = parseRetryAfter(errorMessage);
  const nextAttemptAt = computeNextAttempt(consecutiveFailures, retryAfterHint, now).getTime();
  backoffState.set(provider, { consecutiveFailures, nextAttemptAt });
}

/**
 * Clears any backoff state for `provider` after a successful sync.
 */
export function recordSuccess(provider: string): void {
  backoffState.delete(provider);
}

/**
 * Observability helper — not wired into any route in this change, exposed for
 * future use (e.g. a health/status endpoint).
 */
export function getBackoffStatus(provider: string): { consecutiveFailures: number; nextAttemptAt: string | null } {
  const entry = backoffState.get(provider);
  if (!entry) return { consecutiveFailures: 0, nextAttemptAt: null };
  return { consecutiveFailures: entry.consecutiveFailures, nextAttemptAt: new Date(entry.nextAttemptAt).toISOString() };
}
