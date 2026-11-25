/**
 * Twilio ConversationRelay wire protocol (VS2.3), pure. Field names are taken from Twilio's
 * websocket-messages and TwiML pages (read 2026-11-24, recorded in docs/voice-studio/DECISIONS.md).
 *
 * Inbound messages are parsed with Zod at the socket boundary: anything malformed is rejected with
 * a stable error class and never reaches the session. Outbound messages are built here so the
 * engine never hand-writes protocol JSON.
 *
 * The TwiML puts NO token, prompt or PII in the WebSocket URL: the single-use session reference
 * rides in a <Parameter>, which Twilio returns inside the setup message's customParameters.
 */
import { z } from 'zod';

export const SetupMessageSchema = z.object({
  type: z.literal('setup'),
  sessionId: z.string().min(1).max(100),
  callSid: z.string().regex(/^CA[0-9a-f]{32}$/i),
  accountSid: z.string().regex(/^AC[0-9a-f]{32}$/i),
  direction: z.string().max(40).optional(),
  customParameters: z.record(z.string(), z.string()).default({}),
}).passthrough();

export const PromptMessageSchema = z.object({
  type: z.literal('prompt'),
  voicePrompt: z.string().max(4000),
  lang: z.string().max(20).optional(),
  last: z.boolean().default(true),
}).passthrough();

export const InterruptMessageSchema = z.object({
  type: z.literal('interrupt'),
  utteranceUntilInterrupt: z.string().max(8000).default(''),
  durationUntilInterruptMs: z.number().nonnegative().optional(),
}).passthrough();

export const DtmfMessageSchema = z.object({ type: z.literal('dtmf'), digit: z.string().regex(/^[0-9*#wW]$/) }).passthrough();
export const ErrorMessageSchema = z.object({ type: z.literal('error'), description: z.string().max(2000).default('') }).passthrough();
export const InfoMessageSchema = z.object({ type: z.literal('info') }).passthrough();

export const RelayInboundSchema = z.discriminatedUnion('type', [
  SetupMessageSchema, PromptMessageSchema, InterruptMessageSchema, DtmfMessageSchema, ErrorMessageSchema, InfoMessageSchema,
]);
export type RelayInbound = z.infer<typeof RelayInboundSchema>;

/** Max inbound frame we accept (Twilio states no limit; a prompt is a few KB at most). */
export const MAX_INBOUND_BYTES = 16 * 1024;

export type ParseResult = { ok: true; msg: RelayInbound } | { ok: false; errorClass: 'MalformedJson' | 'ContractViolation' | 'FrameTooLarge' };

export function parseRelayMessage(raw: string | Buffer): ParseResult {
  const text = typeof raw === 'string' ? raw : raw.toString('utf-8');
  if (Buffer.byteLength(text, 'utf-8') > MAX_INBOUND_BYTES) return { ok: false, errorClass: 'FrameTooLarge' };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, errorClass: 'MalformedJson' }; // reported by the caller with this class
  }
  const r = RelayInboundSchema.safeParse(json);
  return r.success ? { ok: true, msg: r.data } : { ok: false, errorClass: 'ContractViolation' };
}

/** One streamed token. `last: true` closes the talk cycle (Twilio speaks what it has). */
export function textToken(token: string, last: boolean): string {
  return JSON.stringify({ type: 'text', token, last });
}

/** Languages the test profile may switch to mid-call (Twilio language message). */
export const SUPPORTED_LANGUAGES: ReadonlySet<string> = new Set(['en-US', 'es-US']);

/** Switch Relay's speech recognition and voice language for the rest of the call. */
export function languageSwitch(lang: string): string {
  return JSON.stringify({ type: 'language', ttsLanguage: lang, transcriptionLanguage: lang });
}

export function endSession(handoffData?: string): string {
  return JSON.stringify(handoffData ? { type: 'end', handoffData } : { type: 'end' });
}

const xmlAttr = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export interface RelayTwimlOptions {
  wsUrl: string;
  sessionRef: string;
  welcomeGreeting: string;
  language?: string;
  voice?: string;
  /** VS3.2: signed https URL Twilio requests when the relay session ends (hand-off to a person). */
  actionUrl?: string;
}

/** <Connect><ConversationRelay> TwiML. ElevenLabs is Twilio's default ttsProvider; set explicitly for clarity. */
export function buildRelayTwiml(o: RelayTwimlOptions): string {
  if (!o.wsUrl.startsWith('wss://')) throw new Error('ConversationRelay url must be wss://');
  const attrs = [
    `url="${xmlAttr(o.wsUrl)}"`,
    `welcomeGreeting="${xmlAttr(o.welcomeGreeting)}"`,
    'welcomeGreetingInterruptible="any"',
    'ttsProvider="ElevenLabs"',
    ...(o.voice ? [`voice="${xmlAttr(o.voice)}"`] : []),
    `language="${xmlAttr(o.language ?? 'en-US')}"`,
    'interruptible="any"',
    'dtmfDetection="true"',
  ];
  if (o.actionUrl && !o.actionUrl.startsWith('https://')) throw new Error('Connect action must be https://');
  const connect = o.actionUrl ? `<Connect action="${xmlAttr(o.actionUrl)}" method="POST">` : '<Connect>';
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${connect}<ConversationRelay ${attrs.join(' ')}>`
    + `<Parameter name="ref" value="${xmlAttr(o.sessionRef)}"/></ConversationRelay></Connect></Response>`;
}
