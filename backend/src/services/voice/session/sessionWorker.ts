/**
 * Session worker (VS2.2): owns every live voice session in this process. It wraps the pure state
 * machine with the parts that need I/O-adjacent bookkeeping: a cancellation token per generation,
 * a bounded outbound queue (backpressure), per-state and max-call timeouts, global and per-agent
 * concurrency, and graceful shutdown.
 *
 * Failure-first:
 *   - Every session ends in exactly one place (`finish`), which aborts the generation token, clears
 *     the queue and removes the session, so nothing leaks however the call ends (proved over 1,000
 *     connect/disconnect cycles in the tests).
 *   - The tick timer exists only while a session exists and is unref'd: an idle worker holds nothing.
 *   - Drain (SIGTERM): refuse new sessions, wait for live ones to finish until a deadline, then
 *     force-close the rest and hand each to the reconcile hook (the carrier is asked what really
 *     happened; we never assume). Drain is idempotent: a second SIGTERM returns the same promise.
 *   - A rejected transition is logged with its reason and never applied.
 * Not handled here: the WebSocket transport (engines, VS2.3/VS2.4) and persisting turns.
 */
import {
  acceptsGeneration, addResponseChars, dueTimeout, newSession, toolFinished, toolStarted, transition,
  DEFAULT_LIMITS, type SessionEvent, type SessionLimits, type SessionSnapshot, type TransitionResult,
} from './stateMachine';

export interface WorkerConfig { maxSessions: number; maxPerAgent: number; tickMs: number; queueMax: number }
export const DEFAULT_WORKER_CONFIG: WorkerConfig = { maxSessions: 20, maxPerAgent: 3, tickMs: 250, queueMax: 200 };

export interface WorkerDeps {
  /** Monotonic milliseconds (performance.now in production). */
  now: () => number;
  log: (line: Record<string, unknown>) => void;
  /** Called for every session the drain had to force-close, so the carrier state can be reconciled. */
  reconcile: (snapshot: SessionSnapshot) => Promise<void>;
  /**
   * Durable record of every finished tool, called whether or not the session is still alive: a tool
   * that COMMITTED an action (booked a slot, wrote a row) is recorded even if the caller hung up or
   * interrupted before anyone spoke about it.
   */
  recordTool: (callId: string, rec: { toolCallId: string; name: string; turnId: number; committed: boolean; afterClose: boolean }) => void;
}

export type OpenRefusal = 'draining' | 'capacity' | 'agent_concurrency' | 'duplicate';

export interface SessionHandle {
  readonly callId: string;
  snapshot(): SessionSnapshot;
  dispatch(ev: SessionEvent): TransitionResult;
  /** Aborts when the current generation is canceled (interrupt, new caller turn, timeout, close). */
  generationSignal(): AbortSignal;
  /** May output from this (turn, generation) still be spoken? */
  accepts(turnId: number, generationId: number): boolean;
  /** Count streamed characters for the current generation; true = the response must be cut now. */
  addChars(n: number): boolean;
  /** Bounded outbound queue. false = full: the producer must stop (backpressure), nothing is dropped silently. */
  enqueue(msg: unknown): boolean;
  takeQueued(): unknown[];
  toolStarted(toolCallId: string, name: string): void;
  toolFinished(toolCallId: string, committed: boolean): void;
  close(reason: string): void;
}

interface Live { agentId: string; snap: SessionSnapshot; gen: AbortController; queue: unknown[] }

export class SessionWorker {
  private readonly sessions = new Map<string, Live>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private drainPromise: Promise<{ drained: number; forced: number }> | null = null;
  private idleWaiters: Array<() => void> = [];
  /** Tools still running when their session closed (bounded), so their outcome is still recorded. */
  private readonly orphanTools = new Map<string, { name: string; turnId: number }>();
  private static readonly MAX_ORPHANS = 500;

  constructor(private readonly deps: WorkerDeps, private readonly cfg: WorkerConfig = DEFAULT_WORKER_CONFIG) {}

  get size(): number { return this.sessions.size; }
  get draining(): boolean { return this.drainPromise !== null; }
  get hasTimer(): boolean { return this.timer !== null; }

  open(callId: string, agentId: string, limits: SessionLimits = DEFAULT_LIMITS): { ok: true; handle: SessionHandle } | { ok: false; reason: OpenRefusal } {
    const refuse = (reason: OpenRefusal) => {
      this.deps.log({ level: 'warn', event: 'voice_session_refused', outcome: 'skipped', error_class: 'SessionRefused', reason, call_id: callId });
      return { ok: false as const, reason };
    };
    if (this.draining) return refuse('draining');
    if (this.sessions.has(callId)) return refuse('duplicate');
    if (this.sessions.size >= this.cfg.maxSessions) return refuse('capacity');
    let perAgent = 0;
    for (const s of this.sessions.values()) if (s.agentId === agentId) perAgent++;
    if (perAgent >= this.cfg.maxPerAgent) return refuse('agent_concurrency');
    this.sessions.set(callId, { agentId, snap: newSession(callId, this.deps.now(), limits), gen: new AbortController(), queue: [] });
    this.ensureTimer();
    return { ok: true, handle: this.handle(callId) };
  }

  /** Check every session's timeouts once. Exposed for tests; the interval calls it in production. */
  tick(): void {
    const now = this.deps.now();
    for (const [callId, s] of [...this.sessions]) {
      const due = dueTimeout(s.snap, now);
      if (due === 'max_call') this.apply(callId, { type: 'end', reason: 'max_call_duration' });
      else if (due === 'state') this.apply(callId, { type: 'timeout' });
    }
  }

  drain(deadlineMs: number): Promise<{ drained: number; forced: number }> {
    if (this.drainPromise) return this.drainPromise;
    const startCount = this.sessions.size;
    this.deps.log({ level: 'info', event: 'voice_drain_started', outcome: 'success', sessions: startCount, deadline_ms: deadlineMs });
    this.drainPromise = new Promise((resolve) => {
      // Settles exactly once. Without this guard, force-closing the last session fired the idle
      // waiter, which settled the drain early and reported forced sessions as drained (test caught it).
      let settled = false;
      const done = async (timedOut: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        const left = [...this.sessions.keys()];
        let forced = 0;
        for (const callId of left) {
          const snap = this.sessions.get(callId)?.snap;
          this.apply(callId, { type: 'closed' });
          if (snap) {
            forced++;
            try {
              await this.deps.reconcile(snap);
            } catch (e) {
              this.deps.log({ level: 'error', event: 'voice_drain_reconcile_failed', outcome: 'failure', error_class: (e as { name?: string })?.name || 'ReconcileError', call_id: callId });
            }
          }
        }
        this.deps.log({ level: timedOut ? 'warn' : 'info', event: 'voice_drain_finished', outcome: forced ? 'partial' : 'success', drained: startCount - forced, forced });
        resolve({ drained: startCount - forced, forced });
      };
      const deadline = setTimeout(() => void done(true), deadlineMs);
      if (typeof deadline.unref === 'function') deadline.unref();
      this.whenIdle(() => void done(false));
    });
    return this.drainPromise;
  }

  private whenIdle(cb: () => void): void {
    if (this.sessions.size === 0) cb();
    else this.idleWaiters.push(cb);
  }

  private ensureTimer(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), this.cfg.tickMs);
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }

  private apply(callId: string, ev: SessionEvent): TransitionResult | null {
    const s = this.sessions.get(callId);
    if (!s) return null;
    const r = transition(s.snap, ev, this.deps.now());
    if (!r.ok) {
      this.deps.log({ level: 'warn', event: 'voice_session_transition_rejected', outcome: 'skipped', error_class: 'InvalidTransition', reason: r.reason, from: s.snap.state, on: ev.type, call_id: callId });
      return r;
    }
    s.snap = r.session;
    if (r.cancelGeneration) {
      s.gen.abort();
      s.gen = new AbortController();
      s.queue.length = 0; // queued speech for a canceled generation must never be sent
    }
    if (r.session.state === 'closed') this.finish(callId);
    return r;
  }

  /** The ONE place a session ends: abort, clear, remove, stop the timer when idle. */
  private finish(callId: string): void {
    const s = this.sessions.get(callId);
    if (!s) return;
    s.gen.abort();
    s.queue.length = 0;
    for (const [toolCallId, t] of s.snap.pendingTools) {
      if (this.orphanTools.size >= SessionWorker.MAX_ORPHANS) this.orphanTools.delete(this.orphanTools.keys().next().value as string);
      this.orphanTools.set(`${callId}:${toolCallId}`, t);
    }
    this.sessions.delete(callId);
    this.deps.log({ level: 'info', event: 'voice_session_closed', outcome: 'success', call_id: callId, reason: s.snap.endReason ?? 'closed', committed_tools: s.snap.toolRecords.filter((t) => t.committed).length, pending_tools: s.snap.pendingTools.size });
    if (this.sessions.size === 0) {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      const waiters = this.idleWaiters;
      this.idleWaiters = [];
      for (const w of waiters) w();
    }
  }

  private finishTool(callId: string, toolCallId: string, committed: boolean): void {
    const s = this.sessions.get(callId);
    const pending = s?.snap.pendingTools.get(toolCallId);
    if (s && pending) {
      s.snap = toolFinished(s.snap, toolCallId, committed, this.deps.now());
      this.deps.recordTool(callId, { toolCallId, name: pending.name, turnId: pending.turnId, committed, afterClose: false });
      return;
    }
    const key = `${callId}:${toolCallId}`;
    const orphan = this.orphanTools.get(key);
    if (!orphan) return; // unknown or already recorded: idempotent
    this.orphanTools.delete(key);
    this.deps.recordTool(callId, { toolCallId, name: orphan.name, turnId: orphan.turnId, committed, afterClose: true });
  }

  get orphanCount(): number { return this.orphanTools.size; }

  private handle(callId: string): SessionHandle {
    const live = () => this.sessions.get(callId);
    const closedSnap = (): SessionSnapshot => ({ ...newSession(callId, 0), state: 'closed' });
    return {
      callId,
      snapshot: () => live()?.snap ?? closedSnap(),
      dispatch: (ev) => this.apply(callId, ev) ?? { ok: false, reason: 'not_allowed', session: closedSnap() },
      generationSignal: () => live()?.gen.signal ?? AbortSignal.abort(),
      accepts: (turnId, generationId) => { const s = live(); return !!s && acceptsGeneration(s.snap, turnId, generationId); },
      addChars: (n) => { const s = live(); if (!s) return true; const r = addResponseChars(s.snap, n); s.snap = r.session; return r.cut; },
      enqueue: (msg) => { const s = live(); if (!s || s.queue.length >= this.cfg.queueMax) return false; s.queue.push(msg); return true; },
      takeQueued: () => { const s = live(); if (!s) return []; const out = s.queue; s.queue = []; return out; },
      toolStarted: (id, name) => { const s = live(); if (s) s.snap = toolStarted(s.snap, id, name); },
      toolFinished: (id, committed) => this.finishTool(callId, id, committed),
      close: (reason) => {
        const s = live();
        if (s && s.snap.state !== 'ending') this.apply(callId, { type: 'end', reason });
        this.apply(callId, { type: 'closed' });
      },
    };
  }
}

/** On SIGTERM: drain to the deadline. Returns an uninstall function. Idempotent across repeated signals. */
export function installSigtermDrain(worker: SessionWorker, proc: Pick<NodeJS.EventEmitter, 'on' | 'off'>, deadlineMs: number): () => void {
  const onTerm = () => { void worker.drain(deadlineMs); };
  proc.on('SIGTERM', onTerm);
  return () => proc.off('SIGTERM', onTerm);
}
