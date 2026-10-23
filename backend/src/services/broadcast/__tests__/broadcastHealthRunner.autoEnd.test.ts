import {
  runHealthTick, __resetHealthMemory, ObservableOccurrence,
} from '../broadcastHealthRunner';

/**
 * L7.4 — the safety net, as the loop actually runs it.
 *
 * The policy is pinned separately and purely. What these cases pin is the part a pure test
 * cannot reach: that the clock survives between ticks, that ending wins over reporting health
 * in the same tick, that it happens ONCE, and that a failure to end does not stop the loop
 * reaching the next class.
 *
 * Ali raised this during Test 2: he stopped the stream at 14:04 and the portal advertised a
 * live broadcast over dead air until an engineer ran a command at 14:09.
 */

const WINDOW = 5 * 60 * 1000;
const START = 1_000_000;

const occ = (over: Partial<ObservableOccurrence> = {}): ObservableOccurrence => ({
  id: 'occ-1', editorial_state: 'live', provider: 'cloudflare',
  provider_session_id: 'input-abc', version: 7, ...over,
});

/**
 * A harness whose clock the test advances, because the whole feature is about elapsed time.
 * `streamLive` is read at observation time so a case can bring the stream back mid-run.
 */
function harness(opts: { occurrences?: ObservableOccurrence[]; streamLive?: () => boolean | 'throw' } = {}) {
  let nowMs = START;
  const applyEvent = jest.fn().mockResolvedValue(undefined);
  const endOccurrence = jest.fn().mockResolvedValue({ ok: true });
  const logged: string[] = [];
  const streamLive = opts.streamLive ?? (() => false);

  const deps = {
    loadObservable: async () => opts.occurrences ?? [occ()],
    observe: async () => {
      const v = streamLive();
      if (v === 'throw') throw new Error('provider unreachable');
      return v;
    },
    applyEvent: (id: string, health: any, atMs: number) => applyEvent(id, health, atMs),
    endOccurrence: (o: ObservableOccurrence, atMs: number) => endOccurrence(o, atMs),
    now: () => nowMs,
    autoEndWindowMs: WINDOW,
    log: (line: string) => { logged.push(line); },
  };

  return {
    deps,
    applyEvent,
    endOccurrence,
    logged,
    advance: (ms: number) => { nowMs += ms; },
    tick: () => runHealthTick(deps),
  };
}

beforeEach(() => { __resetHealthMemory(); });

describe('a sustained stop ends the broadcast', () => {
  it('ends it once the stream has been gone past the window', async () => {
    // Acceptance criterion 3.
    const h = harness();

    await h.tick();                 // first absence: the clock starts
    h.advance(WINDOW + 1000);
    const r = await h.tick();

    expect(r.ended).toBe(1);
    expect(h.endOccurrence).toHaveBeenCalledTimes(1);
    expect(h.endOccurrence.mock.calls[0][0].id).toBe('occ-1');
  });

  it('does not report health in the same tick it ends', async () => {
    // Reporting first would bump the row's version and leave the version this tick holds
    // stale, so every auto-end would lose to its own health write with a 409. That bug would
    // look exactly like "the safety net does not work" and would only appear in production.
    const h = harness();

    await h.tick();
    h.advance(WINDOW + 1000);
    const before = h.applyEvent.mock.calls.length;
    await h.tick();

    expect(h.applyEvent.mock.calls.length).toBe(before);
  });

  it('carries the version the producer command needs', async () => {
    const h = harness({ occurrences: [occ({ version: 42 })] });

    await h.tick();
    h.advance(WINDOW + 1000);
    await h.tick();

    expect(h.endOccurrence.mock.calls[0][0].version).toBe(42);
  });

  it('is idempotent across repeated evaluation', async () => {
    // The loop runs every minute and the condition stays true until the row leaves the
    // observed set. Ending twice must not happen even if it is evaluated again.
    const h = harness();

    await h.tick();
    h.advance(WINDOW + 1000);
    await h.tick();
    h.advance(60_000);
    const second = await h.tick();

    expect(h.endOccurrence).toHaveBeenCalledTimes(1);
    expect(second.ended).toBe(0);
  });

  it('writes an audit line that says it was not a person', async () => {
    // Acceptance criterion 4. Six months from now, "why did this class end" is answered by
    // the row's end_reason; this is the operational half of the same question.
    const h = harness();

    await h.tick();
    h.advance(WINDOW + 1000);
    await h.tick();

    const line = h.logged.map((l) => JSON.parse(l)).find((l) => l.event === 'broadcast_auto_ended');
    expect(line).toBeDefined();
    expect(line.context.end_reason).toBe('auto_stream_gone');
    expect(line.context.goneForMs).toBeGreaterThanOrEqual(WINDOW);
    expect(line.context.windowMs).toBe(WINDOW);
    expect(line.context.occurrenceId).toBe('occ-1');
  });
});

describe('a brief disconnect does not', () => {
  it('leaves a class running when the gap is shorter than the window', async () => {
    // Acceptance criterion 2.
    const h = harness();

    await h.tick();
    h.advance(WINDOW - 1000);
    const r = await h.tick();

    expect(r.ended).toBe(0);
    expect(h.endOccurrence).not.toHaveBeenCalled();
  });

  it('resets the clock when the stream comes back, so two short gaps never add up', async () => {
    let live = false;
    const h = harness({ streamLive: () => live });

    await h.tick();                      // gone
    h.advance(WINDOW - 1000);
    live = true;
    await h.tick();                      // back
    live = false;
    h.advance(1000);
    await h.tick();                      // gone again, clock restarts here
    h.advance(WINDOW - 1000);
    const r = await h.tick();

    expect(r.ended).toBe(0);
    expect(h.endOccurrence).not.toHaveBeenCalled();
  });

  it('CONTROL: the same sequence DOES end once the second gap outlasts the window', async () => {
    // Without this, the test above could pass because the clock never runs at all.
    let live = false;
    const h = harness({ streamLive: () => live });

    await h.tick();
    live = true;
    await h.tick();
    live = false;
    await h.tick();
    h.advance(WINDOW + 1000);
    const r = await h.tick();

    expect(r.ended).toBe(1);
  });
});

describe('a provider we cannot reach', () => {
  it('never ends a class, however long it stays unreachable', async () => {
    // The failure that would be worst and would look like success: our credentials lapse and
    // every live class on the platform ends at once.
    let mode: boolean | 'throw' = false;
    const h = harness({ streamLive: () => mode });

    await h.tick();            // confirmed absent, clock starts
    mode = 'throw';
    h.advance(WINDOW * 4);
    const r = await h.tick();

    expect(r.ended).toBe(0);
    expect(h.endOccurrence).not.toHaveBeenCalled();
  });
});

describe('an occurrence that never aired', () => {
  it('is never auto-ended from backstage', async () => {
    const h = harness({ occurrences: [occ({ editorial_state: 'backstage' })] });

    await h.tick();
    h.advance(WINDOW * 3);
    const r = await h.tick();

    expect(r.ended).toBe(0);
    expect(h.endOccurrence).not.toHaveBeenCalled();
  });
});

describe('when ending goes wrong', () => {
  it('counts a refusal and keeps going rather than throwing', async () => {
    const h = harness();
    h.endOccurrence.mockResolvedValue({ ok: false, reason: 'expected version 7, found 9' });

    await h.tick();
    h.advance(WINDOW + 1000);
    const r = await h.tick();

    expect(r.ended).toBe(0);
    expect(r.failed).toBe(1);
    const line = h.logged.map((l) => JSON.parse(l)).find((l) => l.event === 'broadcast_auto_end_refused');
    expect(line.context.reason).toBe('expected version 7, found 9');
  });

  it('survives a thrown error and still reaches the next class', async () => {
    const h = harness({ occurrences: [occ({ id: 'occ-1' }), occ({ id: 'occ-2' })] });
    h.endOccurrence.mockImplementation(async (o: ObservableOccurrence) => {
      if (o.id === 'occ-1') throw new Error('connection terminated');
      return { ok: true };
    });

    await h.tick();
    h.advance(WINDOW + 1000);
    const r = await h.tick();

    expect(r.failed).toBe(1);
    expect(r.ended).toBe(1);
    expect(h.endOccurrence.mock.calls.map((c: any[]) => c[0].id)).toEqual(['occ-1', 'occ-2']);
  });

  it('retries on the next tick after a failure, rather than giving up on the class', async () => {
    const h = harness();
    h.endOccurrence.mockResolvedValueOnce({ ok: false, reason: 'transient' });

    await h.tick();
    h.advance(WINDOW + 1000);
    await h.tick();            // refused
    h.advance(60_000);
    const r = await h.tick();  // tries again

    expect(r.ended).toBe(1);
    expect(h.endOccurrence).toHaveBeenCalledTimes(2);
  });
});

describe('memory does not leak', () => {
  it('forgets the clock for an occurrence that is no longer observable', async () => {
    // Proven by behaviour rather than by reaching into the map: an occurrence that leaves the
    // observed set and comes back must start its window again, not inherit the old one.
    let list = [occ()];
    const h = harness({ occurrences: undefined });
    (h.deps as any).loadObservable = async () => list;

    await h.tick();                 // clock starts
    list = [];
    h.advance(WINDOW * 2);
    await h.tick();                 // occurrence gone; clock must be forgotten
    list = [occ()];
    const r = await h.tick();       // back, with a fresh clock

    expect(r.ended).toBe(0);
    expect(h.endOccurrence).not.toHaveBeenCalled();
  });
});
