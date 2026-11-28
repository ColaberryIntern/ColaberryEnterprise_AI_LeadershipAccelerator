/**
 * Provider guards (VS4.3): the three outbound providers, each behind its breaker and measured.
 *   - Claude (Engine A): an open circuit answers at once with a failed turn, so the caller hears the
 *     apology instead of 15 s of silence.
 *   - OpenAI Realtime (Engine B): an open circuit refuses the call before a session exists.
 *   - Twilio: an open circuit refuses the dial (nothing was created, so it may be tried again later).
 * Only failures that say the PROVIDER is unwell count. A wrong request or a hang-up is neutral.
 */
import type { LlmTurnResult, VoiceLlm } from '../engines/claudeVoiceLlm';
import type { ModelHandlers, SocketLike } from '../engines/realtime/openaiRealtimeEngine';
import type { CarrierAdapter } from '../contracts/providers';
import type { Outcome } from './circuitBreaker';
import { GENERATION_TIMEOUT } from '../session/sessionWorker';
import { voiceOps, type OpsMetrics } from './opsMetrics';

/** A Realtime session normally opens in well under a second; the call itself gives up at 10 s. */
export const REALTIME_SLOW_MS = 8_000;

const UNWELL: ReadonlySet<string> = new Set(['RateLimitError', 'TimeoutError', 'UpstreamUnavailable', 'AuthError', 'LlmStreamError', 'ContractViolation']);
export const outcomeOf = (errorClass: string): Outcome => (UNWELL.has(errorClass) ? 'failure' : 'neutral');

/** Engine A behind its provider's circuit. Measured as engine_a.* whichever provider answers. */
export function guardLlm(llm: VoiceLlm, provider: 'anthropic' | 'openai', ops: OpsMetrics = voiceOps, now: () => number = Date.now): VoiceLlm {
  const b = ops.breakers[provider];
  return {
    async streamTurn(a): Promise<LlmTurnResult> {
      if (!b.allow()) return { ok: false, errorClass: 'CircuitOpen', aborted: false };
      const t0 = now();
      let outcome: Outcome = 'failure'; // a throw is a provider failure
      try {
        let first = true;
        const waitedOut = () => first && a.signal.reason === GENERATION_TIMEOUT; // no word before we gave up
        const r = await llm.streamTurn({ ...a, onText: (d) => { if (first) { first = false; ops.operation('engine_a.first_text', 'success', now() - t0); } a.onText(d); } });
        outcome = r.ok ? 'success' : r.aborted ? (waitedOut() ? 'failure' : 'neutral') : outcomeOf(r.errorClass);
        return r;
      } finally {
        b.record(outcome);
        ops.operation('engine_a.turn', outcome, now() - t0);
      }
    },
  };
}

export const realtimeAvailable = (ops: OpsMetrics = voiceOps): boolean => ops.breakers.openai_realtime.available();

/** Success = the model accepted our session. A close before that is a failure; after it, the call's own business. */
export function guardRealtime(connect: (h: ModelHandlers) => SocketLike, ops: OpsMetrics = voiceOps, now: () => number = Date.now): (h: ModelHandlers) => SocketLike {
  const b = ops.breakers.openai_realtime;
  return (h) => {
    if (!b.allow()) throw Object.assign(new Error('openai realtime circuit is open'), { name: 'CircuitOpen' });
    const t0 = now();
    let done = false;
    const settle = (o: Outcome) => { if (done) return; done = true; b.record(o); ops.operation('openai_realtime.connect', o, now() - t0); };
    try {
      const s = connect({
        onMessage: (raw) => { if (!done && String(raw).includes('"session.updated"')) settle('success'); h.onMessage(raw); },
        onClose: (r) => { settle('failure'); h.onClose(r); },
      });
      return { send: (t) => s.send(t), close: (c) => { settle(now() - t0 >= REALTIME_SLOW_MS ? 'failure' : 'neutral'); s.close(c); } }; // we closed first: a verdict only if it had kept us waiting
    } catch (e) {
      settle('failure');
      throw e;
    }
  };
}

export function guardCarrier(c: CarrierAdapter, ops: OpsMetrics = voiceOps, now: () => number = Date.now): CarrierAdapter {
  const b = ops.breakers.twilio;
  return {
    ...c,
    async placeCall(input, twimlUrl) {
      if (!b.allow()) return { outcome: 'refused', callId: input.callId, errorClass: 'CircuitOpen', retryable: true, detail: 'carrier circuit open' };
      const t0 = now();
      let outcome: Outcome = 'neutral'; // a throw is ours (number lookup): the carrier's own errors come back as outcomes
      try {
        const r = await c.placeCall(input, twimlUrl);
        outcome = r.outcome === 'accepted' ? 'success' : r.outcome === 'unknown' ? 'failure' : outcomeOf(r.errorClass);
        return r;
      } finally {
        b.record(outcome);
        ops.operation('twilio.place_call', outcome, now() - t0);
      }
    },
  };
}
