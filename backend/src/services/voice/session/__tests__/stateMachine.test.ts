import {
  acceptsGeneration, addResponseChars, dueTimeout, newSession, SESSION_EVENTS, SESSION_STATES, STATE_TIMEOUT_MS, toolFinished, toolStarted,
  transition, TRANSITIONS, type SessionEvent, type SessionEventType, type SessionSnapshot, type SessionState,
} from '../stateMachine';

const T0 = 1_000;
const inState = (state: SessionState, extra: Partial<SessionSnapshot> = {}): SessionSnapshot => ({ ...newSession('call-1', T0), state, ...extra });
function eventFor(type: SessionEventType, s: SessionSnapshot): SessionEvent {
  if (type === 'generation_started') return { type, generationId: s.generationId + 1 };
  if (type === 'generation_done') return { type, generationId: s.generationId };
  if (type === 'end') return { type, reason: 'test' };
  return { type } as SessionEvent;
}
/** Walk the machine through real events to the given (live) state. */
function drive(...evs: SessionEvent[]): SessionSnapshot {
  let s = newSession('call-1', T0);
  for (const ev of evs) {
    const r = transition(s, ev, T0 + 1);
    if (!r.ok) throw new Error(`setup failed at ${ev.type}: ${r.reason}`);
    s = r.session;
  }
  return s;
}
const toSpeaking = () => drive({ type: 'connected' }, { type: 'greeting_done' }, { type: 'caller_turn' }, { type: 'generation_started', generationId: 1 });

describe('session state machine: the transition table (VS2.2)', () => {
  const pairs = SESSION_STATES.flatMap((st) => SESSION_EVENTS.map((ev) => [st, ev] as const));

  it(`covers all ${SESSION_STATES.length * SESSION_EVENTS.length} state x event pairs`, () => {
    expect(pairs).toHaveLength(SESSION_STATES.length * SESSION_EVENTS.length);
  });

  it.each(pairs)('%s + %s: allowed exactly when the table says so, landing on the table target', (st, ev) => {
    const s = inState(st);
    const r = transition(s, eventFor(ev, s), T0 + 5);
    const target = TRANSITIONS[st][ev];
    if (target) {
      expect(r.ok).toBe(true);
      expect(r.session.state).toBe(target);
    } else {
      expect(r).toEqual({ ok: false, reason: 'not_allowed', session: s });
    }
  });

  it('closed accepts nothing; end and closed are allowed from every live state', () => {
    expect(Object.keys(TRANSITIONS.closed)).toEqual([]);
    for (const st of SESSION_STATES.filter((x) => x !== 'closed')) expect(TRANSITIONS[st].closed).toBe('closed');
    for (const st of SESSION_STATES.filter((x) => x !== 'closed' && x !== 'ending')) expect(TRANSITIONS[st].end).toBe('ending');
  });

  it('never mutates its input', () => {
    const s = inState('listening');
    const frozen = JSON.stringify({ ...s, pendingTools: [...s.pendingTools] });
    transition(s, { type: 'caller_turn' }, T0 + 9);
    expect(JSON.stringify({ ...s, pendingTools: [...s.pendingTools] })).toBe(frozen);
  });
});

describe('session state machine: late results and interrupts (VS2.2)', () => {
  it('a late result from an earlier turn can never speak into the newer turn', () => {
    const speaking = toSpeaking(); // turn 1, generation 1
    expect(acceptsGeneration(speaking, 1, 1)).toBe(true);
    const r = transition(speaking, { type: 'caller_turn' }, T0 + 50); // the caller talks over it
    expect(r.ok && r.cancelGeneration).toBe(true);
    expect(r.session.turnId).toBe(2);
    expect(acceptsGeneration(r.session, 1, 1)).toBe(false);
    expect(transition(r.session, { type: 'generation_done', generationId: 1 }, T0 + 60)).toMatchObject({ ok: false });
  });

  it('a stale generation_started (an id that is not next) is rejected as stale', () => {
    const thinking = drive({ type: 'connected' }, { type: 'greeting_done' }, { type: 'caller_turn' });
    expect(transition(thinking, { type: 'generation_started', generationId: 7 }, T0)).toMatchObject({ ok: false, reason: 'stale_generation' });
  });

  it('double interrupt: each one cancels, every earlier generation stays dead, and the call recovers', () => {
    const a = transition(toSpeaking(), { type: 'interrupt' }, T0 + 10);
    const b = transition(a.session, { type: 'interrupt' }, T0 + 11);
    expect(a.ok && a.cancelGeneration && b.ok && b.cancelGeneration).toBe(true);
    expect(b.session.state).toBe('interrupted');
    for (const g of [1, 2]) expect(acceptsGeneration(b.session, b.session.turnId, g)).toBe(false);
    const back = transition(b.session, { type: 'interrupt_handled' }, T0 + 12);
    expect(back.session.state).toBe('listening');
    const next = transition(transition(back.session, { type: 'caller_turn' }, T0 + 13).session, { type: 'generation_started', generationId: b.session.generationId + 1 }, T0 + 14);
    expect(next.ok).toBe(true);
    expect(acceptsGeneration(next.session, next.session.turnId, next.session.generationId)).toBe(true);
  });

  it('nothing is accepted on an ending or closed call', () => {
    const s = toSpeaking();
    const ending = transition(s, { type: 'end', reason: 'caller_hung_up' }, T0 + 1).session;
    expect(acceptsGeneration(ending, s.turnId, s.generationId)).toBe(false);
    const closed = transition(ending, { type: 'closed' }, T0 + 2).session;
    expect(closed.endReason).toBe('caller_hung_up');
    expect(acceptsGeneration(closed, s.turnId, s.generationId)).toBe(false);
  });

  it('response length: the generation is cut at the limit', () => {
    let s = toSpeaking();
    const a = addResponseChars(s, s.limits.maxResponseChars - 1);
    expect(a.cut).toBe(false);
    s = a.session;
    expect(addResponseChars(s, 1).cut).toBe(true);
  });
});

describe('session state machine: tools (VS2.2)', () => {
  it('a committed tool is recorded even though its speech was interrupted', () => {
    let s = toolStarted(toSpeaking(), 'tool-1', 'next_open_slots');
    s = transition(s, { type: 'interrupt' }, T0 + 5).session;
    s = toolFinished(s, 'tool-1', true, T0 + 6);
    expect(s.pendingTools.size).toBe(0);
    expect(s.toolRecords).toEqual([expect.objectContaining({ toolCallId: 'tool-1', committed: true, turnId: 1 })]);
  });

  it('start and finish are idempotent; nothing starts on a closed call', () => {
    let s = toolStarted(toolStarted(toSpeaking(), 't', 'x'), 't', 'x');
    expect(s.pendingTools.size).toBe(1);
    s = toolFinished(toolFinished(s, 't', false, T0), 't', false, T0);
    expect(s.toolRecords).toHaveLength(1);
    expect(toolStarted(inState('closed'), 'u', 'x').pendingTools.size).toBe(0);
  });

  it('records are bounded, dropping uncommitted ones before committed ones', () => {
    let s: SessionSnapshot = { ...toSpeaking(), limits: { ...toSpeaking().limits, maxToolRecords: 3 } };
    for (const [id, committed] of [['a', true], ['b', false], ['c', true], ['d', true]] as const) s = toolFinished(toolStarted(s, id, 'x'), id, committed, T0);
    expect(s.toolRecords.map((r) => r.toolCallId)).toEqual(['a', 'c', 'd']);
  });
});

describe('session state machine: timeouts (VS2.2)', () => {
  it.each(SESSION_STATES.filter((s) => STATE_TIMEOUT_MS[s] !== null))('%s times out exactly at its limit', (st) => {
    const s = inState(st, { stateEnteredAtMs: T0, startedAtMs: T0 });
    const limit = STATE_TIMEOUT_MS[st]!;
    if (limit < s.limits.maxCallMs) {
      expect(dueTimeout(s, T0 + limit - 1)).toBeNull();
      expect(dueTimeout(s, T0 + limit)).toBe('state');
    }
  });

  it('max call duration wins over the state timer; ending and closed ignore it', () => {
    const s = inState('speaking', { startedAtMs: T0, stateEnteredAtMs: T0 + 179_000 });
    expect(dueTimeout(s, T0 + 180_000)).toBe('max_call');
    expect(dueTimeout(inState('ending', { startedAtMs: T0, stateEnteredAtMs: T0 + 179_999 }), T0 + 180_000)).toBeNull();
    expect(dueTimeout(inState('closed'), T0 + 10_000_000)).toBeNull();
  });

  it('a thinking timeout cancels the generation and returns to listening (the model was too slow)', () => {
    const thinking = drive({ type: 'connected' }, { type: 'greeting_done' }, { type: 'caller_turn' });
    const r = transition(thinking, { type: 'timeout' }, T0 + 20_000);
    expect(r).toMatchObject({ ok: true, cancelGeneration: true });
    expect(r.session.state).toBe('listening');
  });
});
