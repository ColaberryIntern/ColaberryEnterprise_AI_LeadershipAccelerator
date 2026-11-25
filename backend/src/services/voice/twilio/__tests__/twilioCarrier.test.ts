import { createTwilioCarrier, classifyTwilioError } from '../../providers/twilioCarrier';
import type { AuthorizedDispatch } from '../../contracts/schemas';

const CALL = '0b1c2d3e-4f50-4617-8899-aabbccddeeff';
const SID = 'CA' + 'b2'.repeat(16);
const creds = { accountSid: 'AC' + '1'.repeat(32), apiKeySid: 'SK' + '2'.repeat(32), apiKeySecret: 'secret-secret-secret' };
const dispatch: AuthorizedDispatch = {
  contractVersion: 1, callId: CALL, reservationId: '1b1c2d3e-4f50-4617-8899-aabbccddeeff', engine: 'conversation_relay', routeId: 'r1',
  profileVersionId: 'v1', destinationE164: '+15555550100', fromNumberRef: 'num-1', maxDurationSeconds: 180, testMode: true, authorizedAt: '2026-11-24T20:00:00.000Z',
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function carrier(fetchImpl: jest.Mock, from: string | null = '+15555550199', timeoutMs = 50) {
  return createTwilioCarrier({ creds, fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs, resolveFromNumber: async () => from, statusCallbackUrl: (id) => `https://x.test/status?ref=${id}` });
}

describe('Twilio carrier (VS2.1)', () => {
  it('accepted: POSTs the Calls API with status callbacks, time limit and API-key auth', async () => {
    const f = jest.fn().mockResolvedValue(json(201, { sid: SID, status: 'queued' }));
    const r = await carrier(f).placeCall(dispatch, 'https://x.test/twiml?ref=t');
    expect(r).toMatchObject({ outcome: 'accepted', callId: CALL, providerCallId: SID });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe(`https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/Calls.json`);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Basic ' + Buffer.from(`${creds.apiKeySid}:${creds.apiKeySecret}`).toString('base64'));
    const form = new URLSearchParams(init.body);
    expect(form.get('To')).toBe('+15555550100');
    expect(form.get('From')).toBe('+15555550199');
    expect(form.get('Url')).toBe('https://x.test/twiml?ref=t');
    expect(form.get('StatusCallback')).toBe(`https://x.test/status?ref=${CALL}`);
    expect(form.getAll('StatusCallbackEvent')).toEqual(['initiated', 'ringing', 'answered', 'completed']);
    expect(form.get('TimeLimit')).toBe('180');
  });

  it('refuses without calling Twilio when the from number does not resolve', async () => {
    const f = jest.fn();
    expect(await carrier(f, null).placeCall(dispatch, 'u')).toMatchObject({ outcome: 'refused', errorClass: 'FromNumberUnavailable' });
    expect(f).not.toHaveBeenCalled();
  });

  it.each([
    [400, 21211, 'TwilioInvalidTo', false],
    [400, 21212, 'TwilioInvalidFrom', false],
    [400, 32204, 'TwilioInvalidFrom', false],
    [400, 21215, 'TwilioGeoPermission', false],
    [401, 20003, 'AuthError', false],
    [429, 20429, 'RateLimitError', true],
    [400, 99999, 'TwilioRejected', false],
  ])('HTTP %i code %i -> refused %s (Twilio created nothing)', async (status, code, cls, retryable) => {
    const f = jest.fn().mockResolvedValue(json(status, { code, message: 'The number +15555550100 is unverified' }));
    const r = await carrier(f).placeCall(dispatch, 'u');
    expect(r).toMatchObject({ outcome: 'refused', errorClass: cls, retryable });
    expect(JSON.stringify(r)).not.toContain('5555550100'); // Twilio's message text is never copied
  });

  it.each([
    ['a 5xx', () => Promise.resolve(json(503, { code: 20500 })), 'UpstreamUnavailable'],
    ['a network error', () => Promise.reject(new TypeError('fetch failed')), 'UpstreamUnavailable'],
    ['success without a CallSid', () => Promise.resolve(json(201, { status: 'queued' })), 'ContractViolation'],
    ['success with a non-JSON body', () => Promise.resolve(new Response('<html>', { status: 200 })), 'ContractViolation'],
  ])('%s -> unknown (the call may exist: reconcile, never redial)', async (_n, impl, cls) => {
    const r = await carrier(jest.fn().mockImplementation(impl)).placeCall(dispatch, 'u');
    expect(r).toMatchObject({ outcome: 'unknown', errorClass: cls });
  });

  it('a hung request times out -> unknown TimeoutError, and is never retried', async () => {
    const f = jest.fn().mockImplementation((_u, init: RequestInit) => new Promise((_res, rej) => init.signal!.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })))));
    const r = await carrier(f, '+15555550199', 20).placeCall(dispatch, 'u');
    expect(r).toMatchObject({ outcome: 'unknown', errorClass: 'TimeoutError' });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('hangup: posts Status=completed; a 404 (already gone) is success; other errors throw a typed error', async () => {
    const ok = jest.fn().mockResolvedValue(json(200, { sid: SID, status: 'completed' }));
    await carrier(ok).hangup(SID);
    expect(new URLSearchParams(ok.mock.calls[0][1].body).get('Status')).toBe('completed');
    await expect(carrier(jest.fn().mockResolvedValue(json(404, { code: 20404 }))).hangup(SID)).resolves.toBeUndefined();
    await expect(carrier(jest.fn().mockResolvedValue(json(401, { code: 20003 }))).hangup(SID)).rejects.toMatchObject({ errorClass: 'AuthError' });
  });

  it('getStatus maps state, answered_by and duration', async () => {
    const f = jest.fn().mockResolvedValue(json(200, { sid: SID, status: 'completed', answered_by: 'human', duration: '42' }));
    expect(await carrier(f).getStatus(SID)).toMatchObject({ providerCallId: SID, state: 'completed', answeredBy: 'human', durationSeconds: 42 });
    await expect(carrier(jest.fn().mockResolvedValue(json(200, { status: '??' }))).getStatus(SID)).rejects.toMatchObject({ errorClass: 'ContractViolation' });
  });

  it('normalizeStatusCallback needs the verified callId the ingress attached', () => {
    const c = carrier(jest.fn());
    const payload = { CallSid: SID, CallStatus: 'ringing', SequenceNumber: '1' };
    expect(c.normalizeStatusCallback({ provider: 'twilio', verifiedBy: 'twilio_signature', receivedAt: '2026-11-24T20:00:00.000Z', payload })).toEqual([]);
    expect(c.normalizeStatusCallback({ provider: 'twilio', verifiedBy: 'twilio_signature', receivedAt: '2026-11-24T20:00:00.000Z', payload: { ...payload, voiceCallId: CALL } })[0]).toMatchObject({ state: 'ringing', callId: CALL });
  });

  it('health: ok only for an active account; reports an error class otherwise', async () => {
    expect(await carrier(jest.fn().mockResolvedValue(json(200, { status: 'active' }))).health()).toMatchObject({ provider: 'twilio', ok: true });
    expect(await carrier(jest.fn().mockResolvedValue(json(200, { status: 'suspended' }))).health()).toMatchObject({ ok: false, errorClass: 'AccountInactive' });
    expect(await carrier(jest.fn().mockRejectedValue(new TypeError('x'))).health()).toMatchObject({ ok: false, errorClass: 'UpstreamUnavailable' });
  });

  it('classifyTwilioError: 5xx is UpstreamUnavailable', () => expect(classifyTwilioError(502, null)).toBe('UpstreamUnavailable'));
});
