/**
 * VS4.1: what happens on the wire while the single-use session reference is still being checked in the
 * database. Twilio does not wait for us: audio and caller turns arrive, and callers hang up.
 */
import { RealtimeBridge, type RealtimeDeps } from '../realtime/openaiRealtimeEngine';
import { MAX_EARLY_MESSAGES, RelayConnection, type RelayDeps } from '../conversationRelayEngine';
import { ToolBroker } from '../toolBroker';
import { TEST_PROFILE } from '../voiceProfiles';
import { SessionWorker } from '../../session/sessionWorker';
import { correlationKey, mintToken } from '../../twilio/correlationToken';

const ACCOUNT = 'AC' + 'a1'.repeat(16);
const SID = 'CA' + 'b2'.repeat(16);
const CALL = '0b1c2d3e-4f50-4617-8899-aabbccddeeff';
const settle = () => new Promise((r) => setTimeout(r, 20));

function harness() {
  const worker = new SessionWorker({ now: () => 0, log: () => undefined, reconcile: async () => undefined, recordTool: () => undefined });
  let release: () => void = () => undefined;
  const gate = new Promise<void>((r) => { release = r; });
  const closes: number[] = [];
  const sent: string[] = [];
  const modelSent: string[] = [];
  const model = { opened: 0 };
  let turns = 0;
  let fromModel: ((raw: string) => void) | null = null;
  const transport = { send: (x: string) => { sent.push(x); }, close: (c?: number) => { closes.push(c ?? 1000); } };
  const shared = {
    worker, profile: TEST_PROFILE, broker: () => new ToolBroker([]), accountSid: () => ACCOUNT,
    consumeSessionRef: async () => { await gate; return 'consumed' as const; },
    callMatches: async () => true, now: () => Date.now(), log: () => undefined,
  };
  const rt: RealtimeDeps = { ...shared, connectModel: (h) => { fromModel = h.onMessage; model.opened++; return { send: (x) => { modelSent.push(x); }, close: () => undefined }; } };
  const relay: RelayDeps = { ...shared, llm: { streamTurn: async (a) => { turns++; a.onText('hi'); return { ok: true, stopReason: 'end_turn', text: 'hi', toolCalls: [], assistantContent: 'hi' }; } } };
  return {
    worker, release, closes, sent, modelSent, model, transport, rt, relay, turns: () => turns,
    modelSays: (m: object) => fromModel!(JSON.stringify(m)),
    ref: mintToken(CALL, 'session', 120, Date.now(), correlationKey()),
  };
}

const startMsg = (ref: string) => JSON.stringify({ event: 'start', streamSid: 'MZ1', start: { streamSid: 'MZ1', callSid: SID, accountSid: ACCOUNT, customParameters: { ref }, mediaFormat: { encoding: 'audio/x-mulaw', sampleRate: 8000, channels: 1 } } });
const mediaMsg = JSON.stringify({ event: 'media', media: { payload: '//8=' } });
const setupMsg = (ref: string) => JSON.stringify({ type: 'setup', sessionId: 's', callSid: SID, accountSid: ACCOUNT, customParameters: { ref } });
const promptMsg = JSON.stringify({ type: 'prompt', voicePrompt: 'hello', last: true });

describe('Engine B, while the session reference is being checked', () => {
  it('caller audio does not end the call and reaches the model once it is ready', async () => {
    const x = harness();
    const b = new RealtimeBridge(x.transport, x.rt);
    const p = b.onTwilio(startMsg(x.ref));
    await b.onTwilio(mediaMsg);
    x.release();
    await p;
    expect(x.closes).toEqual([]);
    expect(x.worker.size).toBe(1);
    x.modelSays({ type: 'session.updated' });
    await settle();
    expect(x.modelSent.filter((m) => m.includes('input_audio_buffer.append'))).toHaveLength(1);
    b.onTwilioClose();
  });

  it.each(['socket close', 'twilio stop'])('a hang-up (%s) opens no session and no model connection', async (how) => {
    const x = harness();
    const b = new RealtimeBridge(x.transport, x.rt);
    const p = b.onTwilio(startMsg(x.ref));
    if (how === 'socket close') b.onTwilioClose();
    else await b.onTwilio(JSON.stringify({ event: 'stop' }));
    x.release();
    await p;
    await settle();
    expect(x.worker.size).toBe(0);
    expect(x.worker.hasTimer).toBe(false);
    expect(x.model.opened).toBe(0);
  });

  it('audio before any start still ends the socket', async () => {
    const x = harness();
    await new RealtimeBridge(x.transport, x.rt).onTwilio(mediaMsg);
    expect(x.closes).toEqual([1008]);
  });
});

describe('Engine A, while the session reference is being checked', () => {
  it('an early caller turn is answered instead of ending the call', async () => {
    const x = harness();
    const c = new RelayConnection(x.transport, x.relay);
    const p = c.onMessage(setupMsg(x.ref));
    await c.onMessage(promptMsg);
    expect(x.turns()).toBe(0);
    x.release();
    await p;
    expect(x.closes).toEqual([]);
    expect(x.turns()).toBe(1);
    expect(x.sent.some((m) => m.includes('"hi"'))).toBe(true);
    c.onClose();
  });

  it('early messages replay in order: the newest caller turn is the one answered, after the older', async () => {
    const x = harness();
    const asked: string[][] = [];
    x.relay.llm = { streamTurn: async (a) => { asked.push(a.messages.filter((m) => m.role === 'user').map((m) => String(m.content))); a.onText('hi'); return { ok: true, stopReason: 'end_turn', text: 'hi', toolCalls: [], assistantContent: 'hi' }; } };
    const c = new RelayConnection(x.transport, x.relay);
    const p = c.onMessage(setupMsg(x.ref));
    for (const t of ['first', 'second']) await c.onMessage(JSON.stringify({ type: 'prompt', voicePrompt: t, last: true }));
    x.release();
    await p;
    const last = asked[asked.length - 1];
    expect(last.indexOf('second')).toBeGreaterThan(last.indexOf('first'));
    expect(last).toContain('first');
    c.onClose();
  });

  it('an early interrupt cuts the early answer that came before it', async () => {
    const x = harness();
    const signals: AbortSignal[] = [];
    x.relay.llm = { streamTurn: (a) => { signals.push(a.signal); return new Promise((r) => { a.signal.addEventListener('abort', () => r({ ok: false, errorClass: 'Aborted', aborted: true })); setTimeout(() => r({ ok: true, stopReason: 'end_turn', text: '', toolCalls: [], assistantContent: '' }), 200); }); } };
    const c = new RelayConnection(x.transport, x.relay);
    const p = c.onMessage(setupMsg(x.ref));
    await c.onMessage(promptMsg);
    await c.onMessage(JSON.stringify({ type: 'interrupt', utteranceUntilInterrupt: '' }));
    x.release();
    await p;
    expect(signals).toHaveLength(1);
    expect(signals[0].aborted).toBe(true);
    c.onClose();
  });

  it('the early queue is bounded', async () => {
    const x = harness();
    const c = new RelayConnection(x.transport, x.relay);
    const p = c.onMessage(setupMsg(x.ref));
    for (let i = 0; i < MAX_EARLY_MESSAGES + 30; i++) await c.onMessage(promptMsg);
    x.release();
    await p;
    expect(x.turns()).toBe(MAX_EARLY_MESSAGES);
    expect(x.closes).toEqual([]);
    c.onClose();
  });

  it('a hang-up opens no session', async () => {
    const x = harness();
    const c = new RelayConnection(x.transport, x.relay);
    const p = c.onMessage(setupMsg(x.ref));
    await c.onMessage(promptMsg);
    c.onClose();
    x.release();
    await p;
    expect(x.worker.size).toBe(0);
    expect(x.worker.hasTimer).toBe(false);
    expect(x.turns()).toBe(0);
  });

  it('a caller turn before any setup still ends the socket', async () => {
    const x = harness();
    await new RelayConnection(x.transport, x.relay).onMessage(promptMsg);
    expect(x.closes).toEqual([1008]);
  });
});
