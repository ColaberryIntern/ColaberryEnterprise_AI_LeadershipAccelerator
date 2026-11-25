import { detectsOptOut, recordOptOut, type OptOutDeps } from '../optOut';
import { RelayConnection, type RelayDeps } from '../../engines/conversationRelayEngine';
import { ToolBroker } from '../../engines/toolBroker';
import { liveProfile, TEST_PROFILE } from '../../engines/voiceProfiles';
import { SAFETY_SUFFIX } from '../../profiles/versionContent';
import { relayBroker, slotTool } from '../../engines/voiceRuntime';
import { SessionWorker } from '../../session/sessionWorker';
import { correlationKey, mintToken } from '../../twilio/correlationToken';

describe('detectsOptOut', () => {
  it.each(['Please stop calling me.', 'stop calling', "don't call me again", 'Do not call me', 'don\u2019t ever call this number', 'never call here again', 'take me off your list', 'remove my number', 'Remove me from the list please',
    'put me on the do not call list', 'no more calls', 'I want to opt out', 'unsubscribe', 'quit bothering me', 'no me llame',
    'put me on your do-not-call list', "I don't want you to call me again", "I don't want any more calls", 'I do not want to be called', "Please don't call anymore", "don't you call me again", 'stop all calls', 'stop the calls', 'stop ringing me',
    'lose my number', 'delete my number', 'leave me alone', 'STOP', 'Stop.', 'no me vuelvan a llamar', 'deja de llamarme', "don't call."])('yes: %s', (t) => expect(detectsOptOut(t)).toBe(true));
  it.each(['Can you call me back tomorrow?', 'I did not get the call', 'When should I call you?', 'Stop by the office', 'What time is the call?', 'I have to take my kid off the bus', 'They never called me', '', 'I do not want to miss the call', 'I want you to call me', 'Do you take calls on Sunday?', 'Stop, go back to the first option', 'I forgot my number', 'Why did you not call yesterday?', 'I will not be able to call you until noon'])('no: %s', (t) => expect(detectsOptOut(t)).toBe(false));
});

const deps = (over: Partial<OptOutDeps> = {}) => {
  const order: string[] = [];
  const d = { mark: jest.fn(async () => { order.push('mark'); return { leadId: 7, testMode: false }; }), suppress: jest.fn(async () => { order.push('suppress'); }), markRecorded: jest.fn(async () => { order.push('recorded'); }), log: jest.fn(), ...over };
  return { d: d as typeof d & OptOutDeps, order };
};

describe('recordOptOut', () => {
  it('a real call to a lead: marked, suppressed, then recorded', async () => {
    const { d, order } = deps();
    expect(await recordOptOut('c1', d)).toBe('recorded');
    expect(order).toEqual(['mark', 'suppress', 'recorded']);
    expect(d.suppress).toHaveBeenCalledWith(7);
  });
  it.each([[{ leadId: 7, testMode: true }], [{ leadId: null, testMode: false }]])('%j is marked only', async (c) => {
    const { d } = deps({ mark: jest.fn().mockResolvedValue(c) });
    expect(await recordOptOut('c1', d)).toBe('marked');
    expect(d.suppress).not.toHaveBeenCalled();
  });
  it('a failed suppression is not called recorded, so the sweep retries it; nothing is thrown', async () => {
    const { d } = deps({ suppress: jest.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'ConnectionError' })) });
    expect(await recordOptOut('c1', d)).toBe('pending');
    expect(d.markRecorded).not.toHaveBeenCalled();
    expect(d.log).toHaveBeenCalledWith(expect.objectContaining({ level: 'error', error_class: 'ConnectionError' }));
  });
});

describe('a live call', () => {
  const ACCOUNT = 'AC' + 'a1'.repeat(16);
  const CALL = '0b1c2d3e-4f50-4617-8899-aabbccddeeff';
  async function call(said: string[], onOptOut = jest.fn()) {
    const worker = new SessionWorker({ now: () => 0, log: () => undefined, reconcile: async () => undefined, recordTool: () => undefined });
    const logs: unknown[] = [];
    const d: RelayDeps = { worker, profile: liveProfile(), broker: () => new ToolBroker([]), accountSid: () => ACCOUNT, consumeSessionRef: async () => 'consumed', callMatches: async () => true, now: () => Date.now(), log: (l) => logs.push(l), onOptOut,
      llm: { streamTurn: async (a) => { a.onText('ok'); return { ok: true, stopReason: 'end_turn', text: 'ok', toolCalls: [], assistantContent: 'ok' }; } } };
    const c = new RelayConnection({ send: () => undefined, close: () => undefined }, d);
    await c.onMessage(JSON.stringify({ type: 'setup', sessionId: 's', callSid: 'CA' + 'b2'.repeat(16), accountSid: ACCOUNT, customParameters: { ref: mintToken(CALL, 'session', 120, Date.now(), correlationKey()) } }));
    for (const voicePrompt of said) await c.onMessage(JSON.stringify({ type: 'prompt', voicePrompt, last: true })); // eslint-disable-line no-await-in-loop
    c.onClose();
    return { onOptOut, logs };
  }
  it('reports an opt-out once, and never its words', async () => {
    const { onOptOut, logs } = await call(['hello', 'please stop calling me', 'I said stop calling']);
    expect(onOptOut).toHaveBeenCalledTimes(1);
    expect(onOptOut).toHaveBeenCalledWith(CALL);
    expect(JSON.stringify(logs)).not.toContain('stop calling');
  });
  it('an ordinary call reports none', async () => { expect((await call(['hello', 'call me back'])).onOptOut).not.toHaveBeenCalled(); });
  it('a failing sink does not end the call', async () => {
    const { logs } = await call(['stop calling me'], jest.fn(() => { throw new Error('x'); }));
    expect(logs).toContainEqual(expect.objectContaining({ event: 'voice_opt_out_sink_failed' }));
  });
});

describe('live engines follow the call rules and the tool kill switch', () => {
  const was = process.env.AGENT_TOOLS_DISABLED;
  afterEach(() => { if (was === undefined) delete process.env.AGENT_TOOLS_DISABLED; else process.env.AGENT_TOOLS_DISABLED = was; });
  it('the live prompt ends with the call rules', () => {
    expect(liveProfile().system).toBe(`${TEST_PROFILE.system}\n\n${SAFETY_SUFFIX}`);
    expect(liveProfile().greeting).toBe(TEST_PROFILE.greeting);
  });
  it('AGENT_TOOLS_DISABLED removes the tool from both engines', () => {
    delete process.env.AGENT_TOOLS_DISABLED;
    expect(slotTool().defs().map((t) => t.name)).toEqual(['next_open_strategy_slots']);
    expect(relayBroker().defs().map((t) => t.name)).toEqual(['next_open_strategy_slots', 'transfer_to_human']);
    process.env.AGENT_TOOLS_DISABLED = 'next_open_strategy_slots';
    expect(slotTool().defs()).toEqual([]);
    expect(relayBroker().defs().map((t) => t.name)).toEqual(['transfer_to_human']);
  });
});
