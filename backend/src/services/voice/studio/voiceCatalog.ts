/**
 * Verified voice catalog (VS3.4). Only voices a vendor page lists, with the page and the date read.
 * Nothing here is guessed: a voice that is not in this list cannot be previewed or chosen in the lab.
 *
 * Engine B (OpenAI Realtime): the 10 built-in Realtime voices; OpenAI recommends marin and cedar.
 *   https://developers.openai.com/api/docs/guides/realtime-conversations (read 2026-11-24)
 *   Previews use the text-to-speech endpoint with the same voice name. OpenAI does NOT state that a
 *   same-named voice sounds identical in TTS and Realtime, so every preview is labelled an
 *   approximation. The TTS model gpt-4o-mini-tts is deprecated (shuts down 2027-01-06).
 *   https://developers.openai.com/api/docs/guides/text-to-speech (read 2026-11-24)
 *
 * Engine A (ConversationRelay, ElevenLabs inside Twilio): Twilio documents the DEFAULT voice per
 * language and lets any ElevenLabs voice ID be configured; it lists no names. Twilio synthesizes the
 * speech inside the call, so there is no preview outside a test call.
 *   https://www.twilio.com/docs/voice/conversationrelay/voice-configuration (read 2026-11-24)
 */

export interface CatalogVoice {
  engine: 'openai_realtime' | 'conversation_relay';
  id: string;
  label: string;
  recommended: boolean;
  /** How it can be heard before a call: a text-to-speech approximation, or only on a test call. */
  preview: 'tts_approximation' | 'test_call_only';
  source: string;
}

const OPENAI_SRC = 'https://developers.openai.com/api/docs/guides/realtime-conversations (2026-11-24)';
const TWILIO_SRC = 'https://www.twilio.com/docs/voice/conversationrelay/voice-configuration (2026-11-24)';

export const REALTIME_VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse', 'marin', 'cedar'] as const;
export type RealtimeVoice = typeof REALTIME_VOICES[number];
export const RECOMMENDED_REALTIME: ReadonlySet<string> = new Set(['marin', 'cedar']);

/** Twilio's documented default ElevenLabs voice IDs for ConversationRelay, by language. */
export const RELAY_DEFAULT_VOICES: Readonly<Record<string, string>> = {
  'en-US': 'UgBBYS2sOqTuMpoF3BR0',
  'en-GB': 'Fahco4VZzobUeiPqni1S',
  'en-AU': '9Ft9sm9dzvprPILZmLJl',
  'en-IN': 'mCQMfsqGDT6IDkEKR20a',
};

export function voiceCatalog(configuredRelayVoice?: string): CatalogVoice[] {
  const realtime: CatalogVoice[] = REALTIME_VOICES.map((v) => ({
    engine: 'openai_realtime', id: v, label: v.charAt(0).toUpperCase() + v.slice(1), recommended: RECOMMENDED_REALTIME.has(v), preview: 'tts_approximation', source: OPENAI_SRC,
  }));
  const relay: CatalogVoice[] = Object.entries(RELAY_DEFAULT_VOICES).map(([lang, id]) => ({
    engine: 'conversation_relay', id, label: `Twilio default (${lang})`, recommended: lang === 'en-US', preview: 'test_call_only', source: TWILIO_SRC,
  }));
  if (configuredRelayVoice) {
    const id = configuredRelayVoice.split('-')[0];
    if (!relay.some((r) => r.id === id)) relay.unshift({ engine: 'conversation_relay', id, label: 'Configured voice (VOICE_RELAY_VOICE)', recommended: false, preview: 'test_call_only', source: 'server setting' });
  }
  return [...realtime, ...relay];
}

export const isPreviewable = (voice: string): voice is RealtimeVoice => (REALTIME_VOICES as readonly string[]).includes(voice);
