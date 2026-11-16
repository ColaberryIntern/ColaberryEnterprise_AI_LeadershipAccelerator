import { getInstrumentedOpenAI } from '../openaiInstrumented';

/**
 * Career Prep v27: the one way Career Prep calls a language model. Instrumented (PII redaction plus
 * an ai_events row with its cost), JSON responses, an explicit 30 s timeout and the SDK's capped
 * retries (2). Returns null without a key. Callers inject a fake `LlmCall` in tests.
 */
export type LlmCall = (promptVersion: string, system: string, user: string, maxTokens?: number) => Promise<string | null>;

export const careerPrepChat: LlmCall = async (promptVersion, system, user, maxTokens = 700) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const client = getInstrumentedOpenAI({ workflow_id: 'career-prep', prompt_version: promptVersion }, { apiKey, timeout: 30_000, maxRetries: 2 });
  const r = await client.chat.completions.create({
    model: process.env.CAREER_PREP_MODEL || process.env.AI_MODEL || 'gpt-4o-mini',
    temperature: 0.3,
    max_tokens: maxTokens,
    response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
  });
  return r.choices[0]?.message?.content ?? null;
};

/** A structured log line for a failed model call, with a stable error_class. */
export function logLlmFailure(event: string, err: unknown): void {
  const e = err as { status?: number; name?: string; message?: string };
  const errorClass = e?.status === 429 ? 'RateLimitError' : e?.status === 401 ? 'AuthError' : e?.name === 'ValidationError' ? 'ValidationError' : 'UpstreamUnavailable';
  console.warn(JSON.stringify({ timestamp: new Date().toISOString(), level: 'warn', service: 'backend', event, outcome: 'failure',
    error_class: errorClass, context: { message: String(e?.message ?? '').slice(0, 200) } }));
}
