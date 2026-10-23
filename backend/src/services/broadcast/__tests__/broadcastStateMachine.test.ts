/**
 * The state machine is pure, so these cover the request's P2-03 list exhaustively:
 * unauthorized transition, repeated Go Live, out-of-order webhook, host late, cancelled
 * event, reconnect, and two concurrent producer commands.
 *
 * The load-bearing ones are the four guarantees the module exists to hold: time cannot
 * publish, reconnect is not a restart, a race has exactly one winner, and a stale webhook
 * is dropped.
 */
import {
  applyProducerCommand,
  applyProviderEvent,
  canTransition,
  assertTransition,
  isOnAir,
  isTerminalState,
  nextStates,
  EDITORIAL_STATES,
  type OccurrenceState,
  type CommandContext,
} from '../broadcastStateMachine';

const NOW = Date.parse('2026-07-23T23:30:00.000Z');

const base = (over: Partial<OccurrenceState> = {}): OccurrenceState => ({
  editorial_state: 'scheduled',
  provider_health: 'unknown',
  version: 1,
  content_started_at: null,
  ended_at: null,
  ...over,
});

const ctx = (over: Partial<CommandContext> = {}): CommandContext => ({
  expectedVersion: 1, nowMs: NOW, isProducer: true, ...over,
});

describe('transition table', () => {
  it('re-asserting the same state is a no-op, not an error', () => {
    for (const s of EDITORIAL_STATES) expect(canTransition(s, s)).toBe(true);
  });

  it('terminal states go nowhere', () => {
    expect(nextStates('replay_ready')).toEqual([]);
    expect(nextStates('cancelled')).toEqual([]);
    expect(isTerminalState('replay_ready')).toBe(true);
    expect(isTerminalState('live')).toBe(false);
  });

  it('processing can fall back to ended — "aired, no replay" is a real outcome', () => {
    expect(canTransition('processing', 'ended')).toBe(true);
    expect(canTransition('processing', 'replay_ready')).toBe(true);
  });

  it('a broadcast cannot jump straight from scheduled to replay_ready', () => {
    expect(canTransition('scheduled', 'replay_ready')).toBe(false);
    expect(() => assertTransition('scheduled', 'replay_ready')).toThrow(/Illegal broadcast transition/);
  });

  it('assertTransition throws the repo-standard tagged error', () => {
    try {
      assertTransition('cancelled', 'live');
      throw new Error('should have thrown');
    } catch (e: any) {
      expect(e.error_class).toBe('InvalidStateTransition');
      expect(e.status).toBe(409);
    }
  });

  it('isOnAir covers live and reconnecting only', () => {
    expect(isOnAir('live')).toBe(true);
    expect(isOnAir('reconnecting')).toBe(true);
    expect(isOnAir('backstage')).toBe(false);
  });
});

describe('authorization and concurrency', () => {
  it('refuses a non-producer with 403', () => {
    const r = applyProducerCommand(base(), 'enter_backstage', ctx({ isProducer: false }));
    expect(r).toMatchObject({ ok: false, error_class: 'Forbidden', status: 403 });
    expect(r.patch).toBeUndefined();
  });

  it('two concurrent commands produce one winner and one 409 — never an impossible state', () => {
    const current = base();
    const first = applyProducerCommand(current, 'enter_backstage', ctx({ expectedVersion: 1 }));
    expect(first.ok).toBe(true);
    expect(first.patch).toMatchObject({ editorial_state: 'backstage', version: 2 });

    // The loser still holds version 1 while the row has moved to 2.
    const after: OccurrenceState = { ...current, ...first.patch } as OccurrenceState;
    const second = applyProducerCommand(after, 'enter_backstage', ctx({ expectedVersion: 1 }));
    expect(second).toMatchObject({ ok: false, error_class: 'VersionConflict', status: 409 });
  });

  it('reports a version conflict rather than a confusing illegal-transition error', () => {
    // The loser never saw the new state, so blaming the transition would misdirect.
    const r = applyProducerCommand(base({ editorial_state: 'live', version: 7 }), 'end', ctx({ expectedVersion: 3 }));
    expect(r.error_class).toBe('VersionConflict');
    expect(r.reason).toContain('expected version 3');
  });
});

describe('going live takes two keys', () => {
  const readyBackstage = base({ editorial_state: 'backstage', provider_health: 'ready', content_started_at: new Date(NOW) });

  it('refuses Go Live when the provider is not ready', () => {
    for (const health of ['unknown', 'degraded', 'down'] as const) {
      const r = applyProducerCommand({ ...readyBackstage, provider_health: health }, 'go_live', ctx());
      expect(r).toMatchObject({ ok: false, error_class: 'ProviderNotReady', status: 409 });
    }
  });

  it('refuses Go Live before content has been marked started', () => {
    const r = applyProducerCommand({ ...readyBackstage, content_started_at: null }, 'go_live', ctx());
    expect(r).toMatchObject({ ok: false, error_class: 'ContentNotStarted', status: 409 });
  });

  it('allows Go Live when BOTH the producer command and provider readiness are present', () => {
    const r = applyProducerCommand(readyBackstage, 'go_live', ctx());
    expect(r.ok).toBe(true);
    expect(r.patch).toMatchObject({ editorial_state: 'live', version: 2 });
  });

  it('a repeated Go Live is a no-op, not a second transition', () => {
    const live = base({ editorial_state: 'live', provider_health: 'ready', content_started_at: new Date(NOW) });
    const r = applyProducerCommand(live, 'go_live', ctx());
    expect(r).toMatchObject({ ok: true, noop: true });
    expect(r.patch).toBeUndefined(); // no version bump, so no spurious conflict for anyone else
  });

  it('NOTHING here is driven by the clock — a passed scheduled time cannot publish', () => {
    // The only clock input is nowMs, and it is used solely to stamp content_started_at.
    // A scheduled occurrence stays scheduled no matter how late it gets.
    const stale = base({ editorial_state: 'scheduled', provider_health: 'ready' });
    const farFuture = ctx({ nowMs: Date.parse('2099-01-01T00:00:00Z') });
    const r = applyProducerCommand(stale, 'go_live', farFuture);
    // Refused for a missing content anchor — not silently published by elapsed time.
    expect(r.ok).toBe(false);
    expect(r.error_class).toBe('ContentNotStarted');
  });
});

describe('content start anchors the preview once', () => {
  it('sets the anchor from the server clock', () => {
    const r = applyProducerCommand(base({ editorial_state: 'backstage' }), 'mark_content_started', ctx());
    expect((r.patch!.content_started_at as Date).toISOString()).toBe('2026-07-23T23:30:00.000Z');
  });

  it('re-marking is a no-op — a producer cannot refill everyone\'s preview', () => {
    const started = base({ editorial_state: 'live', content_started_at: new Date(NOW) });
    const later = applyProducerCommand(started, 'mark_content_started', ctx({ nowMs: NOW + 600_000 }));
    expect(later).toMatchObject({ ok: true, noop: true });
    expect(later.patch).toBeUndefined();
  });

  it('cannot mark content started on a scheduled occurrence', () => {
    const r = applyProducerCommand(base({ editorial_state: 'scheduled' }), 'mark_content_started', ctx());
    expect(r).toMatchObject({ ok: false, error_class: 'InvalidStateTransition' });
  });
});

describe('cancelled and late-host paths', () => {
  it('a cancelled occurrence refuses every forward command', () => {
    const cancelled = base({ editorial_state: 'cancelled', provider_health: 'ready', content_started_at: new Date(NOW) });
    for (const cmd of ['enter_backstage', 'go_live', 'end'] as const) {
      expect(applyProducerCommand(cancelled, cmd, ctx()).ok).toBe(false);
    }
  });

  it('a host arriving late just moves scheduled -> backstage -> live, no special case', () => {
    let s = base();
    const a = applyProducerCommand(s, 'enter_backstage', ctx({ expectedVersion: 1 }));
    s = { ...s, ...a.patch } as OccurrenceState;
    const b = applyProducerCommand(s, 'mark_content_started', ctx({ expectedVersion: 2 }));
    s = { ...s, ...b.patch, provider_health: 'ready' } as OccurrenceState;
    const c = applyProducerCommand(s, 'go_live', ctx({ expectedVersion: 3 }));
    expect(c.patch).toMatchObject({ editorial_state: 'live' });
  });

  it('a producer can back out of backstage to scheduled', () => {
    const r = applyProducerCommand(base({ editorial_state: 'backstage' }), 'return_to_scheduled', ctx());
    expect(r.patch).toMatchObject({ editorial_state: 'scheduled' });
  });
});

describe('provider events', () => {
  const live = base({ editorial_state: 'live', provider_health: 'ready', content_started_at: new Date(NOW), version: 5 });

  it('drops an out-of-order delivery instead of dragging state backwards', () => {
    const r = applyProviderEvent(live, { health: 'down', occurredAtMs: NOW - 1000 }, NOW);
    expect(r).toMatchObject({ ok: true, noop: true, ignored: 'stale' });
    expect(r.patch).toBeUndefined();
  });

  it('drops a duplicate delivery at exactly the same timestamp', () => {
    const r = applyProviderEvent(live, { health: 'down', occurredAtMs: NOW }, NOW);
    expect(r.ignored).toBe('stale');
  });

  it('moves live -> reconnecting when the feed degrades', () => {
    const r = applyProviderEvent(live, { health: 'down', occurredAtMs: NOW + 1000 }, NOW);
    expect(r.patch).toMatchObject({ editorial_state: 'reconnecting', provider_health: 'down', version: 6 });
  });

  it('RECONNECT IS NOT A RESTART — content_started_at is never touched', () => {
    const down = applyProviderEvent(live, { health: 'down', occurredAtMs: NOW + 1000 }, NOW);
    expect(down.patch).not.toHaveProperty('content_started_at');

    const reconnecting = { ...live, ...down.patch } as OccurrenceState;
    const up = applyProviderEvent(reconnecting, { health: 'ready', occurredAtMs: NOW + 5000 }, NOW + 1000);
    expect(up.patch).toMatchObject({ editorial_state: 'live' });
    // The preview deadline survives the blip: no viewer gets a fresh 15 minutes.
    expect(up.patch).not.toHaveProperty('content_started_at');
  });

  it('a provider event can NEVER publish a backstage occurrence', () => {
    // §4.1: an arbitrary webhook must not publish backstage content.
    const backstage = base({ editorial_state: 'backstage', provider_health: 'unknown' });
    const r = applyProviderEvent(backstage, { health: 'ready', occurredAtMs: NOW + 1000 }, NOW);
    expect(r.patch?.editorial_state).toBeUndefined();
    expect(r.patch).toMatchObject({ provider_health: 'ready' }); // health only
  });

  it('a provider event can NEVER end a broadcast on its own', () => {
    const r = applyProviderEvent(live, { health: 'down', occurredAtMs: NOW + 1000, streamStopped: true }, NOW);
    expect(r.patch?.editorial_state).toBe('reconnecting');
    expect(r.patch?.editorial_state).not.toBe('ended');
  });

  it('ignores events once the occurrence is terminal', () => {
    const done = base({ editorial_state: 'replay_ready' });
    expect(applyProviderEvent(done, { health: 'down', occurredAtMs: NOW + 1000 }, NOW).ignored).toBe('terminal');
  });

  it('a health event that changes nothing does not bump the version', () => {
    const r = applyProviderEvent(live, { health: 'ready', occurredAtMs: NOW + 1000 }, NOW);
    expect(r).toMatchObject({ ok: true, noop: true });
    expect(r.patch).toBeUndefined();
  });
});

/**
 * `ended_at` existed on the model and in the schema from the start, and NOTHING EVER WROTE
 * IT. The first production airing (15 Oct 2026) ended cleanly - state moved to `ended`,
 * discovery stopped returning the occurrence, the badge cleared - and left `ended_at` null.
 * Any later report on broadcast duration, watch windows or replay availability would have had
 * no end instant to work from.
 */
describe('the end instant', () => {
  const live = () => base({ editorial_state: 'live', provider_health: 'ready', content_started_at: new Date(NOW) });

  it('ending a live broadcast stamps ended_at from the injected clock', () => {
    const r = applyProducerCommand(live(), 'end', ctx({ nowMs: NOW + 90_000 }));
    expect(r.ok).toBe(true);
    expect(r.patch!.editorial_state).toBe('ended');
    expect((r.patch!.ended_at as Date).toISOString()).toBe('2026-07-23T23:31:30.000Z');
  });

  it('does NOT rewrite an end instant that is already set', () => {
    const already = new Date(NOW - 60_000);
    const r = applyProducerCommand(base({
      editorial_state: 'live', provider_health: 'ready', content_started_at: new Date(NOW), ended_at: already,
    }), 'end', ctx({ nowMs: NOW }));
    expect(r.ok).toBe(true);
    // Present in the patch would mean the second end overwrote the first, losing when the
    // broadcast actually finished.
    expect(r.patch).not.toHaveProperty('ended_at');
  });

  it('CANCELLING does not stamp an end instant - it never aired', () => {
    // Recording a time it "ended" would assert in the data that something ran and finished.
    const r = applyProducerCommand(base({ editorial_state: 'scheduled' }), 'cancel', ctx());
    expect(r.ok).toBe(true);
    expect(r.patch!.editorial_state).toBe('cancelled');
    expect(r.patch).not.toHaveProperty('ended_at');
  });

  it('going live does not stamp an end instant', () => {
    const r = applyProducerCommand(base({
      editorial_state: 'backstage', provider_health: 'ready', content_started_at: new Date(NOW),
    }), 'go_live', ctx());
    expect(r.ok).toBe(true);
    expect(r.patch).not.toHaveProperty('ended_at');
  });
});

/**
 * L7.4 - WHY it ended, not just when.
 *
 * Once a broadcast can end itself after a sustained stream loss, an occurrence that ended at
 * 14:09 looks identical whether Ali pressed End or whether the hotel wifi dropped. The ticket
 * is explicit: six months from now, "why did this class end" must be answerable.
 */
describe('the end reason', () => {
  const live = () => base({ editorial_state: 'live', provider_health: 'ready', content_started_at: new Date(NOW) });

  it('records a person pressing End as producer, without being told', () => {
    // Every caller that existed before the safety net was a person. A default of
    // auto_stream_gone would misattribute all of them.
    const r = applyProducerCommand(live(), 'end', ctx());
    expect(r.patch!.end_reason).toBe('producer');
  });

  it('records the safety net as auto_stream_gone when it says so', () => {
    const r = applyProducerCommand(live(), 'end', ctx({ endReason: 'auto_stream_gone' }));
    expect(r.patch!.end_reason).toBe('auto_stream_gone');
  });

  it('is stamped in the same guard as the instant, so the two cannot disagree', () => {
    const already = new Date(NOW - 60_000);
    const r = applyProducerCommand(base({
      editorial_state: 'live', provider_health: 'ready', content_started_at: new Date(NOW), ended_at: already,
    }), 'end', ctx({ endReason: 'auto_stream_gone' }));
    // A second end must not rewrite the reason any more than it rewrites the time, or an
    // auto-end arriving a second after a producer's would steal the credit.
    expect(r.patch).not.toHaveProperty('end_reason');
    expect(r.patch).not.toHaveProperty('ended_at');
  });

  it('CANCELLING records no reason, because it never ended', () => {
    const r = applyProducerCommand(base({ editorial_state: 'scheduled' }), 'cancel', ctx());
    expect(r.patch).not.toHaveProperty('end_reason');
  });
});
