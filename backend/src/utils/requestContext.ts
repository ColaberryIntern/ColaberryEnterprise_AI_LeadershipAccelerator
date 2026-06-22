import { AsyncLocalStorage } from 'async_hooks';

/**
 * Per-request context propagation (TBI audit P1-4).
 *
 * Uses Node's AsyncLocalStorage so a request's trace id is available to any code in its async
 * call chain — including deep service/agent calls — WITHOUT threading it through every function
 * signature. The trace middleware seeds it; emitAiEvent/getInstrumentedOpenAI read it so every
 * AI event can be correlated back to the originating request.
 */
export interface RequestContext {
  traceId?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Run `fn` (and everything it awaits) with the given context active. */
export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

/** The current request's trace id, or undefined outside a request (e.g. cron jobs). */
export function getTraceId(): string | undefined {
  return storage.getStore()?.traceId;
}
