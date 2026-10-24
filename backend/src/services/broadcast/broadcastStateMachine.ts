/**
 * broadcastStateMachine — producer commands and provider health for one occurrence.
 *
 * PURE and deterministic, like roomStateMachine.ts, so every service that mutates an
 * occurrence shares one definition and the whole thing is trivially unit-testable.
 *
 * Four guarantees live here rather than in a service, because a service can be bypassed:
 *
 *  1. GOING LIVE TAKES TWO KEYS. Request §4.1: "A producer's Go Live command and verified
 *     provider readiness are both needed. A scheduled start time or arbitrary webhook must
 *     not publish backstage content." So go_live is refused unless provider_health is
 *     'ready', and NO transition here is driven by the clock. Time cannot publish anything.
 *
 *  2. RECONNECT IS NOT A RESTART. live -> reconnecting -> live preserves occurrence
 *     identity and, critically, content_started_at — so a viewer's 15-minute preview is not
 *     silently refilled by a provider blip, and no launch campaign is re-sent.
 *
 *  3. CONCURRENCY IS OPTIMISTIC, NOT HOPEFUL. Every command carries the version it believes
 *     it is acting on. Two producers clicking Go Live resolve to one winner and one 409,
 *     never to an impossible state.
 *
 *  4. OUT-OF-ORDER PROVIDER EVENTS ARE DROPPED. Webhooks arrive late, duplicated and
 *     reordered. An event older than the last one applied is ignored rather than allowed to
 *     drag a live broadcast backwards.
 *
 * Re-asserting the current state is a no-op rather than an error, matching
 * roomStateMachine.canTransition's `from === to` rule — that is what makes a duplicate
 * Go Live click, or a redelivered webhook, harmless.
 */

export const EDITORIAL_STATES = [
  'scheduled', 'backstage', 'live', 'reconnecting', 'ended', 'processing', 'replay_ready', 'cancelled',
] as const;
export type EditorialState = (typeof EDITORIAL_STATES)[number];

export const PROVIDER_HEALTH = ['unknown', 'ready', 'degraded', 'down'] as const;
export type ProviderHealth = (typeof PROVIDER_HEALTH)[number];

const TRANSITIONS: Record<EditorialState, EditorialState[]> = {
  scheduled: ['backstage', 'live', 'cancelled'],
  backstage: ['live', 'scheduled', 'cancelled'],
  live: ['reconnecting', 'ended', 'cancelled'],
  reconnecting: ['live', 'ended', 'cancelled'],
  ended: ['processing'],
  // Processing can fail: falling back to 'ended' means "aired, no replay", which is a real
  // outcome and must not be dressed up as replay_ready.
  processing: ['replay_ready', 'ended'],
  replay_ready: [],
  cancelled: [],
};

export const TERMINAL_STATES: EditorialState[] = ['replay_ready', 'cancelled'];

export function isTerminalState(state: EditorialState): boolean {
  return TERMINAL_STATES.includes(state);
}

export function canTransition(from: EditorialState, to: EditorialState): boolean {
  if (from === to) return true; // idempotent re-assert — a duplicate command is a no-op
  return (TRANSITIONS[from] || []).includes(to);
}

export function assertTransition(from: EditorialState, to: EditorialState): void {
  if (!canTransition(from, to)) {
    throw Object.assign(new Error(`Illegal broadcast transition ${from} → ${to}`), {
      error_class: 'InvalidStateTransition',
      status: 409,
    });
  }
}

export function nextStates(from: EditorialState): EditorialState[] {
  return [...(TRANSITIONS[from] || [])];
}

/** The states in which a broadcast is on air or immediately pre-air. */
export function isOnAir(state: EditorialState): boolean {
  return state === 'live' || state === 'reconnecting';
}

export type ProducerCommand =
  | 'enter_backstage' | 'return_to_scheduled' | 'mark_content_started'
  | 'go_live' | 'end' | 'cancel'
  /**
   * The replay half of the lifecycle (L8.4).
   *
   * `ended -> processing -> replay_ready` has been in the transition table since the table
   * was written and had NO COMMAND THAT REACHES IT. Both states were legal and unreachable,
   * so every finished broadcast stopped at `ended` — which entitlement does not consider
   * watchable, so no recording could ever be played.
   *
   * These are producer commands rather than provider events on purpose: publishing a replay
   * is a publishing decision, and the rule that a provider may never publish content is the
   * same rule that keeps a webhook from putting a class on air.
   */
  | 'begin_processing' | 'publish_replay';

/**
 * Who decided a broadcast was over.
 *
 * `producer` is a person pressing End. `auto_stream_gone` is the L7.4 safety net firing after
 * the stream was CONTINUOUSLY absent past the configured window. They are recorded separately
 * because they are different events with different follow-ups: one is a class finishing, the
 * other is a class that may have been cut short by a dropped connection, and six months from
 * now nobody will be able to tell them apart from `ended_at` alone.
 *
 * Must match the CHECK constraint in ensureBroadcastEndReasonSchema.ts.
 */
export const END_REASONS = ['producer', 'auto_stream_gone'] as const;
export type EndReason = (typeof END_REASONS)[number];

export interface OccurrenceState {
  editorial_state: EditorialState;
  provider_health: ProviderHealth;
  version: number;
  content_started_at: Date | null;
  /**
   * When the broadcast finished. Needed here, not merely on the model, so the transition can
   * be idempotent about it the same way `content_started_at` is: a second `end` must not
   * rewrite the first end instant.
   */
  ended_at: Date | null;
  /**
   * WHY it ended, when it has. Lives here rather than only on the model for the same reason
   * `ended_at` does: the transition owns the idempotency, and a second `end` must not rewrite
   * the first answer.
   */
  end_reason?: EndReason | null;
}

export interface CommandContext {
  /** The version the caller believes it is acting on. Mismatch is a conflict, not a retry. */
  expectedVersion: number;
  /** Server clock. Injected so tests never depend on the wall clock. */
  nowMs: number;
  /** Whether the caller is permitted to produce this occurrence. Decided upstream. */
  isProducer: boolean;
  /**
   * Who is ending it, recorded only on an `end`. Defaults to `producer`, because every caller
   * that existed before the safety net was a person pressing a button, and a default of
   * `auto_stream_gone` would misattribute all of them.
   */
  endReason?: EndReason;
}

export interface CommandOutcome {
  ok: boolean;
  /** Fields to persist. Absent when the command was a no-op or was refused. */
  patch?: Partial<OccurrenceState>;
  /** True when the command was legal but changed nothing — a duplicate click. */
  noop?: boolean;
  error_class?: 'Forbidden' | 'VersionConflict' | 'InvalidStateTransition' | 'ProviderNotReady' | 'ContentNotStarted';
  status?: number;
  reason?: string;
}

const COMMAND_TARGET: Record<ProducerCommand, EditorialState | null> = {
  enter_backstage: 'backstage',
  return_to_scheduled: 'scheduled',
  go_live: 'live',
  end: 'ended',
  cancel: 'cancelled',
  begin_processing: 'processing',
  publish_replay: 'replay_ready',
  mark_content_started: null, // does not move state; sets the preview anchor
};

/**
 * Evaluate a producer command against the current state. Pure: returns what to persist,
 * never persists anything itself.
 */
export function applyProducerCommand(
  current: OccurrenceState,
  command: ProducerCommand,
  ctx: CommandContext,
): CommandOutcome {
  if (!ctx.isProducer) {
    return { ok: false, error_class: 'Forbidden', status: 403, reason: 'not_a_producer' };
  }
  // Version is checked BEFORE legality, so a loser in a race gets "someone else moved this"
  // rather than a confusing illegal-transition message about a state it never saw.
  if (ctx.expectedVersion !== current.version) {
    return {
      ok: false, error_class: 'VersionConflict', status: 409,
      reason: `expected version ${ctx.expectedVersion}, found ${current.version}`,
    };
  }

  if (command === 'mark_content_started') {
    if (!isOnAir(current.editorial_state) && current.editorial_state !== 'backstage') {
      return { ok: false, error_class: 'InvalidStateTransition', status: 409, reason: 'content_start_requires_backstage_or_live' };
    }
    // Idempotent: the anchor is set once. Re-marking must not refill anyone's preview.
    if (current.content_started_at) return { ok: true, noop: true };
    return { ok: true, patch: { content_started_at: new Date(ctx.nowMs), version: current.version + 1 } };
  }

  const target = COMMAND_TARGET[command] as EditorialState;

  if (command === 'go_live') {
    // Guarantee 1: two keys. Editorial intent alone does not publish.
    if (current.provider_health !== 'ready') {
      return {
        ok: false, error_class: 'ProviderNotReady', status: 409,
        reason: `provider_health is ${current.provider_health}, expected ready`,
      };
    }
    // Going live without a content anchor would leave the preview clock undefined, and the
    // first viewer would get an unbounded free window.
    if (!current.content_started_at) {
      return { ok: false, error_class: 'ContentNotStarted', status: 409, reason: 'mark_content_started_first' };
    }
  }

  if (current.editorial_state === target) return { ok: true, noop: true };

  if (!canTransition(current.editorial_state, target)) {
    return {
      ok: false, error_class: 'InvalidStateTransition', status: 409,
      reason: `${current.editorial_state} → ${target}`,
    };
  }

  const patch: Partial<OccurrenceState> = { editorial_state: target, version: current.version + 1 };

  /**
   * THE END INSTANT, RECORDED ONCE.
   *
   * `ended_at` existed on the model and in the schema from the start and NOTHING EVER WROTE
   * IT. The first production airing ended cleanly — state moved to `ended`, discovery
   * stopped returning the occurrence, the badge cleared — and left `ended_at` null, so there
   * was no end instant for any later report on duration, watch windows or replay
   * availability to work from.
   *
   * Idempotent, like `content_started_at`: a second `end` must not rewrite the first end
   * instant. `editorial_state === target` already returns a noop above, but this guard stands
   * on its own so the property survives a future path that reaches here twice.
   *
   * ONLY `ended`, DELIBERATELY NOT `cancelled`. A cancelled occurrence never aired, and
   * stamping it with a time it "ended" would assert in the data that something ran and
   * finished. Cancellation is its own state and reads as one.
   */
  if (target === 'ended' && !current.ended_at) {
    patch.ended_at = new Date(ctx.nowMs);
    // Stamped in the SAME guard as the instant, so the two can never disagree about which end
    // they describe. An occurrence with an `ended_at` and no reason is one that ended before
    // L7.4 shipped, which is exactly what a null should mean.
    patch.end_reason = ctx.endReason ?? 'producer';
  }

  return { ok: true, patch };
}

export interface ProviderEvent {
  health: ProviderHealth;
  /** Provider-side event time. Used only to reject stale deliveries. */
  occurredAtMs: number;
  /** True when the provider reports the stream has stopped. */
  streamStopped?: boolean;
}

export interface ProviderOutcome extends CommandOutcome {
  ignored?: 'stale' | 'terminal';
}

/**
 * Fold a provider health event into the occurrence.
 *
 * A provider event may change HEALTH freely, but it may only move EDITORIAL state in one
 * direction: live <-> reconnecting. It can never publish (scheduled/backstage -> live) and
 * can never end a broadcast on its own, because §4.1 forbids an arbitrary webhook doing
 * either. Ending stays a producer decision.
 */
export function applyProviderEvent(
  current: OccurrenceState,
  event: ProviderEvent,
  lastAppliedMs: number,
): ProviderOutcome {
  // Guarantee 4: late and duplicate deliveries must not drag state backwards.
  if (event.occurredAtMs <= lastAppliedMs) {
    return { ok: true, noop: true, ignored: 'stale' };
  }
  if (isTerminalState(current.editorial_state)) {
    return { ok: true, noop: true, ignored: 'terminal' };
  }

  const patch: Partial<OccurrenceState> = {};
  if (current.provider_health !== event.health) patch.provider_health = event.health;

  // Health only moves editorial state within the on-air pair.
  if (current.editorial_state === 'live' && (event.health === 'down' || event.health === 'degraded')) {
    patch.editorial_state = 'reconnecting';
  } else if (current.editorial_state === 'reconnecting' && event.health === 'ready' && !event.streamStopped) {
    patch.editorial_state = 'live';
  }

  if (Object.keys(patch).length === 0) return { ok: true, noop: true };

  // Guarantee 2: content_started_at is never in the patch. Reconnecting cannot refill a
  // viewer's preview window, and the occurrence keeps its identity across the blip.
  patch.version = current.version + 1;
  return { ok: true, patch };
}
