/**
 * OpenAI Realtime (GA) messages used by Engine B, pure (VS2.4). Event and field names are checked
 * against the installed openai SDK's own type definitions (openai 6.25, resources/realtime) and the
 * Realtime WebSocket guide (read 2026-11-24): session.update with session.type "realtime",
 * audio/pcmu in and out (no conversion), server VAD with interrupt_response, function tools.
 */
import { z } from 'zod';
import type { VoiceToolDef } from '../claudeVoiceLlm';

export interface RealtimeSessionOptions { instructions: string; voice?: string; tools: VoiceToolDef[] }

/** Map the broker's tool definitions (Anthropic shape) to Realtime function tools. */
export function toRealtimeTools(tools: VoiceToolDef[]): Array<{ type: 'function'; name: string; description: string; parameters: unknown }> {
  return tools.map((t) => ({ type: 'function', name: t.name, description: t.description ?? '', parameters: t.input_schema }));
}

/** One spoken answer, audio tokens included (about two minutes): a runaway answer cannot bill without end. */
export const MAX_OUTPUT_TOKENS = 2_048;

export function sessionUpdate(o: RealtimeSessionOptions): string {
  return JSON.stringify({
    type: 'session.update',
    session: {
      type: 'realtime',
      instructions: o.instructions,
      output_modalities: ['audio'],
      max_output_tokens: MAX_OUTPUT_TOKENS,
      audio: {
        input: { format: { type: 'audio/pcmu' }, turn_detection: { type: 'server_vad', create_response: true, interrupt_response: true } },
        output: { format: { type: 'audio/pcmu' }, ...(o.voice ? { voice: o.voice } : {}) },
      },
      tools: toRealtimeTools(o.tools),
      tool_choice: 'auto',
    },
  });
}

export const appendAudio = (b64: string): string => JSON.stringify({ type: 'input_audio_buffer.append', audio: b64 });
export const responseCreate = (instructions?: string): string => JSON.stringify(instructions ? { type: 'response.create', response: { instructions } } : { type: 'response.create' });
export const responseCancel = (responseId?: string): string => JSON.stringify(responseId ? { type: 'response.cancel', response_id: responseId } : { type: 'response.cancel' });
export const truncateItem = (itemId: string, audioEndMs: number): string =>
  JSON.stringify({ type: 'conversation.item.truncate', item_id: itemId, content_index: 0, audio_end_ms: Math.max(0, Math.floor(audioEndMs)) });
export const functionOutput = (callId: string, output: string): string =>
  JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output } });
export const userText = (text: string): string =>
  JSON.stringify({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] } });

/** The server events Engine B acts on; everything else is ignored (passthrough, not an error). */
export const RealtimeServerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('session.updated') }).passthrough(),
  z.object({ type: z.literal('input_audio_buffer.speech_started'), item_id: z.string().optional(), audio_start_ms: z.number().optional() }).passthrough(),
  z.object({ type: z.literal('response.created'), response: z.object({ id: z.string() }).passthrough() }).passthrough(),
  z.object({ type: z.literal('response.output_audio.delta'), response_id: z.string(), item_id: z.string(), delta: z.string() }).passthrough(),
  z.object({ type: z.literal('response.function_call_arguments.done'), response_id: z.string().optional(), call_id: z.string(), name: z.string(), arguments: z.string() }).passthrough(),
  z.object({ type: z.literal('response.done'), response: z.object({ id: z.string(), status: z.string().optional() }).passthrough() }).passthrough(),
  z.object({ type: z.literal('error'), error: z.object({ type: z.string().optional(), code: z.string().nullable().optional() }).passthrough() }).passthrough(),
]);
export type RealtimeServerEvent = z.infer<typeof RealtimeServerSchema>;

const HANDLED = new Set(['session.updated', 'input_audio_buffer.speech_started', 'response.created', 'response.output_audio.delta', 'response.function_call_arguments.done', 'response.done', 'error']);

export function parseRealtimeEvent(raw: string | Buffer): { ok: true; ev: RealtimeServerEvent } | { ok: true; ev: null } | { ok: false; errorClass: string } {
  let json: { type?: unknown };
  try {
    json = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf-8')) as { type?: unknown };
  } catch {
    return { ok: false, errorClass: 'MalformedJson' };
  }
  if (typeof json?.type !== 'string' || !HANDLED.has(json.type)) return { ok: true, ev: null };
  const r = RealtimeServerSchema.safeParse(json);
  return r.success ? { ok: true, ev: r.data } : { ok: false, errorClass: 'ContractViolation' };
}
