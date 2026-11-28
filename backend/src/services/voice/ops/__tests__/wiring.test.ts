/**
 * VS4.3: the guards, metrics and sweep are really on the production path, not only correct in isolation.
 * Each test removes nothing and mocks only the provider or the database at the far end.
 */
const streamTurn = jest.fn();
jest.mock('../../engines/claudeVoiceLlm', () => ({ ...jest.requireActual('../../engines/claudeVoiceLlm'), createClaudeVoiceLlm: () => ({ streamTurn: (...a: unknown[]) => streamTurn(...a) }) }));
jest.mock('../../engines/openaiVoiceLlm', () => ({ ...jest.requireActual('../../engines/openaiVoiceLlm'), createOpenAiVoiceLlm: () => ({ streamTurn: (...a: unknown[]) => streamTurn(...a) }) }));
const sockets: Array<{ handlers: Record<string, (...a: unknown[]) => void>; fire(e: string, ...a: unknown[]): void }> = [];
const socketThrows = { on: false };
jest.mock('ws', () => {
  const real = jest.requireActual('ws');
  class FakeWs {
    static OPEN = 1; OPEN = 1; CONNECTING = 0; readyState = 0; handlers: Record<string, (...a: unknown[]) => void> = {};
    constructor() { if (socketThrows.on) throw Object.assign(new Error('bad header'), { name: 'TypeError' }); sockets.push(this as never); }
    on(e: string, f: (...a: unknown[]) => void) { this.handlers[e] = f; }
    fire(e: string, ...a: unknown[]) { this.handlers[e]?.(...a); }
    send() { /* nothing */ }
    close() { /* nothing */ }
  }
  return { __esModule: true, default: FakeWs, WebSocketServer: real.WebSocketServer };
});
const query = jest.fn();
const runOpsSweep = jest.fn().mockResolvedValue([]);
jest.mock('../opsSweep', () => ({ runOpsSweep: () => runOpsSweep() }));
const reconcileOptOuts = jest.fn().mockResolvedValue(0);
jest.mock('../../optout/optOut', () => ({ ...jest.requireActual('../../optout/optOut'), reconcileOptOuts: () => reconcileOptOuts() }));
const reconcileDirect = jest.fn().mockResolvedValue(0);
jest.mock('../../postcall/directCompletionRuntime', () => ({ reconcileDirectCompletions: () => reconcileDirect(), completeDirectCall: jest.fn(), rememberTranscript: jest.fn() }));
const append = jest.fn().mockResolvedValue({ inserted: 1 });
const recompute = jest.fn().mockResolvedValue(null);
jest.mock('../../twilio/voiceCallStore', () => ({ appendCallEvents: (...a: unknown[]) => append(...a), recomputeCall: (...a: unknown[]) => recompute(...a), consumeToken: jest.fn(), isOwnedActiveNumber: jest.fn() }));
jest.mock('../../../calendarService', () => ({ getAvailableSlots: jest.fn() }));

import http from 'http';
import { sequelize } from '../../../../config/database';
import { defaultVoiceWebhookDeps } from '../../../../controllers/voiceTwilioWebhookController';
import { defaultTransferDeps } from '../../../../controllers/voiceTransferController';
import { connectTwimlFor, installVoiceRuntime, POSTCALL_SWEEP_MS, realtimeDeps, recordSessionStarted, relayDeps, sweepOnce } from '../../engines/voiceRuntime';
import { productionDirectProvider } from '../../gateway/directEngineProvider';
import { RealtimeBridge } from '../../engines/realtime/openaiRealtimeEngine';
import { RelayConnection } from '../../engines/conversationRelayEngine';
import { ToolBroker } from '../../engines/toolBroker';
import { SessionWorker } from '../../session/sessionWorker';
import { correlationKey, mintToken } from '../../twilio/correlationToken';
import { pinSession } from '../../rollout/callSessions';
import { OpsMetrics, voiceOps } from '../opsMetrics';
import { guardLlm, guardRealtime, REALTIME_SLOW_MS, realtimeAvailable } from '../providerGuards';

const was = { ...process.env };
const ACCOUNT = 'AC' + 'a1'.repeat(16);
const SID = 'CA' + 'b2'.repeat(16);
const turn = { system: '', messages: [], tools: [], signal: new AbortController().signal, onText: () => undefined };
beforeAll(() => { Object.assign(process.env, { TWILIO_ACCOUNT_SID: ACCOUNT, TWILIO_API_KEY_SID: 'SK' + 'c3'.repeat(16), TWILIO_API_KEY_SECRET: 'x'.repeat(32), VOICE_PUBLIC_BASE_URL: 'https://voice.invalid', VOICE_WS_BASE_URL: 'wss://voice.invalid' }); });
beforeEach(() => { jest.spyOn(sequelize, 'query').mockImplementation(((...a: unknown[]) => query(...a)) as never); jest.spyOn(console, 'log').mockImplementation(() => undefined); jest.spyOn(console, 'warn').mockImplementation(() => undefined); runOpsSweep.mockClear(); reconcileOptOuts.mockClear(); });
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });
afterAll(() => { process.env = was; });

describe('production wiring', () => {
  it('Engine A runs behind the OpenAI chat circuit by default', async () => {
    streamTurn.mockResolvedValue({ ok: false, errorClass: 'UpstreamUnavailable', aborted: false });
    const { llm } = relayDeps();
    for (let i = 0; i < 5; i++) await llm.streamTurn(turn); // eslint-disable-line no-await-in-loop
    expect(await llm.streamTurn(turn)).toMatchObject({ errorClass: 'CircuitOpen' });
    expect(voiceOps.breakers.openai.current).toBe('OPEN');
  });

  it('Engine B connects behind the OpenAI circuit, and an open circuit says the model is unavailable', () => {
    const d = realtimeDeps();
    expect(d.modelAvailable!()).toBe(true);
    for (let i = 0; i < 5; i++) { d.connectModel({ onMessage: () => undefined, onClose: () => undefined }); sockets[sockets.length - 1].fire('close', 1013); }
    expect(d.modelAvailable!()).toBe(false);
    expect(() => d.connectModel({ onMessage: () => undefined, onClose: () => undefined })).toThrow('circuit is open');
  });

  it('dials go through the Twilio circuit', async () => {
    query.mockResolvedValue([{ e164_restricted: '+15555550100' }]);
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ status: 503, json: async () => ({}) } as Response);
    const p = productionDirectProvider('conversation_relay');
    if ('error' in p) throw new Error(p.error);
    const input = { callId: '0b1c2d3e-4f50-4617-8899-aabbccddeeff', destinationE164: '+15555550199', fromNumberRef: 'n', maxDurationSeconds: 60 } as Parameters<typeof p.dispatch>[0];
    for (let i = 0; i < 5; i++) await p.dispatch(input); // eslint-disable-line no-await-in-loop
    expect(await p.dispatch(input)).toMatchObject({ outcome: 'refused', errorClass: 'CircuitOpen' });
    expect(fetchSpy).toHaveBeenCalledTimes(5);
  });

  it('a failing number lookup is not held against Twilio', async () => {
    const m = new OpsMetrics(() => 1);
    const { guardCarrier } = await import('../providerGuards');
    const g = guardCarrier({ placeCall: async () => { throw new Error('db'); } } as never, m);
    for (let i = 0; i < 10; i++) await expect(g.placeCall({ callId: 'c' } as never, 'https://x')).rejects.toThrow('db'); // eslint-disable-line no-await-in-loop
    expect(m.breakers.twilio.current).toBe('CLOSED');
  });

  it.each<[string, () => (l: Record<string, unknown>) => void]>([['engines', () => relayDeps().log], ['webhooks', () => defaultVoiceWebhookDeps().log], ['transfers', () => defaultTransferDeps().log]])('%s: log lines are counted and carry the correlation id', (name, get) => {
    const event = `wiring_probe_${name}`;
    get()({ level: 'warn', event, call_id: 'c-9', outcome: 'failure' });
    expect(voiceOps.count(event)).toBe(1);
    const out = JSON.parse((console.warn as jest.Mock).mock.calls.map((c) => String(c[0])).find((l) => l.includes(event))!);
    expect(out).toMatchObject({ correlation_id: 'c-9', service: 'voice-studio' });
    expect(typeof out.timestamp).toBe('string');
  });

  it('both engines write the session event, and a failed write never throws', async () => {
    relayDeps().onSessionStarted!('c1');
    realtimeDeps().onSessionStarted!('c2');
    expect(append.mock.calls.map((c) => c[0][0])).toEqual([expect.objectContaining({ callId: 'c1', source: 'session', state: 'session_active' }), expect.objectContaining({ callId: 'c2' })]);
    append.mockRejectedValueOnce(new Error('db'));
    await expect(recordSessionStarted('c3')).resolves.toBeUndefined();
  });
});

describe('VS4.5: what a live call is given in production', () => {
  const row = (test_mode: boolean) => query.mockResolvedValue([{ engine: 'conversation_relay', test_mode }]);
  it('the answer speaks the test greeting on a test call, and hangs up on a real call with nothing pinned', async () => {
    row(true);
    expect(await connectTwimlFor('c-1')).toContain('AI assistant');
    row(false);
    expect(await connectTwimlFor('c-1')).toContain('<Hangup/>');
  });
  it('the answer and both engines use the pinned version on a real call', async () => {
    pinSession('c-2', { profile: { versionId: 'v3', greeting: 'hello from v3', system: 'sys v3', language: 'es-US' }, tools: [], agentKey: 'a', held: [] });
    row(false);
    const xml = await connectTwimlFor('c-2');
    expect(xml).toContain('hello from v3');
    expect(xml).toContain('es-US');
    expect((await relayDeps().sessionFor!('c-2'))!.profile.system).toBe('sys v3');
    expect((await realtimeDeps().sessionFor!('c-2'))!.profile.system).toBe('sys v3');
    expect(await relayDeps().sessionFor!('c-3')).toBeNull();
    query.mockResolvedValue([]);
    expect(await relayDeps().sessionFor!('c-2')).toBeNull(); // no such call
    await recordSessionStarted('c-2');
    expect(await relayDeps().sessionFor!('c-2')).toBeNull(); // taken once: the prompt does not linger in memory
  });
});

describe('the sweep', () => {
  const flags = (on: string) => { process.env.VOICE_STUDIO_ENABLED = on; process.env.VOICE_TEST_ENABLED = 'false'; };
  it('installed at boot, it runs every five minutes', async () => {
    jest.useFakeTimers();
    flags('true');
    const server = http.createServer();
    installVoiceRuntime(server);
    expect(runOpsSweep).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(POSTCALL_SWEEP_MS + 1);
    expect(runOpsSweep).toHaveBeenCalledTimes(1);
    expect(reconcileOptOuts).toHaveBeenCalledTimes(1);
  });
  it('off with no calls in a day: nothing runs; off with one: it keeps watching', async () => {
    flags('false');
    query.mockResolvedValue([{ any: false }]);
    expect(await sweepOnce()).toBe(false);
    expect(runOpsSweep).not.toHaveBeenCalled();
    query.mockResolvedValue([{ any: true }]);
    expect(await sweepOnce()).toBe(true);
    expect(runOpsSweep).toHaveBeenCalledTimes(1);
  });
  it('alerts are read before the reconcilers change anything, and one failing part does not stop the rest', async () => {
    flags('true');
    const order: string[] = [];
    runOpsSweep.mockImplementationOnce(async () => { order.push('alerts'); return []; });
    reconcileOptOuts.mockImplementationOnce(async () => { order.push('optouts'); throw new Error('x'); });
    reconcileDirect.mockImplementationOnce(async () => { order.push('completions'); return 0; });
    expect(await sweepOnce()).toBe(true);
    expect(order).toEqual(['alerts', 'optouts', 'completions']);
  });
  it('a database failure is logged, not thrown', async () => {
    flags('false');
    query.mockRejectedValue(new Error('db'));
    expect(await sweepOnce()).toBe(false);
  });
});

describe('DRILL: a provider that hangs', () => {
  function relayCall(llm: Parameters<typeof guardLlm>[0], ops: OpsMetrics) {
    let t = 0;
    const worker = new SessionWorker({ now: () => t, log: () => undefined, reconcile: async () => undefined, recordTool: () => undefined });
    const c = new RelayConnection({ send: () => undefined, close: () => undefined }, { worker, llm: guardLlm(llm, 'openai', ops), broker: () => new ToolBroker([]), profile: { versionId: 'v', greeting: 'g', system: 's', language: 'en-US' }, accountSid: () => ACCOUNT,
      consumeSessionRef: async () => 'consumed', callMatches: async () => true, now: () => Date.now(), log: () => undefined });
    const say = (m: object) => c.onMessage(JSON.stringify(m));
    const begin = async () => { await say({ type: 'setup', sessionId: 's', callSid: SID, accountSid: ACCOUNT, customParameters: { ref: mintToken('0b1c2d3e-4f50-4617-8899-aabbccddeeff', 'session', 120, Date.now(), correlationKey()) } }); };
    return { c, begin, say, worker, pass: (ms: number) => { t += ms; worker.tick(); } };
  }
  const hangThenAbort = { streamTurn: (a: { signal: AbortSignal }) => new Promise<{ ok: false; errorClass: string; aborted: boolean }>((r) => { a.signal.addEventListener('abort', () => r({ ok: false, errorClass: 'Aborted', aborted: true })); }) };

  it('Claude never answering, through the real session worker, opens the circuit', async () => {
    const ops = new OpsMetrics(() => 1);
    for (let i = 0; i < 5; i++) {
      const x = relayCall(hangThenAbort as never, ops);
      await x.begin(); // eslint-disable-line no-await-in-loop
      const p = x.say({ type: 'prompt', voicePrompt: 'hello', last: true });
      x.pass(12_500); // our thinking timeout
      await p; // eslint-disable-line no-await-in-loop
      x.c.onClose();
    }
    expect(ops.breakers.openai.current).toBe('OPEN');
  });
  it.each(['interrupt', 'hang up'])('CONTROL: callers who %s never open it', async (how) => {
    const ops = new OpsMetrics(() => 1);
    for (let i = 0; i < 8; i++) {
      const x = relayCall(hangThenAbort as never, ops);
      await x.begin(); // eslint-disable-line no-await-in-loop
      const p = x.say({ type: 'prompt', voicePrompt: 'hello', last: true });
      if (how === 'interrupt') await x.say({ type: 'interrupt', utteranceUntilInterrupt: '' }); // eslint-disable-line no-await-in-loop
      else x.c.onClose();
      await p; // eslint-disable-line no-await-in-loop
      x.c.onClose();
    }
    expect(ops.breakers.openai.current).toBe('CLOSED');
  });
  it('OpenAI opening a socket and never accepting the session opens the circuit; a quick hang-up does not', () => {
    for (const [wait, open] of [[REALTIME_SLOW_MS, false], [REALTIME_SLOW_MS - 1, true]] as const) {
      const ops = new OpsMetrics(() => 1);
      let t = 0;
      const g = guardRealtime(() => ({ send: () => undefined, close: () => undefined }), ops, () => t);
      for (let i = 0; i < 5; i++) { const s = g({ onMessage: () => undefined, onClose: () => undefined }); t += wait; s.close(1000); }
      expect(realtimeAvailable(ops)).toBe(open);
    }
  });

  function bridge(over: object) {
    const closes: number[] = [];
    const logs: Array<Record<string, unknown>> = [];
    const worker = new SessionWorker({ now: () => 0, log: () => undefined, reconcile: async () => undefined, recordTool: () => undefined });
    const connectModel = jest.fn();
    const b = new RealtimeBridge({ send: () => undefined, close: (c) => closes.push(c ?? 1000) }, { worker, broker: () => new ToolBroker([]), profile: { versionId: 'v', greeting: 'g', system: 's', language: 'en-US' }, accountSid: () => ACCOUNT, consumeSessionRef: async () => 'consumed', callMatches: async () => true, connectModel, now: () => Date.now(), log: (l: Record<string, unknown>) => logs.push(l), ...over } as never);
    const start = () => b.onTwilio(JSON.stringify({ event: 'start', streamSid: 'MZ1', start: { streamSid: 'MZ1', callSid: SID, accountSid: ACCOUNT, customParameters: { ref: mintToken('0b1c2d3e-4f50-4617-8899-aabbccddeeff', 'session', 120, Date.now(), correlationKey()) }, mediaFormat: { encoding: 'audio/x-mulaw', sampleRate: 8000, channels: 1 } } }));
    return { start, closes, worker, connectModel, logs };
  }
  it('Engine A reports its session exactly once, and only when one exists', async () => {
    const onSessionStarted = jest.fn();
    const worker = new SessionWorker({ now: () => 0, log: () => undefined, reconcile: async () => undefined, recordTool: () => undefined });
    const make = (consumed: 'consumed' | 'replay') => new RelayConnection({ send: () => undefined, close: () => undefined }, { worker, llm: { streamTurn: jest.fn() }, broker: () => new ToolBroker([]), profile: { versionId: 'v', greeting: 'g', system: 's', language: 'en-US' }, accountSid: () => ACCOUNT, consumeSessionRef: async () => consumed, callMatches: async () => true, now: () => Date.now(), log: () => undefined, onSessionStarted });
    const setup = JSON.stringify({ type: 'setup', sessionId: 's', callSid: SID, accountSid: ACCOUNT, customParameters: { ref: mintToken('0b1c2d3e-4f50-4617-8899-aabbccddeeff', 'session', 120, Date.now(), correlationKey()) } });
    await make('replay').onMessage(setup);
    expect(onSessionStarted).not.toHaveBeenCalled();
    const c = make('consumed');
    await c.onMessage(setup);
    await c.onMessage(setup);
    expect(onSessionStarted.mock.calls).toEqual([['0b1c2d3e-4f50-4617-8899-aabbccddeeff']]);
    c.onClose();
  });
  it('Engine B reports its session once, when the model accepts it', async () => {
    const onSessionStarted = jest.fn();
    let model: { onMessage(r: string): void } | null = null;
    const x = bridge({ onSessionStarted, connectModel: (h: { onMessage(r: string): void }) => { model = h; return { send: () => undefined, close: () => undefined }; } });
    await x.start();
    expect(onSessionStarted).not.toHaveBeenCalled();
    for (let i = 0; i < 2; i++) model!.onMessage(JSON.stringify({ type: 'session.updated' }));
    await new Promise((r) => { setImmediate(r); });
    expect(onSessionStarted.mock.calls).toEqual([['0b1c2d3e-4f50-4617-8899-aabbccddeeff']]);
  });
  it('Engine B with the model unavailable refuses before a session or a connection exists', async () => {
    const x = bridge({ modelAvailable: () => false });
    await x.start();
    expect(x.closes).toEqual([1013]);
    expect(x.worker.size).toBe(0);
    expect(x.connectModel).not.toHaveBeenCalled();
  });
  it('Engine B whose connection cannot be made ends that call and leaks nothing', async () => {
    const x = bridge({ connectModel: () => { throw Object.assign(new Error('bad key'), { name: 'TypeError' }); } });
    await expect(x.start()).resolves.toBeUndefined();
    expect(x.worker.size).toBe(0);
    expect(x.closes).toEqual([1000]);
    expect(x.logs).toContainEqual(expect.objectContaining({ event: 'voice_realtime_connect_failed', error_class: 'TypeError' }));
  });
});
