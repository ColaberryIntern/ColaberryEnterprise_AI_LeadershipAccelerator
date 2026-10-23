/**
 * When a broadcast has been dead long enough to end itself.
 *
 * RAISED BY ALI DURING TEST 2: he stopped the Zoom stream at 14:04 and the portal advertised a
 * live broadcast over dead air until an engineer ran a producer command at 14:09. With nobody
 * running scripts it would have stayed that way indefinitely. "Can we just end it once the
 * stream is done? I won't have you there every time."
 *
 * WHY THE STATE MACHINE WOULD NOT ALREADY DO THIS, AND WHY THAT RULE IS RIGHT.
 * `applyProviderEvent` is forbidden from ending a broadcast: an arbitrary webhook must not be
 * able to kill a live class, and a ten-second network blip must not end a real session
 * mid-sentence. That is what `reconnecting` exists for. The rule stays. What was missing is
 * that "ending is a producer decision" never had anything standing in for the producer when
 * the producer has gone home.
 *
 * So this is a TIMEOUT WITH HYSTERESIS, not a webhook making a decision. It is the same shape
 * as the miss threshold in broadcastHealthPolicy, one level up: that one decides when to stop
 * believing a stream is healthy, this one decides when to stop believing it is coming back.
 *
 * THE RULE THAT MATTERS MOST IS THE ONE ABOUT NOT BEING ABLE TO SEE. An `unreadable`
 * observation is OUR failure — an expired token, a provider outage, a DNS blip — and it is not
 * evidence that a class is over. Ending a live class in front of its audience because our API
 * credentials lapsed would be the worst possible failure of this feature, and it is a failure
 * that would look like the feature working. So an end requires a POSITIVE observation, right
 * now, that the stream is absent, on top of a sustained window of absence.
 */

import type { Observation, ObservedState } from './broadcastHealthPolicy';
import { resolveSeconds } from './broadcastTelemetryPolicy';

/**
 * How long the stream must be continuously gone before the broadcast ends itself.
 *
 * Five minutes, from the ticket. Long enough that a presenter restarting OBS, switching
 * scenes, or riding out a bad hotel connection comes back to a class that is still running.
 * Short enough that nobody sits in front of dead air for a whole segment.
 *
 * Bounded for the same reason the telemetry windows are: this is operator-settable, and both
 * directions hurt. Thirty seconds would end real classes during ordinary reconnects; a day
 * would mean the safety net never fires and we are back to Test 2.
 */
export const AUTO_END_BOUNDS = { min: 60, max: 3600, def: 300 } as const;

export const AUTO_END_WINDOW_ENV = 'BROADCAST_AUTO_END_WINDOW_SECONDS';

/**
 * Resolve the window from the environment, clamped, with an unparseable value treated as
 * absent rather than as a number.
 *
 * Reuses the telemetry resolver rather than repeating the NaN handling: a second copy is a
 * second place for a NaN window to slip through, and a NaN window compares false against every
 * elapsed time, which would silently disable the safety net while every test still passed.
 */
export function resolveAutoEndWindowMs(raw: Record<string, unknown> = process.env as unknown as Record<string, unknown>): number {
  return resolveSeconds(raw[AUTO_END_WINDOW_ENV], AUTO_END_BOUNDS) * 1000;
}

export interface AutoEndInput {
  /** The occurrence's editorial state this tick. */
  state: ObservedState;
  /** What the provider just told us. */
  observation: Observation;
  /** When the stream was FIRST seen absent in the current run of absences. Null if not gone. */
  goneSinceMs: number | null;
  nowMs: number;
  windowMs: number;
}

export interface AutoEndDecision {
  /** Whether to end the occurrence now. */
  end: boolean;
  /** What the caller should remember as `goneSinceMs` for the next tick. */
  goneSinceMs: number | null;
  /** How long the stream has been continuously gone, for the log and the audit row. */
  goneForMs: number;
  /** Machine-readable, so a test asserts the reason rather than only the outcome. */
  reason:
    /** The stream is arriving. Nothing to do, and the clock is cleared. */
    | 'stream_arriving'
    /** Gone, but not for long enough yet. */
    | 'within_window'
    /** Gone, continuously, for longer than the window. End it. */
    | 'gone_past_window'
    /** Not on air, so there is nothing to end. */
    | 'not_on_air'
    /** We could not ask. Never grounds for ending. */
    | 'cannot_confirm';
}

/**
 * Decide whether to auto-end.
 *
 * Pure: `goneSinceMs` is the caller's memory of when absence began, and the returned value is
 * what it should remember next. Keeping the clock outside this function is what lets the whole
 * rule be argued with in a test instead of in production.
 */
export function decideAutoEnd(input: AutoEndInput): AutoEndDecision {
  const { state, observation, goneSinceMs, nowMs, windowMs } = input;

  if (observation === 'live') {
    // Back on air. The clock is cleared, not paused: the window means CONTINUOUSLY gone, and a
    // stream that returned for even one observation has not been continuously gone.
    return { end: false, goneSinceMs: null, goneForMs: 0, reason: 'stream_arriving' };
  }

  /**
   * A backstage occurrence has never aired, so there is nothing to end, and auto-ending one
   * would quietly destroy a class that was simply set up early. `end` is also an illegal
   * transition from `backstage` in the state machine, but relying on that would mean this
   * policy proposes something nonsensical and is saved by a downstream refusal.
   */
  if (state !== 'live' && state !== 'reconnecting') {
    return { end: false, goneSinceMs: null, goneForMs: 0, reason: 'not_on_air' };
  }

  // Where the run of absence started. An unreadable observation does not START a run either:
  // we have no evidence the stream is gone, so there is nothing yet to time.
  const since = goneSinceMs ?? (observation === 'absent' ? nowMs : null);
  if (since === null) {
    return { end: false, goneSinceMs: null, goneForMs: 0, reason: 'cannot_confirm' };
  }

  const goneForMs = Math.max(0, nowMs - since);

  /**
   * Unreadable keeps the clock but can never fire the end. The run of absence is not reset,
   * because a provider we cannot reach is not evidence the stream came back either; it simply
   * cannot be the observation that ends a class.
   *
   * The consequence is deliberate: if the provider becomes permanently unreadable, the
   * broadcast never auto-ends and a human ends it. That is the correct failure direction. The
   * alternative is a credential expiry ending every live class on the platform at once.
   */
  if (observation === 'unreadable') {
    return { end: false, goneSinceMs: since, goneForMs, reason: 'cannot_confirm' };
  }

  if (goneForMs < windowMs) {
    return { end: false, goneSinceMs: since, goneForMs, reason: 'within_window' };
  }

  return { end: true, goneSinceMs: since, goneForMs, reason: 'gone_past_window' };
}
