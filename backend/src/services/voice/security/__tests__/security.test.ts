/**
 * VS4.2: the security properties that live between modules, so no module's own suite owns them.
 * The rest of the map: nonce replay (twilio/voiceCallStore.integration), signatures (voiceWebhookRoutes,
 * relaySupport), forbidden dial path (voice/noDirectDispatch, voiceDialPolicy), prompt injection
 * (profiles/voiceToolPolicy), oversized frames and socket limits (engines/wsLimits), full-admin test
 * start and stop (testlab/voiceStudioRoutes, routes/admin/voiceStudioStopRoute), transfers (transfer).
 */
const recordOptOut = jest.fn().mockResolvedValue('marked');
jest.mock('../../optout/optOut', () => ({ ...jest.requireActual('../../optout/optOut'), recordOptOut: (...a: unknown[]) => recordOptOut(...a), productionOptOutDeps: () => ({}) }));

import { realtimeDeps, relayDeps } from '../../engines/voiceRuntime';
import { RelayConnection, END_GRACE_MS, type RelayDeps } from '../../engines/conversationRelayEngine';
import { ToolBroker, type RegisteredTool } from '../../engines/toolBroker';
import { SAFETY_SUFFIX } from '../../profiles/versionContent';
import { toolsNotSwitchedOff } from '../../profiles/voiceToolPolicy';
import { SessionWorker } from '../../session/sessionWorker';
import { startLiveTest, type TestLabDeps } from '../../testlab/testLabService';
import { correlationKey, mintToken } from '../../twilio/correlationToken';

const was = { ...process.env };
beforeAll(() => { process.env.ANTHROPIC_API_KEY = 'not-a-real-key'; });
afterAll(() => { process.env = was; });

describe('what a live call is really given', () => {
  it('both engines get the call rules at the end of the prompt', () => {
    for (const p of [relayDeps().profile, realtimeDeps().profile]) expect(p.system.endsWith(SAFETY_SUFFIX)).toBe(true);
  });
  it('Engine A reports an opt-out to the real recorder', () => {
    relayDeps().onOptOut!('call-1');
    expect(recordOptOut).toHaveBeenCalledWith('call-1', expect.anything());
  });
  it('a tool that writes, or is not granted, never reaches a live call', () => {
    const tool = (name: string, readOnly: boolean): RegisteredTool => ({ def: { name, description: '', input_schema: { type: 'object' } }, readOnly, run: async () => '' } as unknown as RegisteredTool);
    const out = toolsNotSwitchedOff([tool('next_open_strategy_slots', true), tool('transfer_to_human', false), tool('book_meeting', true)]);
    expect(out.map((t) => t.def.name)).toEqual(['next_open_strategy_slots']);
  });
});

describe('the Test Lab starts one test at a time', () => {
  const body = { runId: 'run-123456', destinationId: 'test-allowed', engine: 'conversation_relay', script: 'smoke', confirm: true };
  const deps = (withLock: TestLabDeps['withLock']) => ({ config: () => ({}), withLock, log: jest.fn(), dispatch: jest.fn() }) as unknown as TestLabDeps & { dispatch: jest.Mock };
  it('a busy lock is 409 test_starting, and nothing is dialed', async () => {
    const d = deps(async () => { throw Object.assign(new Error('busy'), { name: 'TestLockBusy' }); });
    expect(await startLiveTest(body, 'admin-1', d)).toEqual({ status: 409, body: { error: 'TestRefused', reason: 'test_starting' } });
    expect(d.dispatch).not.toHaveBeenCalled();
  });
  it('any other lock failure is not mistaken for a busy lock', async () => {
    await expect(startLiveTest(body, 'admin-1', deps(async () => { throw new Error('db down'); }))).rejects.toThrow('db down');
  });
});

describe('a session we end does not hold its socket', () => {
  afterEach(() => jest.useRealTimers());
  it('closes the socket after the grace period if Twilio has not', async () => {
    const worker = new SessionWorker({ now: () => 0, log: () => undefined, reconcile: async () => undefined, recordTool: () => undefined });
    const ACCOUNT = 'AC' + 'a1'.repeat(16);
    const closes: Array<number | undefined> = [];
    const d: RelayDeps = { worker, profile: { versionId: 'v', greeting: 'g', system: 's', language: 'en-US' }, broker: () => new ToolBroker([]), accountSid: () => ACCOUNT, consumeSessionRef: async () => 'consumed', callMatches: async () => true, now: () => Date.now(), log: () => undefined,
      llm: { streamTurn: async () => ({ ok: true, stopReason: 'end_turn', text: '', toolCalls: [], assistantContent: '' }) } };
    const c = new RelayConnection({ send: () => undefined, close: (x) => closes.push(x) }, d);
    await c.onMessage(JSON.stringify({ type: 'setup', sessionId: 's', callSid: 'CA' + 'b2'.repeat(16), accountSid: ACCOUNT, customParameters: { ref: mintToken('0b1c2d3e-4f50-4617-8899-aabbccddeeff', 'session', 120, Date.now(), correlationKey()) } }));
    jest.useFakeTimers();
    void worker.drain(0);
    jest.advanceTimersByTime(END_GRACE_MS - 100);
    expect(closes).toEqual([]);
    jest.advanceTimersByTime(1_000);
    expect(closes).toEqual([1000]);
  });
});
