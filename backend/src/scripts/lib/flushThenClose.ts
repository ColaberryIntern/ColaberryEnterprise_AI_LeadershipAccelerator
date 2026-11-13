/**
 * flushThenClose - the shutdown order every one-shot script that calls an LLM must use.
 *
 * The instrumented OpenAI client fires `emitAiEvent` without awaiting it, so the ai_event row for a script's LAST
 * call is still being written when the script reaches `sequelize.close()`. Closing first produced, on production
 * (SV0 baseline run, 2026-11-13): "[emitAiEvent] Failed to persist ai_event: ConnectionManager.getConnection was
 * called after the connection manager was closed!". This waits for the in-flight telemetry (bounded), THEN closes.
 *
 * Failure modes: the flush is bounded by `timeoutMs` and never throws by contract; if an injected flush throws
 * anyway, the error is logged and the connection is STILL closed, so a script can never be left holding the pool.
 */
import { flushAiEvents } from '../../services/aiEventService';

export type FlushFn = (timeoutMs?: number) => Promise<{ pending: number; timedOut: boolean }>;

export async function flushThenClose(close: () => Promise<unknown>, flush: FlushFn = flushAiEvents, timeoutMs = 5000): Promise<void> {
  try {
    await flush(timeoutMs);
  } catch (err) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'error', service: 'backend', event: 'ai_event_flush_failed', outcome: 'failure',
      error_class: (err as Error)?.name ?? 'Error', context: { message: String((err as Error)?.message ?? err).slice(0, 200) },
    }));
  }
  await close();
}
