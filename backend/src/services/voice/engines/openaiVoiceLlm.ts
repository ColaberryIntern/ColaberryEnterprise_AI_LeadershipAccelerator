/**
 * Engine A's brain on OpenAI (owner decision 2026-11-28: one OpenAI key for both engines, no Anthropic key).
 *
 * The same contract as claudeVoiceLlm.ts, so the engine, tool broker and session worker do not change:
 * messages and tools arrive in the Claude shape the engine already keeps, are translated to Chat Completions,
 * and the answer goes back as Claude-shaped content (text and tool_use blocks).
 *
 * - Streams text deltas to `onText` as they arrive; after an abort nothing more is delivered.
 * - Same guards as the Claude path: a small max tokens, a 15 s request timeout, NO SDK retries (a retried
 *   answer would arrive long after the caller moved on; the session worker's thinking timeout already returns
 *   the call to listening).
 * - A refusal is reported as stopReason 'refusal' and the engine says its safe line.
 * - Tool arguments that are not a JSON object are a ContractViolation, never a guessed call.
 * - The client is made on the first turn, so a missing key is that turn's ConfigMissing, not a crash while the
 *   call is being set up.
 * Errors are returned as a typed outcome with a stable error class, never thrown into the socket.
 */
import OpenAI from 'openai';
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';
import { ENGINE_A_LIMITS, type LlmTurnResult, type ToolCall, type VoiceLlm, type VoiceMessage, type VoiceToolDef } from './claudeVoiceLlm';

const STOP: Record<string, string> = { stop: 'end_turn', tool_calls: 'tool_use', length: 'max_tokens', content_filter: 'refusal' };
const bad = (m: string) => Object.assign(new Error(m), { name: 'ContractViolation' });

export function toOpenAiTools(tools: readonly VoiceToolDef[]): ChatCompletionTool[] {
  return tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema as Record<string, unknown> } }));
}

type Block = { type: string; [k: string]: unknown };
const textOf = (c: unknown): string => (typeof c === 'string' ? c : Array.isArray(c) ? (c as Block[]).filter((b) => b.type === 'text').map((b) => String(b.text ?? '')).join('') : '');

/** Claude-shaped history to Chat Completions. A tool result becomes its own 'tool' message, as OpenAI requires. */
export function toOpenAiMessages(system: string, messages: readonly VoiceMessage[]): ChatCompletionMessageParam[] {
  const out: ChatCompletionMessageParam[] = [{ role: 'system', content: system }];
  for (const m of messages) {
    if (typeof m.content === 'string') { out.push({ role: m.role, content: m.content }); continue; }
    const blocks = m.content as unknown as Block[];
    if (m.role === 'assistant') {
      const calls = blocks.filter((b) => b.type === 'tool_use').map((b) => ({ id: String(b.id), type: 'function' as const, function: { name: String(b.name), arguments: JSON.stringify(b.input ?? {}) } }));
      const text = textOf(blocks);
      out.push({ role: 'assistant', content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
      continue;
    }
    for (const b of blocks) if (b.type === 'tool_result') out.push({ role: 'tool', tool_call_id: String(b.tool_use_id), content: textOf(b.content) || (b.is_error ? 'error' : '') });
    const text = textOf(blocks);
    if (text) out.push({ role: 'user', content: text });
    for (const b of blocks) if (!['text', 'tool_result'].includes(b.type)) throw bad(`unsupported block ${b.type}`);
  }
  return out;
}

export function classifyOpenAiError(e: unknown, signal: AbortSignal): { errorClass: string; aborted: boolean } {
  if (signal.aborted || e instanceof OpenAI.APIUserAbortError) return { errorClass: 'Aborted', aborted: true };
  if ((e as Error)?.name === 'ContractViolation' || (e as Error)?.name === 'ConfigMissing') return { errorClass: (e as Error).name, aborted: false };
  if (e instanceof OpenAI.RateLimitError) return { errorClass: 'RateLimitError', aborted: false };
  if (e instanceof OpenAI.AuthenticationError || e instanceof OpenAI.PermissionDeniedError) return { errorClass: 'AuthError', aborted: false };
  if (e instanceof OpenAI.APIConnectionTimeoutError) return { errorClass: 'TimeoutError', aborted: false };
  if (e instanceof OpenAI.APIConnectionError) return { errorClass: 'UpstreamUnavailable', aborted: false };
  if (e instanceof OpenAI.APIError) return { errorClass: (e.status ?? 0) >= 500 ? 'UpstreamUnavailable' : 'LlmRequestRejected', aborted: false };
  return { errorClass: 'LlmStreamError', aborted: false };
}

type ChatClient = Pick<OpenAI, 'chat'>;

const defaultClient = (): ChatClient => {
  if (!process.env.OPENAI_API_KEY) throw Object.assign(new Error('OPENAI_API_KEY is not set'), { name: 'ConfigMissing' });
  return new OpenAI({ maxRetries: 0 });
};

export function createOpenAiVoiceLlm(model: string, makeClient: () => ChatClient = defaultClient): VoiceLlm {
  let client: ChatClient | undefined;
  return {
    async streamTurn({ system, messages, tools, signal, onText }): Promise<LlmTurnResult> {
      let text = '';
      try {
        client = client ?? makeClient();
        const stream = await client.chat.completions.create(
          { model, stream: true, max_completion_tokens: ENGINE_A_LIMITS.maxTokens, messages: toOpenAiMessages(system, messages), ...(tools.length ? { tools: toOpenAiTools(tools), parallel_tool_calls: false } : {}) },
          { signal, timeout: ENGINE_A_LIMITS.timeoutMs, maxRetries: 0 },
        );
        const calls = new Map<number, { id: string; name: string; args: string }>();
        let finish: string | null = null;
        let refused = false;
        for await (const chunk of stream) {
          if (signal.aborted) break;
          const ch = chunk.choices[0];
          if (!ch) continue;
          const d = ch.delta ?? {};
          if (d.refusal) refused = true;
          if (d.content) { text += d.content; onText(d.content); }
          for (const t of d.tool_calls ?? []) {
            const c = calls.get(t.index) ?? { id: '', name: '', args: '' };
            calls.set(t.index, { id: t.id ?? c.id, name: t.function?.name ?? c.name, args: c.args + (t.function?.arguments ?? '') });
          }
          if (ch.finish_reason) finish = ch.finish_reason;
        }
        if (signal.aborted) return { ok: false, errorClass: 'Aborted', aborted: true };
        const toolCalls: ToolCall[] = [...calls.entries()].sort((a, b) => a[0] - b[0]).map(([, c]) => {
          let input: unknown;
          try { input = JSON.parse(c.args || '{}'); } catch { throw bad('tool arguments are not JSON'); }
          if (!c.id || !c.name || !input || typeof input !== 'object' || Array.isArray(input)) throw bad('malformed tool call');
          return { id: c.id, name: c.name, input };
        });
        const content = [...(text ? [{ type: 'text', text }] : []), ...toolCalls.map((c) => ({ type: 'tool_use', id: c.id, name: c.name, input: c.input }))];
        const stopReason = refused ? 'refusal' : finish ? STOP[finish] ?? finish : null;
        return { ok: true, stopReason, text, toolCalls, assistantContent: content as unknown as VoiceMessage['content'] };
      } catch (e) {
        return { ok: false, ...classifyOpenAiError(e, signal) };
      }
    },
  };
}
