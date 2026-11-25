import { evaluateStart, isCi, parseLiveTestRequest, worstCaseRunUsd } from '../testLabPolicy';
import { startLiveTest, testGatewayDeps, TEST_TENANT_ID, type TestLabDeps } from '../testLabService';
import { gradeManifest } from '../grade';
import { runGradeCli } from '../../../../scripts/voice/grade';
import { runLiveCli } from '../../../../scripts/voice/testLive';
import { fetchOwnedNumber, last4 } from '../../../../scripts/voice/registerNumber';
import { createDirectEngineProvider } from '../../gateway/directEngineProvider';
import { loadVoiceConfig } from '../../voiceConfig';
import type { AuthorizedDispatch, DispatchResult } from '../../contracts/schemas';
import type { CarrierAdapter, VoiceProvider } from '../../contracts/providers';

const ALLOWED = '+15555550142';
const ON = { VOICE_TEST_ENABLED: 'true', VOICE_TEST_ALLOWED_NUMBER: ALLOWED, VOICE_PUBLIC_BASE_URL: 'https://enterprise.colaberry.ai', VOICE_WS_BASE_URL: 'wss://enterprise.colaberry.ai' };
const cfg = (over: Record<string, string> = {}) => loadVoiceConfig({ ...ON, ...over });
const body = (over: Record<string, unknown> = {}) => ({ runId: 'run-20261124', destinationId: 'test-allowed', engine: 'conversation_relay', script: 'live-01', confirm: true, ...over });

/** In-memory Test Lab deps with a real serializing lock and a call table. */
function fakeDeps(over: Partial<TestLabDeps> = {}, config = cfg()) {
  const calls: Array<{ callId: string; key: string; state: string }> = [];
  const order: string[] = [];
  let chain: Promise<unknown> = Promise.resolve();
  let n = 0;
  const dispatchResult: { v: DispatchResult['outcome'] } = { v: 'accepted' };
  const deps: TestLabDeps = {
    config: () => config,
    ci: () => false,
    withLock: (fn) => { const p = chain.then(fn); chain = p.catch(() => undefined); return p; },
    countAttempts: async (runId) => calls.filter((c) => c.key.startsWith(`testlab:${runId}:`)).length,
    countInFlight: async () => calls.filter((c) => !['completed', 'failed', 'blocked'].includes(c.state)).length,
    gatewayDeps: () => ({}) as never,
    authorize: (async (req: { idempotencyKey: string; recipientRef: string; testMode: boolean }) => {
      order.push(`authorize:${req.recipientRef}:${req.testMode}`);
      const callId = `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
      return { outcome: 'authorized', replay: false, reservationId: `r${n}`, dispatch: { callId } };
    }) as never,
    insertCall: async (r) => { order.push('insert'); calls.push({ callId: r.callId, key: r.idempotencyKey, state: 'dispatching' }); },
    provider: () => ({}) as VoiceProvider,
    dispatch: (async (auth: { dispatch: { callId: string } }) => {
      order.push('dispatch');
      await new Promise((r) => setTimeout(r, 5));
      return dispatchResult.v === 'refused' ? { outcome: 'refused', callId: auth.dispatch.callId, errorClass: 'TwilioInvalidFrom', retryable: false, detail: 'x' }
        : dispatchResult.v === 'unknown' ? { outcome: 'unknown', callId: auth.dispatch.callId, errorClass: 'TimeoutError', detail: 'x' }
          : { outcome: 'accepted', callId: auth.dispatch.callId, providerCallId: 'CA' + 'a'.repeat(32), acceptedAt: new Date().toISOString() };
    }) as never,
    recordOutcome: async (callId, outcome) => { const c = calls.find((x) => x.callId === callId); if (c && outcome !== 'accepted') c.state = outcome === 'refused' ? 'failed' : 'dispatch_unknown'; },
    log: () => undefined,
    ...over,
  };
  return { deps, calls, order, dispatchResult, complete: () => calls.forEach((c) => { c.state = 'completed'; }) };
}

describe('Test Lab request policy (VS2.5)', () => {
  it.each([
    ['a raw phone number field', { phone: '+15555550142' }],
    ['a phone number as the destination', { destinationId: '555-555-0142' }],
    ['an unknown key', { to: 'x' }],
    ['no confirmation', { confirm: false }],
    ['an unknown destination id', { destinationId: 'my-cell' }],
  ])('rejects %s with 400', (_n, over) => {
    const r = parseLiveTestRequest(body(over));
    expect(r).toMatchObject({ ok: false, status: 400, errorClass: 'ValidationError' });
  });

  it('a run id with a date in it is an id, not a phone number (regression)', () => {
    expect(parseLiveTestRequest(body({ runId: 'run-20261124-live01' })).ok).toBe(true);
    expect(parseLiveTestRequest(body({ runId: '555-555-0142' })).ok).toBe(false); // all phone characters: refused
  });

  it('names the phone-number rule explicitly when a number is sent', () => {
    const r = parseLiveTestRequest(body({ phone: '(555) 555-0142' }));
    expect(!r.ok && r.issues[0]).toMatch(/phone numbers are never accepted/);
  });

  it('the 4th attempt in a run is refused; concurrency, CI, disabled, budget each refuse', () => {
    const c = cfg();
    expect(evaluateStart({ ci: false, config: c, attemptsInRun: 2, inFlight: 0 })).toMatchObject({ ok: true, attemptNumber: 3 });
    expect(evaluateStart({ ci: false, config: c, attemptsInRun: 3, inFlight: 0 })).toEqual({ ok: false, reason: 'attempts_exhausted', status: 429 });
    expect(evaluateStart({ ci: false, config: c, attemptsInRun: 0, inFlight: 1 })).toEqual({ ok: false, reason: 'another_test_in_flight', status: 409 });
    expect(evaluateStart({ ci: true, config: c, attemptsInRun: 0, inFlight: 0 })).toEqual({ ok: false, reason: 'ci_environment', status: 403 });
    expect(evaluateStart({ ci: false, config: cfg({ VOICE_TEST_ENABLED: 'false' }), attemptsInRun: 0, inFlight: 0 })).toMatchObject({ reason: 'test_mode_disabled' });
    expect(evaluateStart({ ci: false, config: cfg({ VOICE_TEST_BUDGET_USD: '0.5' }), attemptsInRun: 1, inFlight: 0 })).toEqual({ ok: false, reason: 'budget_exceeded', status: 429 });
  });

  it('worst case of a full run (3 x 180 s at the worst rate) is about $1.04, under the $5 ceiling', () => {
    expect(worstCaseRunUsd(3, 180)).toBeCloseTo(1.035, 3);
  });

  it('CI detection covers the common CI variables and ignores "false"', () => {
    expect(isCi({ CI: 'true' })).toBe(true);
    expect(isCi({ GITHUB_ACTIONS: 'true' })).toBe(true);
    expect(isCi({ CI: 'false' })).toBe(false);
    expect(isCi({})).toBe(false);
  });
});

describe('Test Lab service (VS2.5)', () => {
  it('happy path: authorize (server-side destination, test mode) -> insert the call row -> ONE dispatch', async () => {
    const f = fakeDeps();
    const r = await startLiveTest(body(), 'admin-1', f.deps);
    expect(r.status).toBe(202);
    expect(r.body).toMatchObject({ attempt: 1, outcome: 'accepted' });
    expect(f.order).toEqual(['authorize:approved-destination:test-allowed:true', 'insert', 'dispatch']);
    expect(JSON.stringify(r.body)).not.toContain(ALLOWED.slice(-7));
  });

  it('budget/attempt exhaustion: a 4th attempt in the same run is refused and never dials', async () => {
    const f = fakeDeps();
    for (let i = 0; i < 3; i++) { expect((await startLiveTest(body(), 'a', f.deps)).status).toBe(202); f.complete(); }
    const fourth = await startLiveTest(body(), 'a', f.deps);
    expect(fourth).toEqual({ status: 429, body: { error: 'TestRefused', reason: 'attempts_exhausted' } });
    expect(f.order.filter((o) => o === 'dispatch')).toHaveLength(3);
  });

  it('a concurrent second test is refused (409) while the first is in flight; only one dials', async () => {
    const f = fakeDeps();
    const [a, b] = await Promise.all([startLiveTest(body({ runId: 'run-aaaaaa' }), 'a', f.deps), startLiveTest(body({ runId: 'run-bbbbbb' }), 'b', f.deps)]);
    expect([a.status, b.status].sort()).toEqual([202, 409]);
    expect(f.order.filter((o) => o === 'dispatch')).toHaveLength(1);
  });

  it('CI refuses before anything runs', async () => {
    const f = fakeDeps({ ci: () => true });
    expect(await startLiveTest(body(), 'a', f.deps)).toMatchObject({ status: 403, body: { reason: 'ci_environment' } });
    expect(f.order).toEqual([]);
  });

  it('no automatic retry: an unknown outcome is reported once, stays "in flight", and blocks the next attempt', async () => {
    const f = fakeDeps();
    f.dispatchResult.v = 'unknown';
    const r = await startLiveTest(body(), 'a', f.deps);
    expect(r.body).toMatchObject({ outcome: 'unknown' });
    expect(f.order.filter((o) => o === 'dispatch')).toHaveLength(1);
    expect((await startLiveTest(body(), 'a', f.deps)).status).toBe(409);
  });

  it('a refused dial is recorded as failed, so it does not block the next test', async () => {
    const f = fakeDeps();
    f.dispatchResult.v = 'refused';
    expect((await startLiveTest(body(), 'a', f.deps)).status).toBe(502);
    expect(f.calls[0].state).toBe('failed');
    f.dispatchResult.v = 'accepted';
    expect((await startLiveTest(body(), 'a', f.deps)).status).toBe(202);
  });

  it('a gateway refusal (e.g. kill switch, outside hours) returns 403 and never dials', async () => {
    const f = fakeDeps({ authorize: (async () => ({ outcome: 'blocked', reason: 'kill_switch_active' })) as never });
    expect(await startLiveTest(body(), 'a', f.deps)).toEqual({ status: 403, body: { error: 'TestRefused', reason: 'kill_switch_active' } });
    expect(f.order).toEqual([]);
  });
});

describe('Test Lab gateway deps (VS2.5)', () => {
  const req = parseLiveTestRequest(body());
  if (!req.ok) throw new Error(`fixture body must parse: ${req.issues.join('; ')}`);
  const deps = testGatewayDeps(req.req, cfg());
  it('resolves ONLY the approved id to the configured number; anything else resolves to nothing', async () => {
    expect((await deps.resolveDestination('approved-destination:test-allowed')).e164).toBe(ALLOWED);
    expect((await deps.resolveDestination('lead:123')).e164).toBeNull();
    expect(await deps.exemptionFor(ALLOWED)).toBe('test');
    expect(await deps.exemptionFor('+15555550100')).toBeNull();
    expect(deps.pathAllowed('voice_studio_test')).toBe(true);
    expect(deps.pathAllowed('anything_else')).toBe(false);
    const route = await deps.resolveRoute({} as never);
    expect(route).toMatchObject({ engine: 'conversation_relay', maxDurationSeconds: 180, caps: { perDestination24h: 3 } });
  });
  it('uses its own tenant id', () => expect(TEST_TENANT_ID).toMatch(/^[0-9a-f-]{36}$/));
});

describe('direct engine provider (VS2.5)', () => {
  const dispatch = { callId: '0b1c2d3e-4f50-4617-8899-aabbccddeeff' } as AuthorizedDispatch;
  function carrier(outcome: 'accepted' | 'refused') {
    const urls: string[] = [];
    const c = { placeCall: async (_i: AuthorizedDispatch, url: string) => { urls.push(url); return outcome === 'accepted'
      ? { outcome: 'accepted', callId: dispatch.callId, providerCallId: 'CA' + 'b'.repeat(32), acceptedAt: '2026-11-24T20:00:00.000Z' }
      : { outcome: 'refused', callId: dispatch.callId, errorClass: 'TwilioInvalidFrom', retryable: false, detail: 'x' }; } } as unknown as CarrierAdapter;
    return { c, urls };
  }
  it('places the call with a signed single-use answer ref and records the CallSid on accept only', async () => {
    const recorded: string[] = [];
    const ok = carrier('accepted');
    const p = createDirectEngineProvider('conversation_relay', { carrier: ok.c, publicBaseUrl: 'https://enterprise.colaberry.ai', recordProviderCallId: async (_c, sid) => { recorded.push(sid); }, lookupSid: async () => null });
    expect((await p.dispatch(dispatch)).outcome).toBe('accepted');
    expect(ok.urls[0]).toMatch(/^https:\/\/enterprise\.colaberry\.ai\/api\/webhook\/voice\/twilio\/twiml\?ref=/);
    expect(recorded).toHaveLength(1);
    const no = carrier('refused');
    const p2 = createDirectEngineProvider('openai_realtime', { carrier: no.c, publicBaseUrl: 'https://enterprise.colaberry.ai', recordProviderCallId: async (_c, sid) => { recorded.push(sid); }, lookupSid: async () => null });
    expect((await p2.dispatch(dispatch)).outcome).toBe('refused');
    expect(recorded).toHaveLength(1);
  });
});

describe('voice:grade (VS2.5)', () => {
  it('an empty manifest exits nonzero and lists every missing artifact', () => {
    const r = runGradeCli(undefined);
    expect(r.code).toBe(1);
    expect(r.report.missing).toEqual(expect.arrayContaining(['preflightPassed', 'calls[].humanAnswered', 'calls[].disclosureHeard', 'attemptsUsed + spendUsd']));
    expect(r.report.missing).toHaveLength(8);
    expect(r.md).toMatch(/Missing artifacts:/);
  });

  const call = (over: Record<string, unknown> = {}) => ({ script: 'live-01', engine: 'conversation_relay', callSidMasked: 'CA****1a2b', humanAnswered: true, disclosureHeard: true,
    interruptionHandled: true, toolUsedOnce: true, firstResponseMs: 900, costUsd: 0.12, listenerScore: 9, ...over });
  const full = (over: Record<string, unknown> = {}) => ({ runId: 'r1', calls: [call(), call({ engine: 'openai_realtime', script: 'live-02' })], preflightPassed: true, attemptsUsed: 2, spendUsd: 0.3, ...over });

  it('a complete, good run passes with visible per-dimension math', () => {
    const r = gradeManifest(full());
    expect(r.passed).toBe(true);
    expect(r.total).toBeCloseTo(98.5, 1);
    expect(r.rows.find((x) => x.key === 'listener_quality')).toMatchObject({ weight: 15, fraction: 0.9, points: 13.5 });
  });

  it('a failed critical gate fails the run even with a high total (no AI disclosure)', () => {
    const r = gradeManifest(full({ calls: [call({ disclosureHeard: false }), call({ engine: 'openai_realtime' })] }));
    expect(r.failedGates).toEqual(['ai_disclosure']);
    expect(r.passed).toBe(false);
  });

  it('a total of exactly 90 still FAILS when a critical gate failed (preflight not passed)', () => {
    const perfect = { listenerScore: 10 };
    const r = gradeManifest(full({ preflightPassed: false, calls: [call(perfect), call({ ...perfect, engine: 'openai_realtime' })] }));
    expect(r.total).toBe(90);
    expect(r.failedGates).toEqual(['preflight']);
    expect(r.passed).toBe(false);
  });

  it('a manifest with a phone number or unknown field is invalid (strict), never graded as passing', () => {
    const r = gradeManifest(full({ phone: '+15555550142' }));
    expect(r.passed).toBe(false);
    expect(r.failedGates).toEqual(['manifest_invalid']);
  });
});

describe('voice:test:live CLI (VS2.5)', () => {
  it('refuses in CI before loading anything', async () => {
    const loader = jest.fn();
    const r = await runLiveCli(['node', 'x', '--run', 'run-123456', '--engine', 'relay', '--confirm'], { CI: 'true' }, loader);
    expect(r.code).toBe(3);
    expect(loader).not.toHaveBeenCalled();
  });

  it('without --confirm the Test Lab refuses with 400 (exit 2)', async () => {
    const f = fakeDeps();
    const r = await runLiveCli(['node', 'x', '--run', 'run-123456', '--engine', 'relay'], {}, async () => ({ start: startLiveTest, deps: f.deps }));
    expect(r.code).toBe(2);
    expect(f.order).toEqual([]);
  });
});

describe('voice:numbers:register (VS2.5)', () => {
  const creds = { accountSid: 'AC' + '1'.repeat(32), apiKeySid: 'SK' + '2'.repeat(32), apiKeySecret: 'secret-secret-secret' };
  const res = (status: number, b: unknown) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
  it('reads an owned voice number by SID; a number not on the account or without voice is refused', async () => {
    await expect(fetchOwnedNumber(creds, 'PN' + 'a'.repeat(32), (async () => res(200, { phone_number: '+15555550142', capabilities: { voice: true } })) as never)).resolves.toMatchObject({ voice: true });
    await expect(fetchOwnedNumber(creds, 'PN' + 'a'.repeat(32), (async () => res(404, {})) as never)).rejects.toMatchObject({ name: 'NumberNotOwned' });
    await expect(fetchOwnedNumber(creds, 'PN' + 'a'.repeat(32), (async () => res(200, { phone_number: '+15555550142', capabilities: { voice: false } })) as never)).resolves.toMatchObject({ voice: false });
    expect(last4('+15555550142')).toBe('***0142');
  });
});
