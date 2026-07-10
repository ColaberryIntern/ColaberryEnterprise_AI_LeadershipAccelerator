/**
 * runtimeAi — thin LLM helpers for the Learning Runtime (text + json), reusing
 * the instrumented OpenAI client + the shared pricing table. Kept tiny so the
 * mentor / prompt-lab / augment services stay focused on their prompts.
 */
import { getInstrumentedOpenAI } from '../openaiInstrumented';
import { DEFAULT_MODEL, MODEL_PRICING } from '../components/costEstimationService';

function cost(model: string, res: any): number {
  const p = MODEL_PRICING[model] || MODEL_PRICING[DEFAULT_MODEL];
  const i = res.usage?.prompt_tokens ?? 0, o = res.usage?.completion_tokens ?? 0;
  return Number(((i * p.input_per_1m + o * p.output_per_1m) / 1_000_000).toFixed(6));
}

export async function chatText(workflow: string, system: string, messages: Array<{ role: 'user' | 'assistant'; content: string }>, model = DEFAULT_MODEL, max_tokens = 700) {
  const client = getInstrumentedOpenAI({ workflow_id: workflow });
  const started = Date.now();
  const res = await client.chat.completions.create({
    model, temperature: 0.6, max_tokens,
    messages: [{ role: 'system', content: system }, ...messages],
  });
  return { text: res.choices?.[0]?.message?.content?.trim() || '', runtime_ms: Date.now() - started, cost_usd: cost(model, res) };
}

export async function chatJson(workflow: string, system: string, user: string, model = DEFAULT_MODEL, max_tokens = 1200) {
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
