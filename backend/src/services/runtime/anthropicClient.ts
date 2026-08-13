/**
 * anthropicClient — the Claude (Anthropic) path for the runtime mentor's LLM
 * calls, isolated in its own module so the Anthropic SDK is NEVER mixed with the
 * OpenAI client. Dormant unless MENTOR_LLM_PROVIDER=anthropic; runtimeAi's
 * provider switch dynamically imports this only when the flag is set, so a
 * deploy without the flag (or without ANTHROPIC_API_KEY) is unaffected.
 *
 * Differences from the OpenAI path (per the Claude Messages API):
 *  - `system` is a top-level parameter, not a message.
 *  - NO `temperature` — it is removed on Opus 4.8 (sending it is a 400).
 *  - JSON is parsed from the reply text (Claude follows "STRICT json" reliably);
 *    we defensively strip any ```json fences.
 *
 * Returns the SAME shape as runtimeAi.chatText/chatJson so callers are agnostic.
 */
import Anthropic from '@anthropic-ai/sdk';

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) _client = new Anthropic(); // resolves ANTHROPIC_API_KEY from env
  return _client;
}

// Default to Opus 4.8; override per-env to tune cost for a high-volume coaching
// bot (e.g. MENTOR_ANTHROPIC_MODEL=claude-haiku-4-5).
//
// ⚠️ Do NOT point this at a thinking-by-default model (claude-opus-5,
// claude-sonnet-5) without raising max_tokens at the CALL SITES first. On those
// models thinking is on unless disabled, and max_tokens caps thinking + reply
// TOGETHER — while our callers pass tight budgets: 400 (architectMindsetService)
// and 500 (mentorService coach turn + reflection). Thinking would eat the budget
// and the student would get a truncated or empty answer, which reads as "the
// mentor is broken" rather than "the ceiling is too low". Opus 4.8 does not think
// unless asked, so 400-500 is all reply and these budgets are safe as-is.
// To move to Opus 5: raise those call sites, or pass thinking {type:'disabled'}
// (accepted only at effort 'high' or below).
const MENTOR_MODEL = process.env.MENTOR_ANTHROPIC_MODEL || 'claude-opus-4-8';

// $ per 1M tokens (input, output).
const PRICING: Record<string, { in: number; out: number }> = {
  'claude-opus-4-8': { in: 5, out: 25 },
  'claude-sonnet-5': { in: 3, out: 15 },
  'claude-haiku-4-5': { in: 1, out: 5 },
};
function cost(model: string, usage: { input_tokens?: number; output_tokens?: number } | undefined): number {
  const p = PRICING[model] || PRICING['claude-opus-4-8'];
  const i = usage?.input_tokens ?? 0, o = usage?.output_tokens ?? 0;
  return Number(((i * p.in + o * p.out) / 1_000_000).toFixed(6));
}

function textOf(content: Anthropic.ContentBlock[]): string {
  return (content || [])
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}
const stripFences = (s: string) => s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();

export async function anthropicChatText(
  system: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  max_tokens = 700,
) {
  const started = Date.now();
  const r = await client().messages.create({
    model: MENTOR_MODEL,
    max_tokens,
    system,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });
  return { text: textOf(r.content), runtime_ms: Date.now() - started, cost_usd: cost(MENTOR_MODEL, r.usage) };
}

export async function anthropicChatJson(system: string, user: string, max_tokens = 1200) {
  const started = Date.now();
  const r = await client().messages.create({
    model: MENTOR_MODEL,
    max_tokens,
    system: `${system}\nRespond with STRICT json only — no markdown, no code fences, no prose.`,
    messages: [{ role: 'user', content: user }],
  });
  let parsed: any = {};
  try { parsed = JSON.parse(stripFences(textOf(r.content)) || '{}'); } catch { parsed = {}; }
  return { parsed, runtime_ms: Date.now() - started, cost_usd: cost(MENTOR_MODEL, r.usage) };
}
