/**
 * What to report about a stream, given what the provider just said.
 *
 * Pure, so the rule can be argued with in a test rather than in production. The runner does
 * the I/O; nothing here touches a network or a database. Same split as the backfill
 * planner/runner, for the same reason: the decision can be reviewed before anything acts on it.
 *
 * WHY THIS EXISTS. `runProviderEvent` has been exported, tested and called by NOTHING, so
 * `provider_health` is permanently `unknown` in production. That single gap means `go_live` is
 * always refused with ProviderNotReady (it was hand-fed during Test 2), a dropped stream is
 * never marked `reconnecting`, and nothing can auto-end. This is the missing observer.
 *
 * THE RULE THAT MATTERS MOST IS WHEN TO SAY NOTHING. A single failed observation is not
 * evidence a class has stopped, and reporting one would move a live occurrence to
 * `reconnecting` in front of its audience. So a non-ready observation is held until it repeats.
 */
import type { ProviderHealth } from './broadcastStateMachine';

/** What the provider told us this tick. */
export type Observation =
  /** The provider answered, and the stream is arriving. */
  | 'live'
  /** The provider answered, and nothing is arriving. */
  | 'absent'
  /** We could not ask. An API error is OUR problem, not evidence the stream died. */
  | 'unreadable';

/** Only states worth polling. A terminal occurrence is never observed. */
export type ObservedState = 'backstage' | 'live' | 'reconnecting';

export interface HealthDecision {
  /** null means SAY NOTHING this tick — the honest answer when one observation proves little. */
  report: ProviderHealth | null;
  /** Consecutive non-live observations, to carry into the next tick. */
  misses: number;
  /** Machine-readable, for the log line and for tests to assert on. */
  reason:
    | 'stream_arriving'
    | 'not_started_yet'
    | 'holding_for_confirmation'
    | 'stream_gone'
    | 'provider_unreadable';
}

/**
 * How many consecutive non-live observations before acting.
 *
 * Two, not one: at a one-minute cadence a single missed observation covers a blip far shorter
 * than anything a viewer would notice, and `reconnecting` is a state the audience can see.
 */
export const DEFAULT_MISS_THRESHOLD = 2;

/**
 * Decide what to report.
 *
 * `misses` is the count BEFORE this observation; the returned `misses` is what the caller
 * should remember. The caller owns that memory, so this stays pure.
 */
export function decideHealth(
  observation: Observation,
  state: ObservedState,
  misses: number,
  threshold: number = DEFAULT_MISS_THRESHOLD,
): HealthDecision {
  if (observation === 'live') {
    return { report: 'ready', misses: 0, reason: 'stream_arriving' };
  }

  const next = misses + 1;

  // A backstage occurrence with no stream is not broken, it is EARLY. Reporting down here
  // would fill the log with faults for every class that is set up before its presenter opens
  // Zoom, and would teach everyone to ignore the signal that matters.
  if (state === 'backstage') {
    return { report: null, misses: next, reason: 'not_started_yet' };
  }

  if (next < threshold) {
    return { report: null, misses: next, reason: 'holding_for_confirmation' };
  }

  // Deliberately different values for two different facts. Both move a live occurrence to
  // reconnecting, so the operational effect is the same — but "the stream is gone" and "we
  // cannot see the provider" are not the same thing, and the next person reading the row
  // deserves to know which one happened.
  return observation === 'absent'
    ? { report: 'down', misses: next, reason: 'stream_gone' }
    : { report: 'degraded', misses: next, reason: 'provider_unreadable' };
}
