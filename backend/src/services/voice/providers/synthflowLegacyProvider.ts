/**
 * Legacy Synthflow provider (VS1.6): today's Synthflow dial, wrapped as a VoiceProvider so it can sit
 * behind the Voice Gateway during migration. Used ONLY by the triggerVoiceCall facade when
 * VOICE_GATEWAY_LEGACY_ENABLED is on; with the flag off, synthflowService dials exactly as before.
 *
 * The Synthflow request body (agent, prompt, custom variables, webhook URL) is built by
 * synthflowService exactly as today and handed to this provider per call; the provider only
 * overrides `phone` with the gateway-authorized destination, so the number dialed is always the
 * one the gateway admitted.
 *
 * Outcome mapping (directive: never redial an ambiguous dispatch):
 *  - HTTP 2xx           -> accepted (providerCallId = Synthflow call_id when present)
 *  - HTTP non-2xx       -> refused (Synthflow answered and created no call)
 *  - timeout / throw    -> unknown (the request may have reached Synthflow; the gateway keeps the
 *                          reservation ambiguous and never retries)
 * The raw Synthflow response is kept on `lastResponse` so the facade can return today's exact shape.
 */
import type { AuthorizedDispatch, DispatchResult, ProviderHealth, ProviderStatus, CanonicalCallEvent, VerifiedProviderEvent } from '../contracts/schemas';
import type { VoiceProvider } from '../contracts/providers';

export const SYNTHFLOW_CALLS_URL = 'https://api.synthflow.ai/v2/calls';
export const SYNTHFLOW_TIMEOUT_MS = 15_000;

export interface SynthflowRawResponse {
  ok: boolean;
  status?: number;
  raw?: string;
  data?: Record<string, unknown>;
  errorMessage?: string;
}

export interface SynthflowLegacyProvider extends VoiceProvider {
  /** The last raw Synthflow response, for the facade's legacy result shape. */
  lastResponse: SynthflowRawResponse | null;
}

export function extractSynthflowCallId(d: Record<string, unknown>): string | null {
  const nested = (d.data && typeof d.data === 'object' ? d.data : {}) as Record<string, unknown>;
  const id = d.call_id ?? d.id ?? d._id ?? nested.call_id ?? nested.id ?? null;
  return id == null ? null : String(id);
}

export function createSynthflowLegacyProvider(apiKey: string, requestBody: Record<string, unknown>, fetchImpl: typeof fetch = fetch): SynthflowLegacyProvider {
  const provider: SynthflowLegacyProvider = {
    engine: 'synthflow_legacy',
    lastResponse: null,
    async dispatch(input: AuthorizedDispatch): Promise<DispatchResult> {
      try {
        const response = await fetchImpl(SYNTHFLOW_CALLS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ ...requestBody, phone: input.destinationE164 }),
          signal: AbortSignal.timeout(SYNTHFLOW_TIMEOUT_MS),
        });
        const raw = await response.text();
        let data: Record<string, unknown> = {};
        try { const parsed: unknown = JSON.parse(raw); if (parsed && typeof parsed === 'object') data = parsed as Record<string, unknown>; } catch { /* non-JSON body kept in raw */ }
        provider.lastResponse = { ok: response.ok, status: response.status, raw, data };
        if (!response.ok) {
          return { outcome: 'refused', callId: input.callId, errorClass: `SynthflowHttp${response.status}`, retryable: false, detail: `Synthflow HTTP ${response.status}` };
        }
        return { outcome: 'accepted', callId: input.callId, providerCallId: extractSynthflowCallId(data) ?? `synthflow-no-id-${input.callId}`, acceptedAt: new Date().toISOString() };
      } catch (err) {
        provider.lastResponse = { ok: false, errorMessage: err instanceof Error ? err.message : String(err) };
        return { outcome: 'unknown', callId: input.callId, errorClass: err instanceof Error ? err.constructor.name : 'UnknownError', detail: 'Synthflow request did not complete' };
      }
    },
    async cancel(): Promise<void> { throw new Error('synthflow_legacy: cancel is not supported'); },
    async getStatus(): Promise<ProviderStatus> { throw new Error('synthflow_legacy: use fetchSynthflowCall for status'); },
    async normalizeEvent(_input: VerifiedProviderEvent): Promise<CanonicalCallEvent[]> { return []; },
    async health(): Promise<ProviderHealth> { return { provider: 'synthflow_legacy', ok: Boolean(apiKey), checkedAt: new Date().toISOString() }; },
  };
  return provider;
}
