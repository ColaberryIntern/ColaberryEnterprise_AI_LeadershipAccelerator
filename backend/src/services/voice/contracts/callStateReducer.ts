/**
 * Pure call-state reducer (VS1.3). Folds CanonicalCallEvents, from any source and in any order,
 * into one call record. No I/O.
 *
 * ORDER INDEPENDENCE BY CONSTRUCTION. The record keeps its event SET, and every apply recomputes the
 * derived fields from that set. Streaming (one event at a time, in arrival order) and batch therefore
 * derive from the same set and cannot disagree.
 *  - An exact duplicate (same eventKey AND same content) is dropped.
 *  - Same eventKey with DIFFERENT content is a provider anomaly: BOTH events are kept (so neither
 *    arrival order can hide, say, a dispatch_unknown) and eventKeyConflicts counts it.
 *  - An event whose occurredAt does not parse is dropped and counted in invalidEvents. Callers should
 *    validate with CanonicalCallEventSchema first; this is a guard, not the contract.
 *
 * Rules (directive sections 3, 5 and 7):
 *  1. Exact duplicates are ignored; same eventKey with different content keeps both (see above).
    Events for a different callId (compared case-insensitively) are not applied and are counted in foreignEvents.
 *  2. First terminal wins, by real time (Date.parse, so '...30Z' and '...30.500Z' compare correctly),
 *     ties broken by eventKey. Every other terminal with a different state counts as a conflict.
 *  3. Otherwise the highest-ranked non-terminal state wins; a late, older event cannot pull the call back.
 *  4. An ambiguous dispatch (any dispatch_unknown) cannot be resolved by the gateway itself: gateway
 *     events past dispatch are ignored until carrier, session or reconciler evidence exists.
 *  5. Carrier-answered, human-answered and session-success are separate facts.
 *  6. Redial safety is sticky. callExisted is set by ANY evidence that a call reached the phone
 *     network: a provider id, an answeredBy, or any non-gateway event (carrier, session, legacy, or a
 *     reconciler not claiming ReconciledNotCreated) past dispatch. Once set, mayRedial is false
 *     forever. An ambiguous dispatch is redialable only with a ReconciledNotCreated proof AND no
 *     contrary evidence from any source.
 */
import type { CallState, CanonicalCallEvent } from './schemas';
import { TERMINAL_STATES } from './schemas';

/** errorClass a reconciler uses to state, with evidence, that the carrier created no call. */
export const RECONCILED_NOT_CREATED = 'ReconciledNotCreated';

export interface CallRecord {
  callId: string;
  state: CallState;
  events: CanonicalCallEvent[];
  providerCallIds: string[];
  carrierAnswered: boolean;
  humanAnswered: boolean;
  sessionStarted: boolean;
  /** True only when a session actually ran AND the call completed. */
  sessionSucceeded: boolean;
  /** Any dispatch_unknown was ever seen. */
  dispatchAmbiguous: boolean;
  /** Any source showed the call reached the phone network (see rule 6). Blocks redial forever. */
  callExisted: boolean;
  /** A reconciler claimed the carrier created no call (only honored when callExisted is false). */
  reconciledNotCreated: boolean;
  terminalAt?: string;
  terminalConflicts: number;
  /** Events sharing an eventKey but differing in content (both kept). */
  eventKeyConflicts: number;
  /** Events dropped because occurredAt did not parse. */
  invalidEvents: number;
  /** Events addressed to a different callId (not applied). */
  foreignEvents: number;
  lastErrorClass?: string;
}

const RANK: Record<CallState, number> = {
  requested: 0, reserved: 1, dispatching: 2, dispatch_unknown: 3, queued: 4, ringing: 5,
  answered: 6, session_active: 7,
  blocked: 9, completed: 9, busy: 9, no_answer: 9, failed: 9, canceled: 9,
};
const GATEWAY_ALLOWED_WHILE_AMBIGUOUS: ReadonlySet<CallState> = new Set(['requested', 'reserved', 'dispatching', 'dispatch_unknown']);

export function isTerminal(s: CallState): boolean {
  return TERMINAL_STATES.has(s);
}

const ms = (iso: string) => Date.parse(iso);
/** Canonical content of an event: key order independent, so equal events compare equal. */
const content = (e: CanonicalCallEvent) => JSON.stringify(Object.keys(e).sort().map((k) => [k, (e as Record<string, unknown>)[k]]));
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const byTime = (a: CanonicalCallEvent, b: CanonicalCallEvent) =>
  ms(a.occurredAt) - ms(b.occurredAt) || cmp(a.eventKey, b.eventKey) || cmp(content(a), content(b));
const PRE_DISPATCH: ReadonlySet<CallState> = new Set(['requested', 'reserved', 'dispatching', 'dispatch_unknown', 'blocked']);

/** Rule 6: does this one event show the call reached the phone network? */
function showsCallExisted(e: CanonicalCallEvent): boolean {
  if (e.providerCallId || e.answeredBy) return true;
  if (e.source === 'gateway') return false;
  // Any carrier event, whatever its state, means the carrier knew about the call.
  if (e.source === 'carrier') return true;
  if (PRE_DISPATCH.has(e.state)) return false;
  if (e.source === 'reconciler' && e.errorClass === RECONCILED_NOT_CREATED) return false;
  return true;
}

export function initialCallRecord(callId: string): CallRecord {
  return derive(callId.toLowerCase(), [], 0, 0);
}

function derive(callId: string, events: CanonicalCallEvent[], invalidEvents: number, foreignEvents: number): CallRecord {
  const sorted = [...events].sort(byTime);
  const keys = sorted.map((e) => e.eventKey);
  const eventKeyConflicts = keys.length - new Set(keys).size;
  const dispatchAmbiguous = sorted.some((e) => e.state === 'dispatch_unknown');
  const callExisted = sorted.some(showsCallExisted);
  const reconciledNotCreated = sorted.some((e) => e.source === 'reconciler' && e.errorClass === RECONCILED_NOT_CREATED);
  const resolved = callExisted || sorted.some((e) => e.source === 'reconciler');

  // Rule 4: while a dispatch is ambiguous and unresolved, gateway events past dispatch do not count.
  const effective = sorted.filter((e) => !(dispatchAmbiguous && !resolved && e.source === 'gateway' && !GATEWAY_ALLOWED_WHILE_AMBIGUOUS.has(e.state)));

  const terminals = effective.filter((e) => isTerminal(e.state));
  let state: CallState = 'requested';
  let terminalAt: string | undefined;
  let terminalConflicts = 0;
  if (terminals.length) {
    const winner = terminals[0]; // sorted by real time, then eventKey (rule 2)
    state = winner.state;
    terminalAt = winner.occurredAt;
    terminalConflicts = terminals.filter((e) => e.state !== winner.state).length;
  } else {
    for (const e of effective) if (RANK[e.state] > RANK[state]) state = e.state;
  }

  const providerCallIds = Array.from(new Set(sorted.map((e) => e.providerCallId).filter((x): x is string => !!x))).sort();
  const sessionStarted = sorted.some((e) => e.state === 'session_active' && e.source === 'session');
  const withError = sorted.filter((e) => e.errorClass);
  return {
    callId,
    state,
    events: sorted,
    providerCallIds,
    carrierAnswered: sorted.some((e) => e.state === 'answered' && e.source === 'carrier'),
    humanAnswered: sorted.some((e) => e.answeredBy === 'human'),
    sessionStarted,
    sessionSucceeded: sessionStarted && state === 'completed',
    dispatchAmbiguous,
    callExisted,
    reconciledNotCreated,
    terminalAt,
    terminalConflicts,
    eventKeyConflicts,
    invalidEvents,
    foreignEvents,
    lastErrorClass: withError.length ? withError[withError.length - 1].errorClass : undefined,
  };
}

/** Apply one event. Returns a new record; never mutates the input. */
export function applyCallEvent(rec: CallRecord, ev: CanonicalCallEvent): CallRecord {
  if (ev.callId.toLowerCase() !== rec.callId) return derive(rec.callId, rec.events, rec.invalidEvents, rec.foreignEvents + 1);
  if (Number.isNaN(ms(ev.occurredAt))) return derive(rec.callId, rec.events, rec.invalidEvents + 1, rec.foreignEvents);
  const norm: CanonicalCallEvent = { ...ev, callId: rec.callId };
  const c = content(norm);
  if (rec.events.some((e) => e.eventKey === norm.eventKey && content(e) === c)) return rec;
  return derive(rec.callId, [...rec.events, norm], rec.invalidEvents, rec.foreignEvents);
}

/** Fold a batch. Same result as applying the events one at a time, in any arrival order. */
export function reduceCallEvents(callId: string, events: CanonicalCallEvent[]): CallRecord {
  return events.reduce(applyCallEvent, initialCallRecord(callId));
}

/**
 * May a NEW dial be attempted for this logical call? Only when nothing could have reached the
 * carrier: a policy block, or a refusal before acceptance. Never after an ambiguous dispatch (unless
 * a reconciler proved no call was created), never once the carrier showed any sign of the call.
 */
export function mayRedial(rec: CallRecord, lastDispatchOutcome?: 'accepted' | 'refused' | 'unknown'): boolean {
  if (lastDispatchOutcome === 'accepted' || rec.callExisted || rec.providerCallIds.length > 0) return false;
  if (rec.carrierAnswered || rec.humanAnswered || rec.sessionStarted) return false;
  if ((rec.dispatchAmbiguous || lastDispatchOutcome === 'unknown') && !rec.reconciledNotCreated) return false;
  return rec.state === 'blocked' || (rec.state === 'failed' && (lastDispatchOutcome === 'refused' || rec.reconciledNotCreated));
}
