/**
 * Twilio Media Streams wire protocol (bidirectional <Connect><Stream>), pure (VS2.4). Field names
 * from twilio.com/docs/voice/media-streams/websocket-messages (read 2026-11-24): every message has a
 * top-level `event`; media is base64 mu-law 8 kHz mono with NO file header; custom <Parameter> values
 * arrive in start.customParameters; Twilio echoes a `mark` when the audio sent before it has finished
 * playing, and a `clear` empties buffered audio and returns every pending mark.
 */
import { z } from 'zod';

const sid = (prefix: string) => z.string().regex(new RegExp(`^${prefix}[0-9a-f]{32}$`, 'i'));

export const StreamInboundSchema = z.discriminatedUnion('event', [
  z.object({ event: z.literal('connected') }).passthrough(),
  z.object({
    event: z.literal('start'),
    streamSid: z.string().min(1).max(64),
    start: z.object({
      streamSid: z.string().min(1).max(64),
      callSid: sid('CA'),
      accountSid: sid('AC'),
      customParameters: z.record(z.string(), z.string()).default({}),
      mediaFormat: z.object({ encoding: z.string(), sampleRate: z.number(), channels: z.number() }).passthrough(),
    }).passthrough(),
  }).passthrough(),
  z.object({
    event: z.literal('media'),
    media: z.object({ track: z.string().optional(), payload: z.string().max(64_000), timestamp: z.union([z.string(), z.number()]).optional() }).passthrough(),
  }).passthrough(),
  z.object({ event: z.literal('mark'), mark: z.object({ name: z.string().max(200) }) }).passthrough(),
  z.object({ event: z.literal('dtmf'), dtmf: z.object({ digit: z.string().regex(/^[0-9*#]$/) }).passthrough() }).passthrough(),
  z.object({ event: z.literal('stop') }).passthrough(),
]);
export type StreamInbound = z.infer<typeof StreamInboundSchema>;

export const MAX_STREAM_FRAME_BYTES = 96 * 1024;

export function parseStreamMessage(raw: string | Buffer): { ok: true; msg: StreamInbound } | { ok: false; errorClass: 'MalformedJson' | 'ContractViolation' | 'FrameTooLarge' } {
  const text = typeof raw === 'string' ? raw : raw.toString('utf-8');
  if (Buffer.byteLength(text, 'utf-8') > MAX_STREAM_FRAME_BYTES) return { ok: false, errorClass: 'FrameTooLarge' };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, errorClass: 'MalformedJson' }; // the caller logs this class
  }
  const r = StreamInboundSchema.safeParse(json);
  return r.success ? { ok: true, msg: r.data } : { ok: false, errorClass: 'ContractViolation' };
}

/** Raw mu-law/8000 base64 only. Never a WAV header or raw binary (Twilio plays headers as noise). */
export const mediaOut = (streamSid: string, payload: string): string => JSON.stringify({ event: 'media', streamSid, media: { payload } });
export const markOut = (streamSid: string, name: string): string => JSON.stringify({ event: 'mark', streamSid, mark: { name } });
export const clearOut = (streamSid: string): string => JSON.stringify({ event: 'clear', streamSid });

const xmlAttr = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** <Connect><Stream>: bidirectional. Twilio forbids a query string on the URL; the ref rides in a Parameter. */
export function buildStreamTwiml(wsUrl: string, sessionRef: string): string {
  if (!wsUrl.startsWith('wss://')) throw new Error('Stream url must be wss://');
  if (wsUrl.includes('?')) throw new Error('Stream url must not carry a query string (Twilio does not support one)');
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Connect><Stream url="${xmlAttr(wsUrl)}">`
    + `<Parameter name="ref" value="${xmlAttr(sessionRef)}"/></Stream></Connect></Response>`;
}
