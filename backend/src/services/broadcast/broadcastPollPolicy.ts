/**
 * How often a client may come back to ask what is airing — decided by the SERVER.
 *
 * P3-09 asked for a deliberate choice between realtime and polling for live state. The choice
 * is POLLING, and the reasoning is a hard constraint rather than a preference:
 *
 *   SSE cannot carry the participant's credential. `hooks/useRealtimeAwareness.ts` is the only
 *   realtime transport in this app, and it serves the ADMIN cognitive stream over
 *   `EventSource` with `withCredentials` — i.e. cookies. The portal authenticates with a
 *   Bearer JWT, and `EventSource` has no API for request headers. Carrying the token would
 *   mean either putting it in the query string, where it lands in every access log and
 *   referrer, or minting a cookie session for the portal. Both are worse than a poll.
 *
 *   The payload is tiny and the cadence is slow. A badge does not need sub-second latency;
 *   the player is opened deliberately. WebSockets would add a connection per viewer and a new
 *   piece of infrastructure to operate, for a payload measured in hundreds of bytes.
 *
 * THE INTERVAL IS SERVER-CONTROLLED, which is the part that matters operationally. The
 * discovery response carries `poll_after_ms`, so the cadence is tunable by an environment
 * variable without shipping a frontend build — that is the rollback lever the plan's row
 * asks for ("Interval is a setting, tunable without deploy"). A client that hard-codes its
 * own interval cannot be slowed down during an incident.
 *
 * THE BOUNDS ARE THE SAFETY PROPERTY. An operator typo must not be able to turn every
 * signed-in viewer into a one-second poller, and must not be able to effectively disable
 * discovery by setting an hour either. Both directions are clamped, and the clamp is tested.
 */

/** Floor: fast enough to be useful, slow enough that a typo cannot become a load test. */
export const MIN_POLL_MS = 15_000;
/** Ceiling: beyond five minutes a "live now" badge is not telling the truth any more. */
export const MAX_POLL_MS = 300_000;
/**
 * Default. Chosen against the cadences this portal already runs (1s, 2.5s, 3s, 4s, 15s, 20s,
 * 30s, 45s, 60s) — 45s sits in the slow half of an established range, so it introduces no new
 * load profile. A viewer learns a class went live within 45 seconds of the producer saying so,
 * which is well inside the time it takes to join one.
 */
export const DEFAULT_POLL_MS = 45_000;

/**
 * Clamp, with a non-numeric or absent setting falling back to the default rather than to NaN.
 * `parseInt` returns NaN for '', 'abc' and undefined, and NaN silently survives Math.min/max —
 * so the guard is explicit rather than relying on the clamp to catch it.
 */
export function resolvePollAfterMs(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed)) return DEFAULT_POLL_MS;
  return Math.min(MAX_POLL_MS, Math.max(MIN_POLL_MS, parsed));
}
