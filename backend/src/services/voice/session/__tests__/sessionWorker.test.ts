import { EventEmitter } from 'events';
import { installSigtermDrain, SessionWorker, type WorkerDeps } from '../sessionWorker';
import type { SessionSnapshot } from '../stateMachine';

function setup(cfg = { maxSessions: 5, maxPerAgent: 2, tickMs: 250, queueMax: 3 }, over: Partial<WorkerDeps> = {}) {
  let now = 0;
  const logs: Record<string, unknown>[] = [];
  const tools: Array<Record<string, unknown>> = [];
  const reconciled: SessionSnapshot[] = [];
  const deps: WorkerDeps = {
    now: () => now, log: (l) => logs.push(l), reconcile: async (s) => { reconciled.push(s); },
    recordTool: (callId, rec) => tools.push({ callId, ...rec }), ...over,
  };
  const w = new SessionWorker(deps, cfg);
  return { w, logs, tools, reconciled, advance: (ms: number) => { now += ms; } };
}
const openOk = (w: SessionWorker, id: string, agent = 'agent-a') => {
  const r = w.open(id, agent);
  if (!r.ok) throw new Error(`open refused: ${r.reason}`);
  return r.handle;
};
const toSpeaking = (h: ReturnType<typeof openOk>) => {
  h.dispatch({ type: 'connected' }); h.dispatch({ type: 'greeting_done' }); h.dispatch({ type: 'caller_turn' });
  h.dispatch({ type: 'generation_started', generationId: h.snapshot().generationId + 1 });
};

afterEach(() => jest.useRealTimers());

describe('session worker: lifecycle and leaks (VS2.2)', () => {
  it('no leaked sessions, timers, queues or orphans after 1,000 connect/disconnect cycles', () => {
    const { w } = setup({ maxSessions: 5, maxPerAgent: 5, tickMs: 250, queueMax: 3 });
    for (let i = 0; i < 1000; i++) {
      const h = openOk(w, `c-${i}`);
      if (i % 3 === 0) toSpeaking(h);
      if (i % 5 === 0) h.toolStarted(`t-${i}`, 'next_open_slots');
      h.enqueue({ i });
      if (i % 2 === 0) h.close('caller_hung_up');
      else h.dispatch({ type: 'closed' });
    }
    expect(w.size).toBe(0);
    expect(w.hasTimer).toBe(false);
    expect(w.orphanCount).toBeLessThanOrEqual(500); // bounded even with 200 tools left running
  });

  it('closing aborts the generation signal and empties the queue; a closed handle is inert', () => {
    const { w } = setup();
    const h = openOk(w, 'c1');
    toSpeaking(h);
    const sig = h.generationSignal();
    h.enqueue('hello');
    h.close('done');
    expect(sig.aborted).toBe(true);
    expect(h.takeQueued()).toEqual([]);
    expect(h.snapshot().state).toBe('closed');
    expect(h.enqueue('late')).toBe(false);
    expect(h.accepts(1, 1)).toBe(false);
    expect(h.generationSignal().aborted).toBe(true);
  });
});

describe('session worker: concurrency (VS2.2)', () => {
  it('refuses a duplicate call id, a third session for one agent, and anything over capacity', () => {
    const { w, logs } = setup({ maxSessions: 3, maxPerAgent: 2, tickMs: 250, queueMax: 3 });
    openOk(w, 'a1', 'A'); openOk(w, 'a2', 'A');
    expect(w.open('a1', 'B')).toEqual({ ok: false, reason: 'duplicate' });
    expect(w.open('a3', 'A')).toEqual({ ok: false, reason: 'agent_concurrency' });
    openOk(w, 'b1', 'B');
    expect(w.open('b2', 'B')).toEqual({ ok: false, reason: 'capacity' });
    expect(logs.filter((l) => l.error_class === 'SessionRefused')).toHaveLength(3);
  });

  it('the bounded queue pushes back instead of dropping silently', () => {
    const { w } = setup();
    const h = openOk(w, 'c1');
    expect([h.enqueue(1), h.enqueue(2), h.enqueue(3), h.enqueue(4)]).toEqual([true, true, true, false]);
    expect(h.takeQueued()).toEqual([1, 2, 3]);
    expect(h.enqueue(5)).toBe(true);
  });
});

describe('session worker: interruption, late results, tools (VS2.2)', () => {
  it('an interrupt aborts the in-flight generation and discards its queued speech', () => {
    const { w } = setup();
    const h = openOk(w, 'c1');
    toSpeaking(h);
    const sig = h.generationSignal();
    h.enqueue('half a sentence');
    h.dispatch({ type: 'interrupt' });
    expect(sig.aborted).toBe(true);
    expect(h.takeQueued()).toEqual([]);
    expect(h.generationSignal().aborted).toBe(false); // the next generation gets a fresh token
  });

  it('a late model result for the previous turn is refused', () => {
    const { w } = setup();
    const h = openOk(w, 'c1');
    toSpeaking(h);
    const { turnId, generationId } = h.snapshot();
    h.dispatch({ type: 'caller_turn' });
    expect(h.accepts(turnId, generationId)).toBe(false);
    expect(h.dispatch({ type: 'generation_done', generationId })).toMatchObject({ ok: false });
  });

  it('double interrupt: two cancels, no stale generation accepted, call returns to listening', () => {
    const { w } = setup();
    const h = openOk(w, 'c1');
    toSpeaking(h);
    const g1 = h.snapshot().generationId;
    h.dispatch({ type: 'interrupt' });
    const s2 = h.generationSignal();
    h.dispatch({ type: 'interrupt' });
    expect(s2.aborted).toBe(true);
    expect(h.accepts(h.snapshot().turnId, g1)).toBe(false);
    h.dispatch({ type: 'interrupt_handled' });
    expect(h.snapshot().state).toBe('listening');
  });

  it('disconnect mid-tool: the committed result is still recorded, once, marked afterClose', () => {
    const { w, tools } = setup();
    const h = openOk(w, 'c1');
    toSpeaking(h);
    h.toolStarted('tool-9', 'book_strategy_slot');
    h.dispatch({ type: 'closed' }); // caller hung up while the tool ran
    expect(w.size).toBe(0);
    h.toolFinished('tool-9', true);
    h.toolFinished('tool-9', true); // duplicate completion: ignored
    expect(tools).toEqual([{ callId: 'c1', toolCallId: 'tool-9', name: 'book_strategy_slot', turnId: 1, committed: true, afterClose: true }]);
  });

  it('a tool finishing on a live call is recorded with afterClose false', () => {
    const { w, tools } = setup();
    const h = openOk(w, 'c1');
    toSpeaking(h);
    h.toolStarted('t1', 'next_open_slots');
    h.toolFinished('t1', false);
    expect(tools).toEqual([expect.objectContaining({ toolCallId: 't1', committed: false, afterClose: false })]);
    expect(h.snapshot().toolRecords).toHaveLength(1);
  });

  it('a rejected transition is logged with its reason and not applied', () => {
    const { w, logs } = setup();
    const h = openOk(w, 'c1');
    expect(h.dispatch({ type: 'generation_done', generationId: 0 })).toMatchObject({ ok: false, reason: 'not_allowed' });
    expect(h.snapshot().state).toBe('connecting');
    expect(logs).toContainEqual(expect.objectContaining({ error_class: 'InvalidTransition', from: 'connecting', on: 'generation_done' }));
  });
});

describe('session worker: timeouts (VS2.2)', () => {
  it('a slow model times thinking back to listening; max call duration ends the call; ending closes', () => {
    const { w, advance } = setup();
    const h = openOk(w, 'c1');
    h.dispatch({ type: 'connected' }); h.dispatch({ type: 'greeting_done' }); h.dispatch({ type: 'caller_turn' });
    const sig = h.generationSignal();
    advance(12_000); w.tick();
    expect(h.snapshot().state).toBe('listening');
    expect(sig.aborted).toBe(true);
    for (let i = 0; i < 6; i++) { h.dispatch({ type: 'caller_turn' }); advance(28_000); w.tick(); }
    expect(h.snapshot().state).toBe('ending');
    expect(h.snapshot().endReason).toBe('max_call_duration');
    advance(5_000); w.tick();
    expect(w.size).toBe(0);
  });
});

describe('session worker: graceful drain (VS2.2)', () => {
  it('refuses new sessions, resolves when live ones finish before the deadline', async () => {
    const { w, reconciled } = setup();
    const h = openOk(w, 'c1');
    const p = w.drain(10_000);
    expect(w.open('c2', 'A')).toEqual({ ok: false, reason: 'draining' });
    h.close('done');
    await expect(p).resolves.toEqual({ drained: 1, forced: 0 });
    expect(reconciled).toHaveLength(0);
  });

  it('force-closes what is left at the deadline and hands each to reconcile; a reconcile error is logged', async () => {
    jest.useFakeTimers();
    let n = 0;
    const { w, logs } = setup(undefined, { reconcile: async () => { n++; if (n === 2) throw Object.assign(new Error('x'), { name: 'TwilioRequestError' }); } });
    openOk(w, 'c1', 'A'); openOk(w, 'c2', 'B');
    const p = w.drain(5_000);
    jest.advanceTimersByTime(5_000);
    const r = await p;
    expect(r).toEqual({ drained: 0, forced: 2 });
    expect(n).toBe(2);
    expect(w.size).toBe(0);
    expect(logs).toContainEqual(expect.objectContaining({ event: 'voice_drain_reconcile_failed', error_class: 'TwilioRequestError' }));
  });

  it('SIGTERM starts the drain once; a second SIGTERM reuses it', async () => {
    const { w } = setup();
    const proc = new EventEmitter();
    const uninstall = installSigtermDrain(w, proc, 1_000);
    openOk(w, 'c1');
    proc.emit('SIGTERM');
    const first = w.drain(1_000);
    proc.emit('SIGTERM');
    expect(w.drain(1_000)).toBe(first);
    expect(w.draining).toBe(true);
    w.open('x', 'y'); // refused while draining
    uninstall();
    expect(proc.listenerCount('SIGTERM')).toBe(0);
  });

  it('draining an idle worker resolves immediately', async () => {
    const { w } = setup();
    await expect(w.drain(1_000)).resolves.toEqual({ drained: 0, forced: 0 });
  });
});
