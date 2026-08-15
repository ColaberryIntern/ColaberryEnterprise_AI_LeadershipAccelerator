/**
 * runtimeAi — thin LLM helpers for the Learning Runtime (text + json), reusing
 * the instrumented OpenAI client + the shared pricing table. Kept tiny so the
 * mentor / prompt-lab / augment services stay focused on their prompts.
 */
import { getInstrumentedOpenAI } from '../openaiInstrumented';
import { DEFAULT_MODEL, MODEL_PRICING } from '../components/costEstimationService';
import type { TurnContent } from '../agents/tools/types';

/**
 * A turn may carry plain text or text plus images (the read_attachments tool).
 * Content parts are written in the OpenAI shape because that is the default
 * provider; the Anthropic path converts them. Callers never build
 * provider-specific payloads.
 */
export type ChatMessage = { role: 'user' | 'assistant'; content: TurnContent };

/** True when any turn carries image content — i.e. this call needs a vision model. */
function hasImages(messages: ChatMessage[]): boolean {
  return messages.some((m) => Array.isArray(m.content) && m.content.some((p) => p.type === 'image_url'));
}

/**
 * The model to send a given turn to. DEFAULT_MODEL is a text model on some
 * deployments, and sending image parts to one is a hard 400 — which would take
 * the whole coaching turn down rather than degrading. When a turn carries
 * images we therefore pin a known vision-capable model unless the operator has
 * named one explicitly (MENTOR_VISION_MODEL).
 */
function resolveModel(requested: string, messages: ChatMessage[]): string {
  if (!hasImages(messages)) return requested;
  return process.env.MENTOR_VISION_MODEL || 'gpt-4o';
}

// Provider switch (Phase 4b): the mentor runs on OpenAI by default; set
// MENTOR_LLM_PROVIDER=anthropic to run it on Claude (needs @anthropic-ai/sdk +
// ANTHROPIC_API_KEY in env). The Anthropic SDK is imported dynamically so it
// stays fully dormant — and un-required — until the flag is flipped.
const MENTOR_PROVIDER = (process.env.MENTOR_LLM_PROVIDER || 'openai').toLowerCase();

function cost(model: string, res: any): number {
  const p = MODEL_PRICING[model] || MODEL_PRICING[DEFAULT_MODEL];
  const i = res.usage?.prompt_tokens ?? 0, o = res.usage?.completion_tokens ?? 0;
  return Number(((i * p.input_per_1m + o * p.output_per_1m) / 1_000_000).toFixed(6));
}

export async function chatText(workflow: string, system: string, messages: ChatMessage[], model = DEFAULT_MODEL, max_tokens = 700) {
  if (MENTOR_PROVIDER === 'anthropic') {
    const { anthropicChatText } = await import('./anthropicClient');
    return anthropicChatText(system, messages, max_tokens);
  }
  const useModel = resolveModel(model, messages);
  const client = getInstrumentedOpenAI({ workflow_id: workflow });
  const started = Date.now();
  const res = await client.chat.completions.create({
    model: useModel, temperature: 0.6, max_tokens,
    messages: [{ role: 'system', content: system }, ...messages] as any,
  });
  return { text: res.choices?.[0]?.message?.content?.trim() || '', runtime_ms: Date.now() - started, cost_usd: cost(useModel, res) };
}

export async function chatJson(workflow: string, system: string, user: string, model = DEFAULT_MODEL, max_tokens = 1200) {
  if (MENTOR_PROVIDER === 'anthropic') {
    const { anthropicChatJson } = await import('./anthropicClient');
    return anthropicChatJson(system, user, max_tokens);
  }
  const client = getInstrumentedOpenAI({ workflow_id: workflow });
  const started = Date.now();
  const res = await client.chat.completions.create({
    model, temperature: 0.5, max_tokens, response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
  });
  let parsed: any = {};
  try { parsed = JSON.parse(res.choices?.[0]?.message?.content || '{}'); } catch { parsed = {}; }
  return { parsed, runtime_ms: Date.now() - started, cost_usd: cost(model, res) };
}
