// ─── OpenAI Helper ─────────────────────────────────────────────────────────
// Shared OpenAI client singleton for the assistant pipeline.
// Returns null when API key is missing — callers fall back to rule-based logic.

import OpenAI from 'openai';

let _client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

const MODEL = process.env.AI_MODEL || 'gpt-4o-mini';

/**
 * Send a chat completion request.
 * Returns null if no API key or if the call fails.
 */
export async function chatCompletion(
  system: string,
  user: string,
  options?: { json?: boolean; maxTokens?: number; temperature?: number }
): Promise<string | null> {
  const client = getOpenAIClient();
  if (!client) return null;

  try {
    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: options?.maxTokens ?? 1024,
      temperature: options?.temperature ?? 0.3,
      ...(options?.json ? { response_format: { type: 'json_object' as const } } : {}),
    });

    return response.choices[0]?.message?.content || null;
  } catch (err: any) {
    console.warn('[OpenAI Helper] Chat completion failed:', err?.message?.slice(0, 200));
    return null;
  }
}
