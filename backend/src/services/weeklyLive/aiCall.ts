import type { ResponseCreateParamsNonStreaming } from 'openai/resources/responses/responses';
import { classifyError } from '../../utils/errorClassifier';
import { redactSensitive } from '../../utils/piiRedaction';
import { ensureTraceId } from '../../utils/requestContext';
import { emitAiEvent } from '../aiEventService';
import { getInstrumentedOpenAI } from '../openaiInstrumented';
import { withBudget } from './signals/researchBudget';

/**
 * One paid structured AI call for the Studio (WL3.3): reserved under the monthly cap, redacted, logged to
 * ai_events, answered in a strict JSON schema. No SDK retry, because a retry could bill twice against one
 * reservation. The instrumented client wraps only chat completions, so the event is recorded here.
 *
 * Prices per million tokens from developers.openai.com/api/docs/pricing, read 2026-11-25. A model that
 * is not listed is charged at the reservation, never at zero.
 */
const PRICES: Readonly<Record<string, { input: number; output: number }>> = {
  'gpt-6.2-sol': { input: 2, output: 10 }, 'gpt-6.2-astra': { input: 8, output: 40 }, 'gpt-6.1-terra': { input: 1, output: 5 }, 'gpt-4o': { input: 2.5, output: 10 },
};
const TIMEOUT_MS = 240_000;

export function callCost(model: string, usage: { input_tokens?: number; output_tokens?: number } | undefined, reserveUsd: number): number {
  const p = PRICES[model];
  if (!usage || !p) return reserveUsd;
  return ((usage.input_tokens || 0) * p.input + (usage.output_tokens || 0) * p.output) / 1_000_000;
}

const UNPRICED_RESERVE = { input: 10, output: 50 };
/** The most a call can cost: its model's price, or a high stand-in for a model not listed here. */
export function reserveFor(model: string, maxInputTokens: number, maxOutputTokens: number): number {
  const p = PRICES[model] || UNPRICED_RESERVE;
  return (maxInputTokens * p.input + maxOutputTokens * p.output) / 1_000_000;
}

export interface AiCall { planId: string; purpose: string; model: string; system: string; user: string; schema: Record<string, unknown>; maxTokens: number; reserveUsd: number; }
export type AskAi = (c: AiCall) => Promise<unknown>;

/** The parsed answer, or null when it is not complete JSON (the caller's parser reports that). */
export const askAi: AskAi = (c) => withBudget(c.planId, c.purpose, c.reserveUsd, async () => {
  const workflow = `weekly_live_${c.purpose}`;
  const client = getInstrumentedOpenAI({ workflow_id: workflow }, { timeout: TIMEOUT_MS, maxRetries: 0 });
  const event = { event_type: 'llm.call' as const, external_system: 'openai', workflow_id: workflow, trace_id: ensureTraceId(), model: c.model, cache_hit: false };
  const t0 = Date.now();
  const body: ResponseCreateParamsNonStreaming = {
    model: c.model, instructions: c.system, input: redactSensitive(c.user), max_output_tokens: c.maxTokens,
    text: { format: { type: 'json_schema', name: c.purpose, strict: true, schema: c.schema } },
  };
  try {
    const res = await client.responses.create(body);
    const costUsd = callCost(c.model, res.usage, c.reserveUsd);
    emitAiEvent({ ...event, outcome: 'success', prompt_tokens: res.usage?.input_tokens ?? null, completion_tokens: res.usage?.output_tokens ?? null,
      total_tokens: res.usage?.total_tokens ?? null, cost_usd: costUsd, duration_ms: Date.now() - t0 }).catch(() => undefined); // telemetry never fails the call
    let value: unknown = null;
    try { value = JSON.parse(res.output_text || ''); } catch { value = null; } // cut off at max_output_tokens, or refused
    return { value, costUsd };
  } catch (e) {
    emitAiEvent({ ...event, outcome: 'failure', error_class: classifyError(e), duration_ms: Date.now() - t0 }).catch(() => undefined);
    throw e;
  }
});
