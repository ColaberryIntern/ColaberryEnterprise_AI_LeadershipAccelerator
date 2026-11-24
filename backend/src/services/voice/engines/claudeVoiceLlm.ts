/**
 * Engine A's brain (VS2.3): one streamed Claude turn for a live phone call.
 *
 * - Streams text deltas to `onText` as they arrive (ConversationRelay speaks tokens as they come).
 * - Cancellation: the caller passes the session worker's generation AbortSignal; an interrupt aborts
 *   the HTTP stream immediately, and nothing after the abort is delivered.
 * - Latency and cost guards: effort `low`, a small max_tokens (a spoken answer is short), a 15 s
 *   request timeout and NO SDK retries (a retried answer would arrive long after the caller moved on;
 *   the session worker's thinking timeout already returns the call to listening).
 * - Refusals: server-side fallback chain (array form, the one SDK 0.106 types), so a declined turn is
 *   answered by the fallback model inside the same call; a refusal that survives the chain is reported
 *   as stopReason 'refusal' and the engine says a safe line instead.
 * - Model: VOICE_ENGINE_A_MODEL (default claude-opus-5-5). A faster/cheaper model is an owner decision.
 *
 * Errors are returned as a typed outcome with a stable error class, never thrown into the socket.
 */
import Anthropic from '@anthropic-ai/sdk';

export type VoiceToolDef = Anthropic.Beta.Messages.BetaTool;
export type VoiceMessage = Anthropic.Beta.Messages.BetaMessageParam;
export interface ToolCall { id: string; name: string; input: unknown }

export type LlmTurnResult =
  | { ok: true; stopReason: string | null; text: string; toolCalls: ToolCall[]; assistantContent: VoiceMessage['content'] }
  | { ok: false; errorClass: string; aborted: boolean };

export interface VoiceLlm {
  streamTurn(args: { system: string; messages: VoiceMessage[]; tools: VoiceToolDef[]; signal: AbortSignal; onText: (delta: string) => void }): Promise<LlmTurnResult>;
}

export const ENGINE_A_LIMITS = { maxTokens: 1024, timeoutMs: 15_000 } as const;
const FALLBACK_MODEL = 'claude-opus-4-8';

export function classifyLlmError(e: unknown, signal: AbortSignal): { errorClass: string; aborted: boolean } {
  if (signal.aborted || e instanceof Anthropic.APIUserAbortError) return { errorClass: 'Aborted', aborted: true };
  if (e instanceof Anthropic.RateLimitError) return { errorClass: 'RateLimitError', aborted: false };
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return { errorClass: 'AuthError', aborted: false };
  if (e instanceof Anthropic.APIConnectionTimeoutError) return { errorClass: 'TimeoutError', aborted: false };
  if (e instanceof Anthropic.APIConnectionError) return { errorClass: 'UpstreamUnavailable', aborted: false };
  if (e instanceof Anthropic.APIError) return { errorClass: (e.status ?? 0) >= 500 ? 'UpstreamUnavailable' : 'LlmRequestRejected', aborted: false };
  return { errorClass: 'LlmStreamError', aborted: false };
}

export function createClaudeVoiceLlm(model: string, client: Anthropic = new Anthropic({ maxRetries: 0 })): VoiceLlm {
  return {
    async streamTurn({ system, messages, tools, signal, onText }) {
      let text = '';
      try {
        const stream = client.beta.messages.stream(
          {
            model,
            max_tokens: ENGINE_A_LIMITS.maxTokens,
            system,
            messages,
            tools,
            output_config: { effort: 'low' },
            betas: ['server-side-fallback-2026-06-01'],
            fallbacks: [{ model: FALLBACK_MODEL }],
          },
          { signal, timeout: ENGINE_A_LIMITS.timeoutMs, maxRetries: 0 },
        );
        stream.on('text', (delta) => {
          if (signal.aborted) return;
          text += delta;
          onText(delta);
        });
        const msg = await stream.finalMessage();
        const toolCalls = msg.content
          .filter((b): b is Anthropic.Beta.Messages.BetaToolUseBlock => b.type === 'tool_use')
          .map((b) => ({ id: b.id, name: b.name, input: b.input }));
        return { ok: true, stopReason: msg.stop_reason, text, toolCalls, assistantContent: msg.content as VoiceMessage['content'] };
      } catch (e) {
        return { ok: false, ...classifyLlmError(e, signal) };
      }
    },
  };
}
