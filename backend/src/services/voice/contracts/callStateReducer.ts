/**
 * Pure call-state reducer (VS1.3). Folds CanonicalCallEvents, from any source and in any order,
 * into one call record. No I/O.
 *
 * ORDER INDEPENDENCE BY CONSTRUCTION. The record keeps its de-duplicated event set, and every
 * apply recomputes the derived fields from that set. Streaming (one event at a time, in arrival
 * order) and batch therefore cannot disagree: they derive from the same set. (Verifier attempt 1
 * showed an incremental fold disagreeing with batch on late terminals and gateway events; this
 * design removes that class of bug rather than patching cases.)
 *
 * Rules (directive sections 3, 5 and 7):
 *  1. Duplicates (same eventKey) are ignored.
 *  2. First terminal wins, by real time (Date.parse, so '...30Z' and '...30.500Z' compare correctly),
 *     ties broken by eventKey. Every other terminal with a different state counts as a conflict.
 *  3. Otherwise the highest-ranked non-terminal state wins; a late, older event cannot pull the call back.
 *  4. An ambiguous dispatch (any dispatch_unknown) cannot be resolved by the gateway itself: gateway
 *     events past dispatch are ignored until carrier, session or reconciler evidence exists.
 *  5. Carrier-answered, human-answered and session-success are separate facts.
 *  6. Redial safety is sticky: once a dispatch was ambiguous or the carrier showed any sign of the
 *     call, mayRedial is false forever, unless a reconciler proved no call was created.
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
  /** The carrier or a session showed the call existed (queued or later, or a provider id). */
  carrierEvidence: boolean;
  /** A reconciler proved the carrier created no call. */
  reconciledNotCreated: boolean;
  terminalAt?: string;
  terminalConflicts: number;
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
const byTime = (a: CanonicalCallEvent, b: CanonicalCallEvent) =>
  ms(a.occurredAt) - ms(b.occurredAt) || (a.eventKey < b.eventKey ? -1 : a.eventKey > b.eventKey ? 1 : 0);

export function initialCallRecord(callId: string): CallRecord {
  return derive(callId, []);
}

function derive(callId: string, events: CanonicalCallEvent[]): CallRecord {
  const sorted = [...events].sort(byTime);
  const dispatchAmbiguous = sorted.some((e) => e.state === 'dispatch_unknown');
  const carrierEvidence = sorted.some((e) => !!e.providerCallId || ((e.source === 'carrier' || e.source === 'session') && RANK[e.state] >= RANK.queued));
  const reconciledNotCreated = sorted.some((e) => e.source === 'reconciler' && e.errorClass === RECONCILED_NOT_CREATED);
  const resolved = carrierEvidence || sorted.some((e) => e.source === 'reconciler');

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
    carrierEvidence,
    reconciledNotCreated,
    terminalAt,
    terminalConflicts,
    lastErrorClass: withError.length ? withError[withError.length - 1].errorClass : undefined,
  };
}

/** Apply one event. Returns a new record; never mutates the input. */
export function applyCallEvent(rec: CallRecord, ev: CanonicalCallEvent): CallRecord {
  if (ev.callId !== rec.callId || rec.events.some((e) => e.eventKey === ev.eventKey)) return rec;
  return derive(rec.callId, [...rec.events, ev]);
}

/** Fold a batch. Identical to applying the events one at a time in any order. */
export function reduceCallEvents(callId: string, events: CanonicalCallEvent[]): CallRecord {
  return events.reduce(applyCallEvent, initialCallRecord(callId));
}

/**
 * May a NEW dial be attempted for this logical call? Only when nothing could have reached the
 * carrier: a policy block, or a refusal before acceptance. Never after an ambiguous dispatch (unless
 * a reconciler proved no call was created), never once the carrier showed any sign of the call.
 */
export function mayRedial(rec: CallRecord, lastDispatchOutcome?: 'accepted' | 'refused' | 'unknown'): boolean {
  if (lastDispatchOutcome === 'accepted' || rec.carrierEvidence || rec.providerCallIds.length > 0) return false;
  if ((rec.dispatchAmbiguous || lastDispatchOutcome === 'unknown') && !rec.reconciledNotCreated) return false;
  return rec.state === 'blocked' || (rec.state === 'failed' && (lastDispatchOutcome === 'refused' || rec.reconciledNotCreated));
}
