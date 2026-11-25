/**
 * Direct-engine provider (VS2.5): the VoiceProvider the gateway dispatches through for Engine A
 * (conversation_relay) and Engine B (openai_realtime). It lives in gateway/ because only the gateway
 * may import a carrier (noDirectDispatch rule 2).
 *
 * dispatch(): the caller has ALREADY inserted the voice_calls row (webhooks and single-use tokens
 * need it). This mints the single-use answer reference and the multi-use status reference, places
 * the call through the Twilio carrier, and records the CallSid on accept. It never retries; the
 * gateway's timeout and reconciliation rules apply unchanged.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';
import type { VoiceProvider, CarrierAdapter } from '../contracts/providers';
import type { AuthorizedDispatch, DispatchResult, ProviderHealth, ProviderStatus, CanonicalCallEvent, VerifiedProviderEvent } from '../contracts/schemas';
import { createTwilioCarrier } from '../providers/twilioCarrier';
import { loadTwilioCredentials } from '../twilio/twilioCredentials';
import { mintToken } from '../twilio/correlationToken';
import { loadVoiceConfig } from '../voiceConfig';

export const TWIML_PATH = '/api/webhook/voice/twilio/twiml';
export const STATUS_PATH = '/api/webhook/voice/twilio/status';

export interface DirectProviderDeps {
  carrier: CarrierAdapter;
  publicBaseUrl: string;
  recordProviderCallId: (callId: string, sid: string) => Promise<void>;
  /** Our callId -> CallSid, for cancel/getStatus. */
  lookupSid: (callId: string) => Promise<string | null>;
}

export const twimlUrl = (base: string, callId: string, now = Date.now()): string =>
  `${new URL(TWIML_PATH, base).toString()}?ref=${encodeURIComponent(mintToken(callId, 'twiml', 600, now))}`;
export const statusUrl = (base: string, callId: string, maxDurationSeconds: number, now = Date.now()): string =>
  `${new URL(STATUS_PATH, base).toString()}?ref=${encodeURIComponent(mintToken(callId, 'status', maxDurationSeconds + 3600, now))}`;

export function createDirectEngineProvider(engine: 'conversation_relay' | 'openai_realtime', d: DirectProviderDeps): VoiceProvider {
  return {
    engine,
    async dispatch(input: AuthorizedDispatch): Promise<DispatchResult> {
      const r = await d.carrier.placeCall(input, twimlUrl(d.publicBaseUrl, input.callId));
      if (r.outcome === 'accepted') await d.recordProviderCallId(input.callId, r.providerCallId);
      return r;
    },
    async cancel(callId: string): Promise<void> {
      const sid = await d.lookupSid(callId);
      if (sid) await d.carrier.hangup(sid);
    },
    async getStatus(callId: string): Promise<ProviderStatus> {
      const sid = await d.lookupSid(callId);
      if (!sid) throw Object.assign(new Error('no CallSid recorded for this call'), { name: 'UnknownCall' });
      return d.carrier.getStatus(sid);
    },
    async normalizeEvent(input: VerifiedProviderEvent): Promise<CanonicalCallEvent[]> { return d.carrier.normalizeStatusCallback(input); },
    health(): Promise<ProviderHealth> { return d.carrier.health(); },
  };
}

/** Production wiring: Twilio credentials and the from-number from voice_numbers (active rows only). */
export function productionDirectProvider(engine: 'conversation_relay' | 'openai_realtime'): VoiceProvider | { error: string } {
  const creds = loadTwilioCredentials();
  if (!creds.ok) return { error: `twilio_credentials_invalid: ${creds.invalid.join(',')}` };
  const base = loadVoiceConfig().VOICE_PUBLIC_BASE_URL;
  if (!base) return { error: 'VOICE_PUBLIC_BASE_URL unset' };
  const carrier = createTwilioCarrier({
    creds: creds.creds,
    resolveFromNumber: async (ref) => {
      const rows = await sequelize.query<{ e164_restricted: string }>(
        "SELECT e164_restricted FROM voice_numbers WHERE provider = 'twilio' AND status = 'active' AND number_ref = :ref LIMIT 1",
        { replacements: { ref }, type: QueryTypes.SELECT });
      return rows[0]?.e164_restricted ?? null;
    },
    statusCallbackUrl: (callId) => statusUrl(base, callId, loadVoiceConfig().VOICE_TEST_MAX_DURATION_SECONDS),
  });
  return createDirectEngineProvider(engine, {
    carrier, publicBaseUrl: base,
    recordProviderCallId: async (callId, sid) => { await sequelize.query('UPDATE voice_calls SET provider_call_id = COALESCE(provider_call_id, :sid), updated_at = NOW() WHERE id = :callId', { replacements: { callId, sid } }); },
    lookupSid: async (callId) => {
      const rows = await sequelize.query<{ provider_call_id: string | null }>('SELECT provider_call_id FROM voice_calls WHERE id = :callId', { replacements: { callId }, type: QueryTypes.SELECT });
      return rows[0]?.provider_call_id ?? null;
    },
  });
}
