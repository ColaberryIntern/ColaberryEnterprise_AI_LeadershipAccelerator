// ─── OpenAI Helper ─────────────────────────────────────────────────────────
// Shared OpenAI client singleton for the assistant pipeline.
// Returns null when API key is missing — callers fall back to rule-based logic.

import OpenAI from 'openai';
import type { ChatCompletionMessageParam, ChatCompletionTool, ChatCompletion } from 'openai/resources/chat/completions';

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

/**
 * Send a chat completion request with tool/function calling support.
 * Used by the Cory agentic engine for iterative tool-calling loops.
 * Throws on failure (caller handles retry/fallback).
 */
export async function chatCompletionWithTools(
  messages: ChatCompletionMessageParam[],
  tools: ChatCompletionTool[],
  options?: { maxTokens?: number; temperature?: number; json?: boolean }
): Promise<ChatCompletion> {
  const client = getOpenAIClient();
  if (!client) throw new Error('OpenAI API key not configured');

  return client.chat.completions.create({
    model: MODEL,
    messages,
    tools,
    max_tokens: options?.maxTokens ?? 1500,
    temperature: options?.temperature ?? 0.2,
    ...(options?.json ? { response_format: { type: 'json_object' as const } } : {}),
  });
}

export { MODEL };
export type { ChatCompletionMessageParam, ChatCompletionTool, ChatCompletion };
