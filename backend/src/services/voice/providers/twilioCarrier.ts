/**
 * Twilio carrier adapter (VS2.1): places, ends and reads calls on OUR Twilio account through the
 * REST Calls API. Only the Voice Gateway may import it (noDirectDispatch rule 2); it is one of the
 * sanctioned dispatch files (rule 1). It never decides WHETHER to call: it receives an
 * AuthorizedDispatch the gateway minted after policy + the atomic reservation.
 *
 * Failure-first:
 *   - Explicit timeout (default 10 s) on every request through AbortController.
 *   - NO retry of a create. A timeout, network error, 5xx or a 2xx without a CallSid returns
 *     `unknown` (the call may exist): the gateway marks the reservation ambiguous and a reconciler
 *     decides; redialing is never automatic.
 *   - A 4xx means Twilio created nothing: `refused`, with a stable error class from Twilio's code.
 *   - Error detail is `status=<http> twilio_code=<n>` only. Twilio's message text can echo a phone
 *     number, so it is never copied into a result or a log.
 * Handled: timeout, network failure, 4xx (incl. 429 and 32204 caller-ID), 5xx, malformed JSON,
 * success with the wrong shape. Not handled here: reconciliation of `unknown` (gateway/reconciler).
 */
import type { CarrierAdapter } from '../contracts/providers';
import type { AuthorizedDispatch, DispatchResult, ProviderHealth, ProviderStatus, VerifiedProviderEvent, CanonicalCallEvent } from '../contracts/schemas';
import type { TwilioCredentials } from '../twilio/twilioCredentials';
import { mapAnsweredBy, mapTwilioCallStatus, twilioStatusToEvents } from '../twilio/twilioStatusMap';

const API = 'https://api.twilio.com/2010-04-01';

export interface TwilioCarrierDeps {
  creds: TwilioCredentials;
  /** Resolve the gateway's fromNumberRef to an owned E.164 number (voice_numbers), or null. */
  resolveFromNumber: (fromNumberRef: string) => Promise<string | null>;
  /** Signed status-callback URL for this call (purpose `status`). */
  statusCallbackUrl: (callId: string) => string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Seconds Twilio lets the phone ring before no-answer. */
  ringTimeoutSeconds?: number;
}

export class TwilioRequestError extends Error {
  constructor(readonly errorClass: string, readonly httpStatus: number | null, readonly twilioCode: number | null) {
    super(`${errorClass} status=${httpStatus ?? 'none'} twilio_code=${twilioCode ?? 'none'}`);
  }
}

/** Twilio error code -> stable error class. Unlisted 4xx codes fall back to TwilioRejected. */
export function classifyTwilioError(httpStatus: number, code: number | null): string {
  if (httpStatus === 401 || code === 20003) return 'AuthError';
  if (httpStatus === 429 || code === 20429) return 'RateLimitError';
  if (code === 21211 || code === 21214 || code === 21217) return 'TwilioInvalidTo';
  if (code === 21210 || code === 21212 || code === 32204) return 'TwilioInvalidFrom';
  if (code === 21215 || code === 21216) return 'TwilioGeoPermission';
  if (httpStatus >= 500) return 'UpstreamUnavailable';
  return 'TwilioRejected';
}

async function readJson(res: Response): Promise<Record<string, unknown> | null> {
  try {
    const v = await res.json();
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null; // a non-JSON body is reported through the shape checks below, never thrown
  }
}

export function createTwilioCarrier(deps: TwilioCarrierDeps): CarrierAdapter {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? 10_000;
  const auth = 'Basic ' + Buffer.from(`${deps.creds.apiKeySid}:${deps.creds.apiKeySecret}`).toString('base64');
  const callsUrl = `${API}/Accounts/${deps.creds.accountSid}/Calls`;

  async function request(method: 'GET' | 'POST', url: string, form?: URLSearchParams): Promise<Response> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      return await fetchImpl(url, {
        method,
        headers: { Authorization: auth, ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
        body: form ? form.toString() : undefined,
        signal: ctl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async placeCall(input: AuthorizedDispatch, twimlUrl: string): Promise<DispatchResult> {
      const callId = input.callId;
      const from = await deps.resolveFromNumber(input.fromNumberRef);
      if (!from) return { outcome: 'refused', callId, errorClass: 'FromNumberUnavailable', retryable: false, detail: 'fromNumberRef did not resolve to an owned active number' };
      const form = new URLSearchParams({
        To: input.destinationE164, From: from, Url: twimlUrl, Method: 'POST',
        StatusCallback: deps.statusCallbackUrl(callId), StatusCallbackMethod: 'POST',
        Timeout: String(deps.ringTimeoutSeconds ?? 25), TimeLimit: String(input.maxDurationSeconds),
      });
      for (const e of ['initiated', 'ringing', 'answered', 'completed']) form.append('StatusCallbackEvent', e);
      let res: Response;
      try {
        res = await request('POST', `${callsUrl}.json`, form);
      } catch (e) {
        const timedOut = (e as { name?: string })?.name === 'AbortError';
        return { outcome: 'unknown', callId, errorClass: timedOut ? 'TimeoutError' : 'UpstreamUnavailable', detail: timedOut ? `no response within ${timeoutMs} ms` : 'network error before a response' };
      }
      const body = await readJson(res);
      const code = typeof body?.code === 'number' ? body.code : null;
      if (res.status >= 200 && res.status < 300) {
        const sid = typeof body?.sid === 'string' && /^CA[0-9a-f]{32}$/i.test(body.sid) ? body.sid : null;
        if (!sid) return { outcome: 'unknown', callId, errorClass: 'ContractViolation', detail: `status=${res.status} success without a CallSid` };
        return { outcome: 'accepted', callId, providerCallId: sid, acceptedAt: new Date().toISOString() };
      }
      const errorClass = classifyTwilioError(res.status, code);
      const detail = `status=${res.status} twilio_code=${code ?? 'none'}`;
      if (res.status >= 500) return { outcome: 'unknown', callId, errorClass, detail };
      return { outcome: 'refused', callId, errorClass, retryable: errorClass === 'RateLimitError', detail };
    },

    async hangup(providerCallId: string): Promise<void> {
      const res = await request('POST', `${callsUrl}/${encodeURIComponent(providerCallId)}.json`, new URLSearchParams({ Status: 'completed' }));
      if (res.status === 404) return; // already gone: the end state we wanted
      if (res.status < 200 || res.status >= 300) {
        const body = await readJson(res);
        const code = typeof body?.code === 'number' ? body.code : null;
        throw new TwilioRequestError(classifyTwilioError(res.status, code), res.status, code);
      }
    },

    async getStatus(providerCallId: string): Promise<ProviderStatus> {
      const res = await request('GET', `${callsUrl}/${encodeURIComponent(providerCallId)}.json`);
      const body = await readJson(res);
      const code = typeof body?.code === 'number' ? body.code : null;
      if (res.status < 200 || res.status >= 300) throw new TwilioRequestError(classifyTwilioError(res.status, code), res.status, code);
      const state = mapTwilioCallStatus(body?.status);
      if (!state) throw new TwilioRequestError('ContractViolation', res.status, null);
      const out: ProviderStatus = { providerCallId, state, observedAt: new Date().toISOString() };
      const answeredBy = mapAnsweredBy(body?.answered_by);
      if (answeredBy) out.answeredBy = answeredBy;
      const dur = Number(body?.duration);
      if (Number.isInteger(dur) && dur >= 0) out.durationSeconds = dur;
      return out;
    },

    normalizeStatusCallback(input: VerifiedProviderEvent): CanonicalCallEvent[] {
      const callId = typeof input.payload.voiceCallId === 'string' ? input.payload.voiceCallId : null;
      return callId ? twilioStatusToEvents(callId, input.payload, input.receivedAt) : [];
    },

    async health(): Promise<ProviderHealth> {
      const t0 = Date.now();
      const checkedAt = new Date().toISOString();
      try {
        const res = await request('GET', `${API}/Accounts/${deps.creds.accountSid}.json`);
        const body = await readJson(res);
        const ok = res.status === 200 && body?.status === 'active';
        return { provider: 'twilio', ok, checkedAt, latencyMs: Date.now() - t0, ...(ok ? {} : { errorClass: res.status === 200 ? 'AccountInactive' : classifyTwilioError(res.status, null) }) };
      } catch (e) {
        return { provider: 'twilio', ok: false, checkedAt, latencyMs: Date.now() - t0, errorClass: (e as { name?: string })?.name === 'AbortError' ? 'TimeoutError' : 'UpstreamUnavailable' };
      }
    },
  };
}
