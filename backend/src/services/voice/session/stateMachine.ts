/**
 * Realtime voice session state machine (VS2.2). Pure: no I/O, no timers, no clock reads. Both
 * engines (ConversationRelay text, OpenAI Realtime audio) drive the same machine, so interruption,
 * late results, tool bookkeeping and timeouts behave identically whichever engine runs the call.
 *
 * States: connecting -> greeting -> listening <-> thinking -> speaking, plus interrupted,
 * transferring, ending, closed. "tool pending" is NOT a state: tools run independently of speech
 * (a tool may still be running while the agent speaks a filler line), so it is a set on the session.
 *
 * Identity of an answer = (turnId, generationId). Every result carries both; a result whose ids are
 * not the CURRENT ones is stale and is dropped (`acceptsGeneration`), so a slow model reply can
 * never speak into a newer turn, an interrupted generation, or a closed call. A tool that COMMITTED
 * an action is recorded even if the speech it would have triggered was canceled.
 *
 * Time is monotonic milliseconds supplied by the caller (performance.now() in production), never
 * wall-clock, so a clock change cannot fire or suppress a timeout.
 */

export const SESSION_STATES = ['connecting', 'greeting', 'listening', 'thinking', 'speaking', 'interrupted', 'transferring', 'ending', 'closed'] as const;
export type SessionState = (typeof SESSION_STATES)[number];

export const SESSION_EVENTS = [
  'connected', 'greeting_done', 'caller_turn', 'generation_started', 'generation_done', 'interrupt',
  'interrupt_handled', 'transfer', 'end', 'closed', 'timeout',
] as const;
export type SessionEventType = (typeof SESSION_EVENTS)[number];

/**
 * The transition table: the ONLY allowed moves. Anything absent is rejected (and logged by the
 * worker), never silently applied. `end` and `closed` are allowed from every live state.
 */
export const TRANSITIONS: Readonly<Record<SessionState, Partial<Record<SessionEventType, SessionState>>>> = {
  connecting: { connected: 'greeting', end: 'ending', closed: 'closed', timeout: 'ending' },
  greeting: { greeting_done: 'listening', interrupt: 'interrupted', end: 'ending', closed: 'closed', timeout: 'ending' },
  listening: { caller_turn: 'thinking', transfer: 'transferring', end: 'ending', closed: 'closed', timeout: 'ending' },
  thinking: { generation_started: 'speaking', caller_turn: 'thinking', interrupt: 'interrupted', transfer: 'transferring', end: 'ending', closed: 'closed', timeout: 'listening' },
  speaking: { generation_done: 'listening', interrupt: 'interrupted', caller_turn: 'thinking', transfer: 'transferring', end: 'ending', closed: 'closed', timeout: 'listening' },
  interrupted: { interrupt_handled: 'listening', caller_turn: 'thinking', interrupt: 'interrupted', end: 'ending', closed: 'closed', timeout: 'listening' },
  transferring: { end: 'ending', closed: 'closed', timeout: 'ending' },
  ending: { closed: 'closed', timeout: 'closed' },
  closed: {},
};

/** Per-state timeouts (ms). Thinking/speaking time out back to listening; setup and wind-down end the call. */
export const STATE_TIMEOUT_MS: Readonly<Record<SessionState, number | null>> = {
  connecting: 10_000, greeting: 15_000, listening: 30_000, thinking: 12_000, speaking: 60_000,
  interrupted: 3_000, transferring: 45_000, ending: 5_000, closed: null,
};

export interface SessionLimits {
  maxCallMs: number;
  /** Characters one generation may produce before it is cut off (runaway answer guard). */
  maxResponseChars: number;
  /** Committed tool records kept in memory per session (bounded). */
  maxToolRecords: number;
}
export const DEFAULT_LIMITS: SessionLimits = { maxCallMs: 180_000, maxResponseChars: 1_200, maxToolRecords: 50 };

export interface ToolRecord { toolCallId: string; turnId: number; name: string; committed: boolean; finishedAtMs: number }

export interface SessionSnapshot {
  readonly callId: string;
  readonly state: SessionState;
  readonly turnId: number;
  /** Current generation; 0 = none in flight. Bumped on every generation start; invalidated on interrupt. */
  readonly generationId: number;
  readonly startedAtMs: number;
  readonly stateEnteredAtMs: number;
  readonly responseChars: number;
  readonly pendingTools: ReadonlyMap<string, { turnId: number; name: string }>;
  readonly toolRecords: readonly ToolRecord[];
  readonly endReason?: string;
  readonly limits: SessionLimits;
}

export type SessionEvent =
  | { type: Exclude<SessionEventType, 'end' | 'timeout' | 'generation_started' | 'generation_done'> }
  | { type: 'generation_started'; generationId: number }
  | { type: 'generation_done'; generationId: number }
  | { type: 'end'; reason: string }
  | { type: 'timeout' };

export type TransitionResult =
  | { ok: true; session: SessionSnapshot; cancelGeneration: boolean }
  | { ok: false; reason: 'not_allowed' | 'stale_generation'; session: SessionSnapshot };

export function newSession(callId: string, nowMs: number, limits: SessionLimits = DEFAULT_LIMITS): SessionSnapshot {
  return { callId, state: 'connecting', turnId: 0, generationId: 0, startedAtMs: nowMs, stateEnteredAtMs: nowMs, responseChars: 0, pendingTools: new Map(), toolRecords: [], limits };
}

/** Apply one event. Pure: returns a new snapshot; the input is never mutated. */
export function transition(s: SessionSnapshot, ev: SessionEvent, nowMs: number): TransitionResult {
  const target = TRANSITIONS[s.state][ev.type];
  if (!target) return { ok: false, reason: 'not_allowed', session: s };
  if ((ev.type === 'generation_started' || ev.type === 'generation_done') && ev.generationId !== s.generationId + (ev.type === 'generation_started' ? 1 : 0)) {
    return { ok: false, reason: 'stale_generation', session: s };
  }
  // Every accepted event restarts the state timer (a new caller turn or a second interrupt is fresh activity).
  let next: SessionSnapshot = { ...s, state: target, stateEnteredAtMs: nowMs };
  let cancelGeneration = false;
  switch (ev.type) {
    case 'caller_turn':
      // A new caller turn supersedes anything in flight: the old generation can never speak now.
      next = { ...next, turnId: s.turnId + 1, responseChars: 0 };
      cancelGeneration = s.state === 'speaking' || s.state === 'thinking';
      if (cancelGeneration) next = { ...next, generationId: s.generationId + 1 };
      break;
    case 'generation_started':
      next = { ...next, generationId: ev.generationId, responseChars: 0 };
      break;
    case 'interrupt':
      // Invalidate the current generation id so its remaining output is stale everywhere.
      cancelGeneration = true;
      next = { ...next, generationId: s.generationId + 1 };
      break;
    case 'end':
      next = { ...next, endReason: s.endReason ?? ev.reason };
      cancelGeneration = s.state === 'speaking' || s.state === 'thinking';
      break;
    case 'closed':
      cancelGeneration = true;
      next = { ...next, endReason: s.endReason ?? 'closed' };
      break;
    case 'timeout':
      cancelGeneration = s.state === 'speaking' || s.state === 'thinking';
      if (cancelGeneration) next = { ...next, generationId: s.generationId + 1 };
      if (target === 'ending' || target === 'closed') next = { ...next, endReason: s.endReason ?? `timeout_${s.state}` };
      break;
    default:
      break;
  }
  return { ok: true, session: next, cancelGeneration };
}

/** May output from (turnId, generationId) still be spoken? False for any stale turn, generation, or a closed/ending call. */
export function acceptsGeneration(s: SessionSnapshot, turnId: number, generationId: number): boolean {
  return (s.state === 'thinking' || s.state === 'speaking') && turnId === s.turnId && generationId === s.generationId && generationId > 0;
}

/** Count streamed characters; returns `cut: true` once the response-length limit is reached. */
export function addResponseChars(s: SessionSnapshot, chars: number): { session: SessionSnapshot; cut: boolean } {
  const responseChars = s.responseChars + Math.max(0, chars);
  return { session: { ...s, responseChars }, cut: responseChars >= s.limits.maxResponseChars };
}

export function toolStarted(s: SessionSnapshot, toolCallId: string, name: string): SessionSnapshot {
  if (s.state === 'closed' || s.pendingTools.has(toolCallId)) return s; // idempotent; nothing starts on a closed call
  const pendingTools = new Map(s.pendingTools);
  pendingTools.set(toolCallId, { turnId: s.turnId, name });
  return { ...s, pendingTools };
}

/**
 * A tool finished. Its record is kept whether or not anyone will speak about it (a committed action
 * happened in the world even if the caller interrupted). Records are bounded: the oldest uncommitted
 * record is dropped first, committed ones last.
 */
export function toolFinished(s: SessionSnapshot, toolCallId: string, committed: boolean, nowMs: number): SessionSnapshot {
  const p = s.pendingTools.get(toolCallId);
  if (!p) return s; // unknown or already finished: idempotent
  const pendingTools = new Map(s.pendingTools);
  pendingTools.delete(toolCallId);
  let toolRecords = [...s.toolRecords, { toolCallId, turnId: p.turnId, name: p.name, committed, finishedAtMs: nowMs }];
  while (toolRecords.length > s.limits.maxToolRecords) {
    const i = toolRecords.findIndex((r) => !r.committed);
    toolRecords.splice(i >= 0 ? i : 0, 1);
  }
  return { ...s, pendingTools, toolRecords };
}

/** Which timeout, if any, is due now: the per-state timeout or the max call duration. */
export function dueTimeout(s: SessionSnapshot, nowMs: number): 'state' | 'max_call' | null {
  if (s.state === 'closed') return null;
  if (s.state !== 'ending' && nowMs - s.startedAtMs >= s.limits.maxCallMs) return 'max_call';
  const limit = STATE_TIMEOUT_MS[s.state];
  return limit !== null && nowMs - s.stateEnteredAtMs >= limit ? 'state' : null;
}
