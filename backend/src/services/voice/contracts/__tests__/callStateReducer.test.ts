import { applyCallEvent, initialCallRecord, mayRedial, RECONCILED_NOT_CREATED, reduceCallEvents } from '../callStateReducer';
import type { CallState, CanonicalCallEvent } from '../schemas';

const CALL = '11111111-1111-4111-8111-111111111111';
let n = 0;
function ev(state: CallState, source: CanonicalCallEvent['source'], at: string, extra: Partial<CanonicalCallEvent> = {}): CanonicalCallEvent {
  n += 1;
  return { contractVersion: 1, eventKey: extra.eventKey || `k${n}-${state}`, callId: CALL, source, state, occurredAt: `2026-11-24T15:00:${at}.000Z`, ...extra };
}

function permutations<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
}

describe('callStateReducer: order independence', () => {
  const lifecycle = [
    ev('reserved', 'gateway', '00'),
    ev('dispatching', 'gateway', '01'),
    ev('ringing', 'carrier', '03', { providerCallId: 'CAxxxx0001' }),
    ev('answered', 'carrier', '05', { answeredBy: 'human' }),
    ev('session_active', 'session', '06'),
  ];
  const done = ev('completed', 'carrier', '40');

  it('all 720 arrival orders of a full lifecycle reduce to the same record, streamed one event at a time', () => {
    const all = permutations([...lifecycle, done]);
    expect(all.length).toBe(720);
    const first = reduceCallEvents(CALL, all[0]);
    for (const order of all) {
      const r = order.reduce(applyCallEvent, initialCallRecord(CALL));
      expect(r.state).toBe('completed');
      expect(r.sessionSucceeded).toBe(true);
      expect(r.carrierAnswered && r.humanAnswered).toBe(true);
      expect(r.providerCallIds).toEqual(first.providerCallIds);
    }
  });
});

type Case = { name: string; events: () => CanonicalCallEvent[]; state: CallState; extra?: (r: ReturnType<typeof reduceCallEvents>) => void };
const cases: Case[] = [
  { name: 'happy path ends completed', events: () => [ev('reserved', 'gateway', '00'), ev('completed', 'carrier', '30')], state: 'completed' },
  { name: 'blocked by policy is terminal', events: () => [ev('blocked', 'gateway', '00')], state: 'blocked' },
  { name: 'busy is terminal', events: () => [ev('ringing', 'carrier', '01'), ev('busy', 'carrier', '02')], state: 'busy' },
  { name: 'no_answer is terminal', events: () => [ev('ringing', 'carrier', '01'), ev('no_answer', 'carrier', '30')], state: 'no_answer' },
  { name: 'canceled is terminal', events: () => [ev('queued', 'carrier', '01'), ev('canceled', 'gateway', '02')], state: 'canceled' },
  { name: 'failed is terminal', events: () => [ev('dispatching', 'gateway', '00'), ev('failed', 'carrier', '01')], state: 'failed' },
  { name: 'late ringing after answered does not regress', events: () => [ev('answered', 'carrier', '05'), ev('ringing', 'carrier', '03')], state: 'answered' },
  { name: 'late queued after session does not regress', events: () => [ev('session_active', 'session', '06'), ev('queued', 'carrier', '01')], state: 'session_active' },
  { name: 'event after terminal does not reopen the call', events: () => [ev('completed', 'carrier', '30'), ev('ringing', 'carrier', '40')], state: 'completed' },
  { name: 'earliest terminal wins when two disagree', events: () => [ev('completed', 'carrier', '30'), ev('failed', 'session', '20')], state: 'failed', extra: (r) => expect(r.terminalConflicts).toBe(1) },
  { name: 'later conflicting terminal is counted, not applied', events: () => [ev('failed', 'carrier', '20'), ev('completed', 'session', '30')], state: 'failed', extra: (r) => expect(r.terminalConflicts).toBe(1) },
  { name: 'same terminal twice is not a conflict', events: () => [ev('completed', 'carrier', '30'), ev('completed', 'session', '31')], state: 'completed', extra: (r) => expect(r.terminalConflicts).toBe(0) },
  { name: 'duplicate eventKey is ignored', events: () => { const e = ev('ringing', 'carrier', '01'); return [e, e, e]; }, state: 'ringing', extra: (r) => expect(r.events).toHaveLength(1) },
  { name: 'event for another call is ignored', events: () => [ev('ringing', 'carrier', '01', { callId: '22222222-2222-4222-8222-222222222222' })], state: 'requested' },
  { name: 'dispatch_unknown stays put on gateway events (no self-healing)', events: () => [ev('dispatch_unknown', 'gateway', '01'), ev('blocked', 'gateway', '02'), ev('dispatching', 'gateway', '03')], state: 'dispatch_unknown' },
  { name: 'dispatch_unknown resolved by carrier evidence', events: () => [ev('dispatch_unknown', 'gateway', '01'), ev('ringing', 'carrier', '02', { providerCallId: 'CAxxxx0002' })], state: 'ringing' },
  { name: 'dispatch_unknown resolved by reconciler to failed', events: () => [ev('dispatch_unknown', 'gateway', '01'), ev('failed', 'reconciler', '50')], state: 'failed' },
  { name: 'carrier answered alone is not human answered', events: () => [ev('answered', 'carrier', '05', { answeredBy: 'machine' })], state: 'answered', extra: (r) => { expect(r.carrierAnswered).toBe(true); expect(r.humanAnswered).toBe(false); } },
  { name: 'completed without a session is not a session success', events: () => [ev('answered', 'carrier', '05'), ev('completed', 'carrier', '30')], state: 'completed', extra: (r) => expect(r.sessionSucceeded).toBe(false) },
  { name: 'session that ends failed is not a success', events: () => [ev('session_active', 'session', '06'), ev('failed', 'session', '07')], state: 'failed', extra: (r) => expect(r.sessionSucceeded).toBe(false) },
  { name: 'session_active from carrier does not count as a session', events: () => [ev('session_active', 'carrier', '06'), ev('completed', 'carrier', '30')], state: 'completed', extra: (r) => expect(r.sessionSucceeded).toBe(false) },
  { name: 'provider ids are merged and de-duplicated', events: () => [ev('queued', 'carrier', '01', { providerCallId: 'CAxxxx0003' }), ev('ringing', 'carrier', '02', { providerCallId: 'CAxxxx0003' }), ev('answered', 'carrier', '03', { providerCallId: 'MZxxxx0001' })], state: 'answered', extra: (r) => expect(r.providerCallIds).toEqual(['CAxxxx0003', 'MZxxxx0001']) },
  { name: 'late event still contributes facts', events: () => [ev('completed', 'carrier', '30'), ev('answered', 'carrier', '05', { answeredBy: 'human' })], state: 'completed', extra: (r) => expect(r.humanAnswered).toBe(true) },
  { name: 'error class is retained', events: () => [ev('failed', 'carrier', '01', { errorClass: 'CallerIdRejected' })], state: 'failed', extra: (r) => expect(r.lastErrorClass).toBe('CallerIdRejected') },
  { name: 'empty event list stays requested (boundary)', events: () => [], state: 'requested' },
  { name: 'reserved then blocked by later policy re-check', events: () => [ev('reserved', 'gateway', '00'), ev('blocked', 'gateway', '01')], state: 'blocked' },
  { name: 'legacy source events reduce the same way', events: () => [ev('ringing', 'legacy', '01'), ev('completed', 'legacy', '30')], state: 'completed' },
  { name: 'out-of-order: completed before ringing', events: () => [ev('completed', 'carrier', '30'), ev('ringing', 'carrier', '02')], state: 'completed' },
  { name: 'out-of-order: answered before queued', events: () => [ev('answered', 'carrier', '05'), ev('queued', 'carrier', '01')], state: 'answered' },
  { name: 'cancel during ringing', events: () => [ev('ringing', 'carrier', '02'), ev('canceled', 'gateway', '03')], state: 'canceled' },
  { name: 'busy then late answered stays busy', events: () => [ev('busy', 'carrier', '02'), ev('answered', 'carrier', '03')], state: 'busy' },
];

describe('callStateReducer: scenario table', () => {
  it('has at least 30 scenarios', () => expect(cases.length).toBeGreaterThanOrEqual(30));
  it.each(cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    const r = reduceCallEvents(CALL, c.events());
    expect(r.state).toBe(c.state);
    c.extra?.(r);
  });
});

describe('callStateReducer: purity and idempotency', () => {
  it('applyCallEvent never mutates its input', () => {
    const before = initialCallRecord(CALL);
    const snapshot = JSON.stringify(before);
    applyCallEvent(before, ev('ringing', 'carrier', '01', { providerCallId: 'CAxxxx0009' }));
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('streaming (one at a time, arrival order) and batch reduce agree on a late earlier terminal', () => {
    const late = [ev('completed', 'carrier', '30'), ev('failed', 'session', '20')];
    const streamed = late.reduce(applyCallEvent, initialCallRecord(CALL));
    expect(streamed.state).toBe(reduceCallEvents(CALL, late).state);
  });
});

/**
 * Verifier attempt 1 (8/12) adversarial cases. Each scenario is run through EVERY arrival order on
 * the streaming path and must equal batch, and redial must stay forbidden where the dispatch was
 * ambiguous or the carrier showed the call.
 */
describe('adversarial: streaming equals batch, and redial safety is order-independent', () => {
  const at = (iso: string) => iso;
  const mk = (state: CallState, source: CanonicalCallEvent['source'], occurredAt: string, key: string, extra: Partial<CanonicalCallEvent> = {}): CanonicalCallEvent =>
    ({ contractVersion: 1, eventKey: key, callId: CALL, source, state, occurredAt: at(occurredAt), ...extra });
  const T = '2026-11-24T15:00:30.000Z';
  const scenarios: Record<string, { events: CanonicalCallEvent[]; state: CallState; redialForbidden?: boolean }> = {
    'A: two terminals, same instant': { events: [mk('completed', 'carrier', T, 'a'), mk('failed', 'session', T, 'b')], state: 'completed' },
    'B: dispatch_unknown then gateway completed': { events: [mk('dispatch_unknown', 'gateway', '2026-11-24T15:00:01.000Z', 'du'), mk('completed', 'gateway', '2026-11-24T15:00:02.000Z', 'gc')], state: 'dispatch_unknown', redialForbidden: true },
    'C: dispatch_unknown plus gateway blocked': { events: [mk('dispatch_unknown', 'gateway', '2026-11-24T15:00:02.000Z', 'du'), mk('blocked', 'gateway', '2026-11-24T15:00:01.000Z', 'gb')], state: 'dispatch_unknown', redialForbidden: true },
    'D: dispatch_unknown plus gateway failed': { events: [mk('dispatch_unknown', 'gateway', '2026-11-24T15:00:02.000Z', 'du'), mk('failed', 'gateway', '2026-11-24T15:00:01.000Z', 'gf')], state: 'dispatch_unknown', redialForbidden: true },
    'E: carrier ringing plus gateway blocked': { events: [mk('ringing', 'carrier', '2026-11-24T15:00:02.000Z', 'cr'), mk('blocked', 'gateway', '2026-11-24T15:00:03.000Z', 'gb')], state: 'blocked', redialForbidden: true },
    'F: carrier ringing plus gateway failed': { events: [mk('ringing', 'carrier', '2026-11-24T15:00:02.000Z', 'cr'), mk('failed', 'gateway', '2026-11-24T15:00:03.000Z', 'gf')], state: 'failed', redialForbidden: true },
    'G: three terminals': { events: [mk('completed', 'carrier', '2026-11-24T15:00:30.000Z', 't1'), mk('failed', 'session', '2026-11-24T15:00:31.000Z', 't2'), mk('busy', 'carrier', '2026-11-24T15:00:32.000Z', 't3')], state: 'completed' },
    'H: two error classes': { events: [mk('ringing', 'carrier', '2026-11-24T15:00:01.000Z', 'e1', { errorClass: 'X' }), mk('failed', 'carrier', '2026-11-24T15:00:02.000Z', 'e2', { errorClass: 'Y' })], state: 'failed', redialForbidden: true },
    'I: dispatch_unknown then reconciler failed (no proof of non-creation)': { events: [mk('dispatch_unknown', 'gateway', '2026-11-24T15:00:01.000Z', 'du'), mk('failed', 'reconciler', '2026-11-24T15:05:00.000Z', 'rf')], state: 'failed', redialForbidden: true },
    'J: mixed timestamp precision, earlier terminal wins': { events: [mk('completed', 'carrier', '2026-11-24T15:00:30Z', 'p1'), mk('failed', 'session', '2026-11-24T15:00:30.500Z', 'p2')], state: 'completed' },
  };

  it.each(Object.entries(scenarios))('%s', (_name, s) => {
    const batch = reduceCallEvents(CALL, s.events);
    for (const order of permutations(s.events)) {
      const streamed = order.reduce(applyCallEvent, initialCallRecord(CALL));
      expect(streamed.state).toBe(s.state);
      expect(streamed.terminalConflicts).toBe(batch.terminalConflicts);
      expect(streamed.lastErrorClass).toBe(batch.lastErrorClass);
      if (s.redialForbidden) {
        expect(mayRedial(streamed)).toBe(false);
        expect(mayRedial(streamed, 'refused')).toBe(false);
      }
    }
  });

  it('G counts every conflicting terminal the same way in both paths', () => {
    expect(reduceCallEvents(CALL, scenarios['G: three terminals'].events).terminalConflicts).toBe(2);
  });

  it('H keeps the latest error class by real time', () => {
    expect(reduceCallEvents(CALL, scenarios['H: two error classes'].events).lastErrorClass).toBe('Y');
  });

  it('a reconciler that proves no call was created makes a failed ambiguous dispatch redialable', () => {
    const r = reduceCallEvents(CALL, [
      mk('dispatch_unknown', 'gateway', '2026-11-24T15:00:01.000Z', 'du'),
      mk('failed', 'reconciler', '2026-11-24T15:05:00.000Z', 'rn', { errorClass: RECONCILED_NOT_CREATED }),
    ]);
    expect(r.state).toBe('failed');
    expect(mayRedial(r)).toBe(true);
  });

  it('but never once the carrier showed the call, even with that reconciler proof', () => {
    const r = reduceCallEvents(CALL, [
      mk('ringing', 'carrier', '2026-11-24T15:00:02.000Z', 'cr'),
      mk('failed', 'reconciler', '2026-11-24T15:05:00.000Z', 'rn', { errorClass: RECONCILED_NOT_CREATED }),
    ]);
    expect(mayRedial(r)).toBe(false);
  });
});

/** Verifier attempt 2 (10/12) cases: evidence from ANY source blocks redial; key collisions cannot hide ambiguity. */
describe('adversarial round 2: any evidence of a call blocks redial, in every arrival order', () => {
  const mk = (state: CallState, source: CanonicalCallEvent['source'], s: string, key: string, extra: Partial<CanonicalCallEvent> = {}): CanonicalCallEvent =>
    ({ contractVersion: 1, eventKey: key, callId: CALL, source, state, occurredAt: `2026-11-24T15:00:${s}.000Z`, ...extra });
  const forbidden: Record<string, CanonicalCallEvent[]> = {
    'P: gateway blocked + legacy human answered (no provider id)': [mk('blocked', 'gateway', '01', 'gb'), mk('answered', 'legacy', '05', 'la', { answeredBy: 'human' })],
    'P2: dispatching, legacy human answered, gateway failed': [mk('dispatching', 'gateway', '01', 'gd'), mk('answered', 'legacy', '05', 'la', { answeredBy: 'human' }), mk('failed', 'gateway', '06', 'gf')],
    'Q: gateway blocked + reconciler answered (no provider id)': [mk('blocked', 'gateway', '01', 'gb'), mk('answered', 'reconciler', '05', 'ra')],
    'Q2: ReconciledNotCreated contradicted by a reconciler completed': [mk('dispatch_unknown', 'gateway', '01', 'du'),
      mk('failed', 'reconciler', '10', 'rn', { errorClass: RECONCILED_NOT_CREATED }), mk('completed', 'reconciler', '20', 'rc')],
    'Y2: same key on dispatch_unknown and dispatching': [mk('dispatch_unknown', 'gateway', '02', 'same'), mk('dispatching', 'gateway', '01', 'same'), mk('failed', 'gateway', '03', 'gf')],
    'legacy ringing with no provider id': [mk('ringing', 'legacy', '02', 'lr'), mk('failed', 'gateway', '03', 'gf')],
  };

  it.each(Object.entries(forbidden))('%s: never redialable', (_n, events) => {
    const batch = reduceCallEvents(CALL, events);
    for (const order of permutations(events)) {
      const r = order.reduce(applyCallEvent, initialCallRecord(CALL));
      expect(r.state).toBe(batch.state);
      expect(r.eventKeyConflicts).toBe(batch.eventKeyConflicts);
      for (const outcome of [undefined, 'refused', 'unknown'] as const) expect(mayRedial(r, outcome)).toBe(false);
    }
  });

  it('Y: same key, different content, produces one record in every order and counts the conflict', () => {
    const events = [mk('ringing', 'carrier', '02', 'k'), mk('answered', 'carrier', '03', 'k'), mk('completed', 'carrier', '30', 'end')];
    const sigs = new Set(permutations(events).map((o) => JSON.stringify(o.reduce(applyCallEvent, initialCallRecord(CALL)))));
    expect(sigs.size).toBe(1);
    expect(reduceCallEvents(CALL, events).eventKeyConflicts).toBe(1);
  });

  it('an exact duplicate (same key, same content) is still dropped', () => {
    const e = mk('ringing', 'carrier', '02', 'k');
    const r = reduceCallEvents(CALL, [e, { ...e }]);
    expect(r.events).toHaveLength(1);
    expect(r.eventKeyConflicts).toBe(0);
  });

  it('Z: an unparseable occurredAt is dropped and counted, in every order', () => {
    const bad = { ...mk('completed', 'carrier', '30', 'bad'), occurredAt: 'not-a-date' };
    const events = [mk('ringing', 'carrier', '02', 'r'), bad, mk('answered', 'carrier', '05', 'a')];
    const sigs = new Set(permutations(events).map((o) => JSON.stringify(o.reduce(applyCallEvent, initialCallRecord(CALL)))));
    expect(sigs.size).toBe(1);
    const r = reduceCallEvents(CALL, events);
    expect(r.invalidEvents).toBe(1);
    expect(r.state).toBe('answered');
  });

  it('a gateway-only block, with no evidence anywhere, stays redialable (no false lockout)', () => {
    expect(mayRedial(reduceCallEvents(CALL, [mk('reserved', 'gateway', '00', 'r'), mk('blocked', 'gateway', '01', 'b')]))).toBe(true);
  });
});

describe('mayRedial: an ambiguous or accepted dispatch is never redialed', () => {
  it('refuses after dispatch_unknown', () => expect(mayRedial(reduceCallEvents(CALL, [ev('dispatch_unknown', 'gateway', '01')]), 'unknown')).toBe(false));
  it('refuses after an accepted dispatch even if it later failed', () => expect(mayRedial(reduceCallEvents(CALL, [ev('failed', 'carrier', '01')]), 'accepted')).toBe(false));
  it('refuses once any provider id exists', () => expect(mayRedial(reduceCallEvents(CALL, [ev('failed', 'carrier', '01', { providerCallId: 'CAxxxx0004' })]), 'refused')).toBe(false));
  it('allows after a policy block', () => expect(mayRedial(reduceCallEvents(CALL, [ev('blocked', 'gateway', '00')]))).toBe(true));
  it('allows after a refusal before acceptance', () => expect(mayRedial(reduceCallEvents(CALL, [ev('failed', 'gateway', '00')]), 'refused')).toBe(true));
  it('refuses for a call still in progress', () => expect(mayRedial(reduceCallEvents(CALL, [ev('ringing', 'carrier', '01')]))).toBe(false));
});
