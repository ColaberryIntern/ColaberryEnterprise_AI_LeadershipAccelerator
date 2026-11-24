/**
 * Pure call-state reducer (VS1.3). Folds CanonicalCallEvents, from any source and in any order,
 * into one call record. No I/O; the same events in any order produce the same final state.
 *
 * Rules (directive sections 3 and 7):
 *  1. Duplicates (same eventKey) are ignored.
 *  2. First terminal wins. A later, different terminal is counted as a conflict, never applied.
 *  3. Non-terminal events only move the call forward (by rank); a late, older event cannot pull it back.
 *     Facts carried on a late event (answeredBy, providerCallId) are still merged.
 *  4. dispatch_unknown is sticky: only carrier, session or reconciler evidence moves it. Nothing in
 *     here ever sends a call back to dispatching, because an ambiguous dispatch must never be redialed.
 *  5. Carrier-answered, human-answered and session-success are separate facts: a ringing phone or a
 *     carrier "answered" is not a conversation.
 *
 * Order-independence: events are applied in (rank, occurredAt, eventKey) order, so the result does
 * not depend on arrival order, except that among terminals the EARLIEST by occurredAt wins.
 */
import type { CallState, CanonicalCallEvent } from './schemas';
import { TERMINAL_STATES } from './schemas';

export interface CallRecord {
  callId: string;
  state: CallState;
  providerCallIds: string[];
  carrierAnswered: boolean;
  humanAnswered: boolean;
  sessionStarted: boolean;
  /** True only when a session actually ran AND the call completed. */
  sessionSucceeded: boolean;
  terminalAt?: string;
  terminalConflicts: number;
  lastErrorClass?: string;
  seenEventKeys: string[];
}

const RANK: Record<CallState, number> = {
  requested: 0, reserved: 1, dispatching: 2, dispatch_unknown: 3, queued: 4, ringing: 5,
  answered: 6, session_active: 7,
  blocked: 9, completed: 9, busy: 9, no_answer: 9, failed: 9, canceled: 9,
};

export function initialCallRecord(callId: string): CallRecord {
  return { callId, state: 'requested', providerCallIds: [], carrierAnswered: false, humanAnswered: false, sessionStarted: false, sessionSucceeded: false, terminalConflicts: 0, seenEventKeys: [] };
}

export function isTerminal(s: CallState): boolean {
  return TERMINAL_STATES.has(s);
}

/** Apply one event. Returns a new record; never mutates the input. */
export function applyCallEvent(rec: CallRecord, ev: CanonicalCallEvent): CallRecord {
  if (ev.callId !== rec.callId || rec.seenEventKeys.includes(ev.eventKey)) return rec;
  const next: CallRecord = { ...rec, providerCallIds: [...rec.providerCallIds], seenEventKeys: [...rec.seenEventKeys, ev.eventKey] };

  // Facts are merged regardless of whether the state moves (rule 3).
  if (ev.providerCallId && !next.providerCallIds.includes(ev.providerCallId)) next.providerCallIds.push(ev.providerCallId);
  if (ev.state === 'answered' && ev.source === 'carrier') next.carrierAnswered = true;
  if (ev.answeredBy === 'human') next.humanAnswered = true;
  if (ev.state === 'session_active' && ev.source === 'session') next.sessionStarted = true;
  if (ev.errorClass) next.lastErrorClass = ev.errorClass;

  if (isTerminal(next.state)) {
    if (isTerminal(ev.state) && ev.state !== next.state) {
      // Rule 2, with order-independence: the earliest terminal by occurredAt wins.
      if (next.terminalAt && ev.occurredAt < next.terminalAt) {
        next.state = ev.state;
        next.terminalAt = ev.occurredAt;
      }
      next.terminalConflicts += 1;
    }
  } else if (next.state === 'dispatch_unknown' && ev.source === 'gateway') {
    // Rule 4: the gateway cannot resolve its own ambiguity (no redial, no self-healing).
  } else if (RANK[ev.state] > RANK[next.state]) {
    next.state = ev.state;
    if (isTerminal(ev.state)) next.terminalAt = ev.occurredAt;
  }

  next.sessionSucceeded = next.sessionStarted && next.state === 'completed';
  return next;
}

const ORDER = (a: CanonicalCallEvent, b: CanonicalCallEvent) =>
  RANK[a.state] - RANK[b.state] || (a.occurredAt < b.occurredAt ? -1 : a.occurredAt > b.occurredAt ? 1 : 0) || (a.eventKey < b.eventKey ? -1 : a.eventKey > b.eventKey ? 1 : 0);

/** Fold a batch in canonical order (rule set above), so arrival order never changes the outcome. */
export function reduceCallEvents(callId: string, events: CanonicalCallEvent[]): CallRecord {
  return [...events].sort(ORDER).reduce(applyCallEvent, initialCallRecord(callId));
}

/**
 * May a NEW dial be attempted for this logical call? Only when nothing could have reached the
 * carrier: blocked, or refused before acceptance. Never from dispatch_unknown or anything later.
 */
export function mayRedial(rec: CallRecord, lastDispatchOutcome?: 'accepted' | 'refused' | 'unknown'): boolean {
  if (rec.state === 'dispatch_unknown' || lastDispatchOutcome === 'unknown' || lastDispatchOutcome === 'accepted') return false;
  if (rec.providerCallIds.length > 0) return false;
  return rec.state === 'blocked' || (rec.state === 'failed' && lastDispatchOutcome === 'refused');
}
