import OpenAI from 'openai';
import { redactSensitive } from '../utils/piiRedaction';
import { computeCostUsd } from '../utils/aiCost';
import { emitAiEvent } from './aiEventService';
import { getTraceId } from '../utils/requestContext';

/**
 * Instrumented OpenAI client factory (TBI audit P1-2).
 *
 * Returns a normal OpenAI client whose `chat.completions.create` is wrapped so that EVERY call
 * through it:
 *   1. redacts high-sensitivity PII (SSN, payment cards) from outgoing string message content (P0-3),
 *   2. is forwarded UNCHANGED — tools, vision/array content, JSON mode, and streaming all pass
 *      through, and the exact response is returned, so call-site logic is unaffected,
 *   3. emits an `ai_events` row with computed `cost_usd` (P1) for cost/observability coverage.
 *
 * Migration is a construction-only swap: replace `new OpenAI({ apiKey: ... })` with
 * `getInstrumentedOpenAI({ workflow_id: '<feature>' })`. Nothing else at the call site changes.
 */
export interface LlmCallContext {
  workflow_id?: string;
  agent_id?: string;
  user_id?: string;
  trace_id?: string;
}

export function getInstrumentedOpenAI(
  context: LlmCallContext = {},
  clientOptions: ConstructorParameters<typeof OpenAI>[0] = {},
): OpenAI {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, ...clientOptions });
  const completions = client.chat.completions;
  const origCreate = completions.create.bind(completions);

  // Per-instance method override (not the prototype), so only this client is instrumented.
  (completions as unknown as { create: unknown }).create = async (paramsIn: any, opts?: any) => {
    let params = paramsIn;
    // Redact only string message content; leave vision/tool array content structurally intact.
    if (params && Array.isArray(params.messages)) {
      params = {
        ...params,
        messages: params.messages.map((m: any) =>
          m && typeof m.content === 'string' ? { ...m, content: redactSensitive(m.content) } : m,
        ),
      };
    }
    const model: string = params?.model || 'unknown';
    const t0 = Date.now();

    // Streaming responses carry no usage object — forward and emit a lightweight event.
    if (params?.stream) {
      const stream = await origCreate(params, opts);
      emitAiEvent({
        event_type: 'llm.call', outcome: 'success', external_system: 'openai',
        workflow_id: context.workflow_id ?? null, agent_id: context.agent_id ?? null,
        user_id: context.user_id ?? null, trace_id: context.trace_id ?? getTraceId() ?? null,
        model, duration_ms: Date.now() - t0, cache_hit: false, metadata: { streamed: true },
      }).catch(() => {});
      return stream;
    }

    try {
      const resp: any = await origCreate(params, opts);
      const usage = resp?.usage || {};
      const promptTokens: number | null = usage.prompt_tokens ?? null;
      const completionTokens: number | null = usage.completion_tokens ?? null;
      emitAiEvent({
        event_type: 'llm.call', outcome: 'success', external_system: 'openai',
        workflow_id: context.workflow_id ?? null, agent_id: context.agent_id ?? null,
        user_id: context.user_id ?? null, trace_id: context.trace_id ?? getTraceId() ?? null,
        model,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: usage.total_tokens ?? null,
        cost_usd: promptTokens != null && completionTokens != null
          ? computeCostUsd(model, promptTokens, completionTokens)
          : null,
        duration_ms: Date.now() - t0, cache_hit: false,
      }).catch(() => {});
      return resp;
    } catch (err: any) {
      emitAiEvent({
        event_type: 'llm.call', outcome: 'failure', external_system: 'openai',
        workflow_id: context.workflow_id ?? null, agent_id: context.agent_id ?? null,
        user_id: context.user_id ?? null, trace_id: context.trace_id ?? getTraceId() ?? null,
        model, duration_ms: Date.now() - t0,
        error_class: err?.name || 'Error', metadata: { message: err?.message },
      }).catch(() => {});
      throw err;
    }
  };

  return client;
}
