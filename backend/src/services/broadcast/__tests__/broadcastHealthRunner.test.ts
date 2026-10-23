import {
  runHealthTick, __resetHealthMemory, OBSERVED_STATES, ObservableOccurrence,
} from '../broadcastHealthRunner';

/**
 * One tick of the health loop.
 *
 * The runner owns no state rules — `applyProviderEvent` already decides what health may do to
 * editorial state. What these tests pin is the runner's own contract: what it observes, what
 * it declines to observe, what it carries between ticks, and that nothing it meets can stop it
 * reaching the next class.
 */

const occ = (over: Partial<ObservableOccurrence> = {}): ObservableOccurrence => ({
  id: 'occ-1', editorial_state: 'live', provider: 'cloudflare',
  provider_session_id: 'input-abc', version: 1, ...over,
});

function harness(opts: {
  occurrences?: ObservableOccurrence[];
  observe?: (o: ObservableOccurrence) => Promise<boolean>;
  applyEvent?: jest.Mock;
  threshold?: number;
} = {}) {
  const applyEvent = opts.applyEvent ?? jest.fn().mockResolvedValue(undefined);
  // Injected and never satisfied here: these cases are about health reporting, and an
  // auto-end reaching the real producer command would make them depend on a database.
  const endOccurrence = jest.fn().mockResolvedValue({ ok: true });
  const deps = {
    loadObservable: async () => opts.occurrences ?? [occ()],
    observe: opts.observe ?? (async () => true),
    applyEvent: (id: string, health: any, atMs: number) => applyEvent(id, health, atMs),
    endOccurrence,
    now: () => 1_000_000,
    threshold: opts.threshold,
    autoEndWindowMs: 5 * 60 * 1000,
    log: () => undefined,
  };
  return { deps, applyEvent, endOccurrence };
}

beforeEach(() => { __resetHealthMemory(); });

describe('what gets observed', () => {
  it('only states that can still be on air', () => {
    // A terminal occurrence must never be polled: it cannot change, and polling it would be a
    // provider call per minute, forever, per ended class.
    expect([...OBSERVED_STATES].sort()).toEqual(['backstage', 'live', 'reconnecting']);
  });

  it('skips an occurrence with no provider binding instead of calling it down', async () => {
    // That is L5.4's gap, not a health fault. Reporting down would move a perfectly fine
    // occurrence to reconnecting because of a missing field.
    const { deps, applyEvent } = harness({ occurrences: [occ({ provider_session_id: null })] });
    const r = await runHealthTick(deps);
    expect(r.skipped).toBe(1);
    expect(r.observed).toBe(0);
    expect(applyEvent).not.toHaveBeenCalled();
  });

  it('reports ready for an arriving stream', async () => {
    const { deps, applyEvent } = harness();
    const r = await runHealthTick(deps);
    expect(r.reported).toBe(1);
    expect(applyEvent).toHaveBeenCalledWith('occ-1', 'ready', 1_000_000);
  });
});

describe('a blip does not move anything', () => {
  it('holds on the first missing observation and acts on the second', async () => {
    const { deps, applyEvent } = harness({ observe: async () => false });

    const first = await runHealthTick(deps);
    expect(first.held).toBe(1);
    expect(applyEvent).not.toHaveBeenCalled();

    const second = await runHealthTick(deps);
    expect(second.reported).toBe(1);
    expect(applyEvent).toHaveBeenCalledWith('occ-1', 'down', 1_000_000);
  });

  it('a recovery between ticks resets the patience', async () => {
    let arriving = false;
    const { deps, applyEvent } = harness({ observe: async () => arriving });

    await runHealthTick(deps);          // miss 1, held
    arriving = true;
    await runHealthTick(deps);          // ready, misses reset
    arriving = false;
    const third = await runHealthTick(deps); // miss 1 again, must HOLD not report

    expect(third.held).toBe(1);
    expect(applyEvent).toHaveBeenCalledTimes(1);
    expect(applyEvent).toHaveBeenCalledWith('occ-1', 'ready', 1_000_000);
  });

  it('a provider that throws is unreadable, never "the stream stopped"', async () => {
    const { deps, applyEvent } = harness({
      observe: async () => { throw new Error('cloudflare 503'); },
    });
    await runHealthTick(deps);
    await runHealthTick(deps);
    expect(applyEvent).toHaveBeenCalledWith('occ-1', 'degraded', 1_000_000);
  });
});

describe('nothing stops the loop reaching the next class', () => {
  it('one occurrence failing to record does not skip the others', async () => {
    const applyEvent = jest.fn()
      .mockRejectedValueOnce(new Error('version conflict'))
      .mockResolvedValue(undefined);
    const { deps } = harness({
      occurrences: [occ({ id: 'occ-1' }), occ({ id: 'occ-2' })],
      applyEvent,
    });

    const r = await runHealthTick(deps);

    expect(r.failed).toBe(1);
    expect(r.reported).toBe(1);
    expect(applyEvent).toHaveBeenCalledTimes(2);
  });

  it('a failure to load anything returns rather than throwing', async () => {
    const r = await runHealthTick({
      loadObservable: async () => { throw new Error('db down'); },
      observe: async () => true,
      log: () => undefined,
    });
    expect(r.failed).toBe(1);
    expect(r.observed).toBe(0);
  });
});

describe('the miss memory is bounded', () => {
  it('forgets an occurrence once it is no longer on air', async () => {
    let list = [occ({ id: 'gone-soon' })];
    const applyEvent = jest.fn().mockResolvedValue(undefined);
    const deps = {
      loadObservable: async () => list,
      observe: async () => false,
      applyEvent: (id: string, h: any, t: number) => applyEvent(id, h, t),
      now: () => 1_000_000,
      log: () => undefined,
    };

    await runHealthTick(deps);     // miss 1 for gone-soon
    list = [];                      // it ended
    await runHealthTick(deps);      // its counter should be dropped
    list = [occ({ id: 'gone-soon' })];
    const third = await runHealthTick(deps);

    // If the counter had survived, this tick would be miss 2 and would report down.
    expect(third.held).toBe(1);
    expect(applyEvent).not.toHaveBeenCalled();
  });
});
