import { dispatchDirect, type DirectCallRequest, type DirectDispatchDeps } from '../directDispatch';
import { pinnedSession, pinSession, resolveSession, unpinSession } from '../callSessions';
import { SAFETY_SUFFIX } from '../../profiles/versionContent';
import { TEST_PROFILE } from '../../engines/voiceProfiles';
import { RelayConnection, type RelayDeps } from '../../engines/conversationRelayEngine';
import { RealtimeBridge } from '../../engines/realtime/openaiRealtimeEngine';
import { ToolBroker, type RegisteredTool } from '../../engines/toolBroker';
import { SessionWorker } from '../../session/sessionWorker';
import { correlationKey, mintToken } from '../../twilio/correlationToken';
import { createMockProvider, type MockOutcome } from '../../providers/mockProvider';

const V = '7a333333-3333-4333-8333-333333333333';
const R = '0b1c2d3e-4f50-4617-8899-aabbccddeeff';
const content = (over: object = {}) => ({
  prompt: 'You are Cory. {prompt}', first_message: null, disclosure: "This is Colaberry's AI assistant.", kb_refs: [], tool_permissions: ['next_open_strategy_slots', 'book_meeting'], engine: 'conversation_relay', engine_config: { promptShell: true },
  voice_id: null, language: 'en-US', safety_policy: { bookingRequiresHumanApproval: true, maxToolCallsPerCall: 6 }, max_call_seconds: 120, ...over,
});
const tool = (name: string, readOnly = true): RegisteredTool => ({ def: { name, description: '', input_schema: { type: 'object' } }, readOnly, schema: {}, run: async () => '' } as unknown as RegisteredTool);
let n = 0;
const req = (over: Partial<DirectCallRequest> = {}): DirectCallRequest => ({
  allocation: { provider: 'direct', engine: 'conversation_relay', routeId: R, versionId: V, reason: 'canary', bucket: 3 }, tenantId: 't', brandSlug: 'colaberry', pathKey: 'pilot', callType: 'callback', purpose: 'follow up',
  leadId: 42, recipientRef: 'lead:42', idempotencyKey: `pilot-key-${++n}`, prompt: 'Ask Pat about the class.', ...over,
});
function deps(script: MockOutcome[] = ['accepted'], over: Partial<DirectDispatchDeps> = {}, gate: object = {}) {
  const provider = createMockProvider(script);
  const rows: unknown[] = [];
  const transition = jest.fn().mockResolvedValue(true);
  const reserve = jest.fn().mockResolvedValue({ outcome: 'reserved', reservationId: 'r1', replay: false });
  const d: DirectDispatchDeps = {
    gateway: { mode: 'legacy', now: () => new Date('2026-12-01T18:00:00Z'), killSwitch: async () => false, voiceEnabled: () => true, pathAllowed: () => true, resolveDestination: async () => ({ e164: '+15555550100', timezone: 'America/Chicago' }), exemptionFor: async () => null,
      consentFor: async () => 'granted', suppressedFor: async () => false, resolveRoute: async () => ({ routeId: null, profileVersionId: 'x', engine: 'conversation_relay', fromNumberRef: 'line-1', maxDurationSeconds: 9999 }), reserve, transition, log: () => undefined, ...gate } as DirectDispatchDeps['gateway'],
    loadVersion: async () => ({ id: V, profileId: 'p1', brandSlug: 'colaberry', status: 'published', agentKey: 'edu-cory-outbound', content: content() }),
    registeredTools: () => [tool('next_open_strategy_slots'), tool('book_meeting', false)],
    insertCall: jest.fn(async (r: unknown) => { rows.push(r); return true; }), recordOutcome: jest.fn().mockResolvedValue(undefined), provider: () => provider, log: jest.fn(), ...over,
  };
  return { d, provider, rows, transition, reserve };
}
const version = (over: object, c: object = {}) => ({ loadVersion: async () => ({ id: V, profileId: 'p1', brandSlug: 'colaberry', status: 'published', agentKey: 'edu-cory-outbound', content: content(c), ...over }) });

describe('dispatchDirect', () => {
  it('places one call, pinned to its version, with the real route, version and duration on the dispatch', async () => {
    const { d, provider, rows } = deps();
    const r = await dispatchDirect(req(), d);
    if (r.outcome !== 'accepted') throw new Error(JSON.stringify(r));
    expect(provider.dispatched).toHaveLength(1);
    expect(provider.dispatched[0]).toMatchObject({ routeId: R, profileVersionId: V, fromNumberRef: 'line-1', maxDurationSeconds: 120, testMode: false });
    expect(rows).toEqual([{ callId: r.callId, engine: 'conversation_relay', routeId: R, versionId: V }]);
    const s = pinnedSession(r.callId)!;
    expect(s.profile).toMatchObject({ versionId: V, greeting: "This is Colaberry's AI assistant.", language: 'en-US' });
    expect(s.profile.system).toContain('Ask Pat about the class.');
    expect(s.profile.system.endsWith(SAFETY_SUFFIX)).toBe(true);
    expect(s.tools.map((t) => t.def.name)).toEqual(['next_open_strategy_slots']); // never the one that writes
  });

  it.each<[string, Partial<DirectCallRequest>, Partial<DirectDispatchDeps>, object, string]>([
    ['no version', {}, { loadVersion: async () => null }, {}, 'version_not_published'],
    ['a version retired since allocation', {}, version({ status: 'retired' }), {}, 'version_not_published'],
    ['a version of another brand', {}, version({ brandSlug: 'other' }), {}, 'version_not_published'],
    ['content that no longer validates', {}, version({}, { disclosure: 'Hello from us.' }), {}, 'version_content_invalid'],
    ['an engine that changed', {}, version({}, { engine: 'openai_realtime' }), {}, 'engine_mismatch'],
    ['Engine B', { allocation: { ...req().allocation, engine: 'openai_realtime' } }, version({}, { engine: 'openai_realtime' }), {}, 'engine_b_test_only'],
    ['a shell agent with no script', { prompt: ' ' }, {}, {}, 'no_prompt'],
    ['someone other than the allocated person', { leadId: 43 }, {}, {}, 'recipient_mismatch'],
    ['no provider', {}, { provider: () => ({ error: 'x' }) }, {}, 'provider_unavailable'],
    ['no from-number', {}, {}, { resolveRoute: async () => null }, 'no_from_number'],
    ['emergency stop', {}, {}, { killSwitch: async () => true }, 'kill_switch_active'],
    ['opted out', {}, {}, { suppressedFor: async () => true }, 'suppressed'],
    ['opt-out unreadable', {}, {}, { suppressedFor: async () => { throw new Error('db'); } }, 'suppression_unknown'],
    ['no consent', {}, {}, { consentFor: async () => 'missing' }, 'consent_missing'],
    ['unknown time zone', {}, {}, { resolveDestination: async () => ({ e164: '+15555550100', timezone: null }) }, 'recipient_timezone_unknown'],
    ['over a cap', {}, {}, { reserve: async () => ({ outcome: 'denied', reason: 'route_cap' }) }, 'route_cap'],
    ['a key already reserved', {}, {}, { reserve: async () => ({ outcome: 'reserved', reservationId: 'r', replay: true }) }, 'already_dispatched'],
    ['a key that already has a call', {}, { insertCall: async () => false }, {}, 'already_dispatched'],
  ])('refuses %s, and nothing is dialed', async (_n, rq, over, gate, reason) => {
    const { d, provider } = deps(['accepted'], over, gate);
    expect(await dispatchDirect(req(rq), d)).toMatchObject({ outcome: 'refused', reason });
    expect(provider.dispatched).toHaveLength(0);
  });

  it('a carrier refusal releases the reservation and forgets the session', async () => {
    const { d, transition } = deps(['refused']);
    const r = await dispatchDirect(req(), d);
    expect(r).toMatchObject({ outcome: 'refused', reason: 'MockRefused' });
    expect(transition).toHaveBeenCalledWith('r1', 'markRefused', expect.any(String));
    expect(pinnedSession((r as { callId: string }).callId)).toBeNull();
  });

  it('an unknown outcome is kept as unknown, with no second dial and the session still pinned', async () => {
    const { d, provider, transition } = deps(['unknown']);
    const r = await dispatchDirect(req(), d);
    if (r.outcome !== 'unknown') throw new Error(r.outcome);
    expect(provider.dispatched).toHaveLength(1);
    expect(transition).toHaveBeenCalledWith('r1', 'markAmbiguous', r.callId);
    expect(d.recordOutcome).toHaveBeenCalledWith(r.callId, 'unknown', 'MockUnknown');
    expect(pinnedSession(r.callId)).not.toBeNull();
  });

  it('a full session store blocks the call and gives the reservation back', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `full-${i}`);
    for (const id of ids) { try { pinSession(id, { profile: TEST_PROFILE, tools: [], agentKey: 'a', held: [] }); } catch { break; } }
    const { d, provider, transition } = deps();
    expect(await dispatchDirect(req(), d)).toMatchObject({ outcome: 'refused', reason: 'session_store_full' });
    expect(provider.dispatched).toHaveLength(0);
    expect(transition).toHaveBeenCalledWith('r1', 'expire');
    for (const id of ids) unpinSession(id);
  });

  it('no prompt, name or number is logged', async () => {
    const { d } = deps(['accepted']);
    await dispatchDirect(req(), d);
    expect(JSON.stringify((d.log as jest.Mock).mock.calls)).not.toMatch(/Pat|5555550100/);
  });
});

describe('what a live call is given', () => {
  const spec = { profile: { versionId: 'v3', greeting: 'hello from v3', system: 'sys v3', language: 'es-US' }, tools: [], agentKey: 'a', held: [] };
  it('a test call speaks the frozen test profile even if something is pinned; a real one only what was pinned', () => {
    pinSession('c1', spec);
    expect(resolveSession({ id: 'c1', testMode: true }, () => [])!.profile.greeting).toBe(TEST_PROFILE.greeting);
    expect(resolveSession({ id: 'c1', testMode: false }, () => [])!.profile.greeting).toBe('hello from v3');
    expect(resolveSession({ id: 'other', testMode: false }, () => [])).toBeNull();
    expect(resolveSession(null, () => [])).toBeNull();
    unpinSession('c1');
  });
  it('a pinned session expires', () => {
    pinSession('c2', spec, 1_000);
    expect(pinnedSession('c2', 1_000 + 10 * 60_000)).not.toBeNull();
    expect(pinnedSession('c2', 1_001 + 10 * 60_000)).toBeNull();
    unpinSession('c2');
  });

  const ACCOUNT = 'AC' + 'a1'.repeat(16);
  const SID = 'CA' + 'b2'.repeat(16);
  const ref = () => mintToken(R, 'session', 120, Date.now(), correlationKey());
  const worker = () => new SessionWorker({ now: () => 0, log: () => undefined, reconcile: async () => undefined, recordTool: () => undefined });
  const shared = (w: SessionWorker, sessionFor: RelayDeps['sessionFor']) => ({ worker: w, broker: () => new ToolBroker([tool('wrong_tool')]), profile: { versionId: 'wrong', greeting: 'wrong', system: 'wrong', language: 'en-US' }, accountSid: () => ACCOUNT, consumeSessionRef: async () => 'consumed' as const, callMatches: async () => true, now: () => Date.now(), log: () => undefined, sessionFor });
  const given = async () => ({ profile: spec.profile, broker: new ToolBroker([tool('right_tool')]) });

  it('Engine A speaks the pinned version with its tools, not the default', async () => {
    const turns: Array<{ system: string; tools: string[] }> = [];
    const w = worker();
    const c = new RelayConnection({ send: () => undefined, close: () => undefined }, { ...shared(w, given), llm: { streamTurn: async (a) => { turns.push({ system: a.system, tools: a.tools.map((t) => t.name) }); return { ok: true, stopReason: 'end_turn', text: '', toolCalls: [], assistantContent: '' }; } } });
    await c.onMessage(JSON.stringify({ type: 'setup', sessionId: 's', callSid: SID, accountSid: ACCOUNT, customParameters: { ref: ref() } }));
    await c.onMessage(JSON.stringify({ type: 'prompt', voicePrompt: 'hi', last: true }));
    expect(turns).toEqual([{ system: 'sys v3', tools: ['right_tool'] }]);
    c.onClose();
  });

  it.each(['missing', 'unreadable'])('Engine A with its session %s ends the call before one starts', async (how) => {
    const closes: Array<number | undefined> = [];
    const w = worker();
    const c = new RelayConnection({ send: () => undefined, close: (x) => closes.push(x) }, { ...shared(w, async () => { if (how === 'unreadable') throw new Error('db'); return null; }), llm: { streamTurn: jest.fn() } });
    await c.onMessage(JSON.stringify({ type: 'setup', sessionId: 's', callSid: SID, accountSid: ACCOUNT, customParameters: { ref: ref() } }));
    expect(closes).toEqual([how === 'missing' ? 1008 : 1011]);
    expect(w.size).toBe(0);
  });

  it('Engine B is given the pinned version too, and without one opens no model connection', async () => {
    for (const s of [given, async () => null]) {
      const sent: string[] = [];
      const closes: number[] = [];
      const w = worker();
      const connectModel = jest.fn(() => ({ send: (x: string) => { sent.push(x); }, close: () => undefined }));
      const b = new RealtimeBridge({ send: () => undefined, close: (c) => { closes.push(c ?? 1000); } }, { ...shared(w, s), connectModel });
      await b.onTwilio(JSON.stringify({ event: 'start', streamSid: 'MZ1', start: { streamSid: 'MZ1', callSid: SID, accountSid: ACCOUNT, customParameters: { ref: ref() }, mediaFormat: { encoding: 'audio/x-mulaw', sampleRate: 8000, channels: 1 } } })); // eslint-disable-line no-await-in-loop
      if (s === given) expect(sent[0]).toContain('sys v3');
      else { expect(connectModel).not.toHaveBeenCalled(); expect(closes).toEqual([1008]); }
      b.onTwilioClose();
    }
  });
});
