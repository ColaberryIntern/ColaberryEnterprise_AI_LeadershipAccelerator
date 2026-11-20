/**
 * The sending worker's numbers (CH7.2), in one file so they are read and tested in one place.
 *
 * A delivery gets 4 tries in total: the first, then +1 min, +5 min and +15 min after each failure.
 * After the 4th failure it is `failed` and the message's result says so (partially_failed / failed);
 * Jackie can retry the failed destinations by hand, on the SAME delivery rows and idempotency keys.
 * A refusal the channel says is permanent (bad destination, missing cohort, bad media) fails at once.
 */
export const MAX_ATTEMPTS = 4;
export const RETRY_DELAYS_MS: readonly number[] = [60_000, 5 * 60_000, 15 * 60_000];

/** A delivery left `sending` this long (the process died mid-send) is claimed again. */
export const SENDING_LEASE_MS = 10 * 60_000;
/** How long one channel send may take before the attempt counts as failed (and retries). */
export const SEND_TIMEOUT_MS = 60_000;
/** Most messages started and deliveries claimed per tick, so one tick stays short. */
export const MESSAGES_PER_TICK = 20;
export const DELIVERIES_PER_TICK = 25;

/**
 * When the next try happens after a failed attempt, or null when it was the last one.
 * `attemptsMade` counts the attempt that just failed (1 after the first try).
 */
export function nextAttemptAt(attemptsMade: number, now: Date): Date | null {
  if (attemptsMade >= MAX_ATTEMPTS || attemptsMade < 1) return null;
  return new Date(now.getTime() + RETRY_DELAYS_MS[attemptsMade - 1]);
}
