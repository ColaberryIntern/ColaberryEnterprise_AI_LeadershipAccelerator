import { z } from 'zod';
import { INBOUND_MESSAGE_TWIML, planInbound, type CalledNumber, type InboundFacts } from '../inboundPlan';
import { answerInbound, type InboundDeps } from '../inboundRuntime';
import { effectiveVoiceTools } from '../../profiles/voiceToolPolicy';
import { ToolBroker, type RegisteredTool } from '../../engines/toolBroker';
import { toolVerdict } from '../../engines/voiceRuntime';
import { closeInboundCall } from '../../../../controllers/voiceTransferController';

const TEST = '00000000-0000-4000-8000-0000000007e5';
const LIVE = '00000000-0000-4000-8000-00000000c01a';
const TUE_10_CT = new Date('2026-12-01T16:00:00Z');
const SUN_10_CT = new Date('2026-11-29T16:00:00Z');
const HUMAN = '+15555550199';
const policy = (p: object = {}) => ({ inbound: { enabled: true, engine: 'conversation_relay', hours: 'always', fallback: 'message', ...p } });
const num = (p: Partial<CalledNumber> = {}): CalledNumber => ({ id: 'n1', tenantId: TEST, numberRef: 'test-line', brandSlug: 'colaberry', routingPolicy: policy(), ...p });
const facts = (p: Partial<InboundFacts> = {}): InboundFacts => ({ number: num(), testTenantId: TEST, studioEnabled: false, testEnabled: true, engineReady: true, transferTarget: HUMAN, now: TUE_10_CT, ...p });

describe('planInbound: only the called number decides', () => {
  it('the dedicated test number with an enabled policy is answered by our agent, as a test call', () => {
    expect(planInbound(facts())).toMatchObject({ kind: 'agent', engine: 'conversation_relay', testMode: true });
  });
  it('an unknown called number is the safe message, never an agent', () => {
    expect(planInbound(facts({ number: null }))).toEqual({ kind: 'message', reason: 'unknown_number', number: null, testMode: false });
  });
  it.each<[string, Partial<InboundFacts>, string]>([
    ['no policy', { number: num({ routingPolicy: {} }) }, 'no_policy'],
    ['null policy', { number: num({ routingPolicy: null }) }, 'no_policy'],
    ['unknown policy key', { number: num({ routingPolicy: policy({ agent: 'other-brand' }) }) }, 'invalid_policy'],
    ['Engine B', { number: num({ routingPolicy: policy({ engine: 'openai_realtime' }) }) }, 'invalid_policy'],
    ['disabled', { number: num({ routingPolicy: policy({ enabled: false }) }) }, 'disabled'],
    ['test number with test mode off', { testEnabled: false }, 'not_live'],
    ['engine not ready', { engineReady: false }, 'engine_not_ready'],
    ['after hours', { number: num({ routingPolicy: policy({ hours: 'business' }) }), now: SUN_10_CT }, 'after_hours'],
  ])('%s is the safe message', (_n, p, reason) => expect(planInbound(facts(p))).toMatchObject({ kind: 'message', reason }));
  it.each<[string, Partial<CalledNumber>]>([
    ['another brand on the test tenant', { brandSlug: 'otherbrand' }],
    ['another brand on a customer tenant', { tenantId: LIVE, brandSlug: 'otherbrand' }],
    ['a Colaberry customer number', { tenantId: LIVE }],
    ['a customer number with no brand', { tenantId: LIVE, brandSlug: null }],
  ])('%s is never answered by the test agent, even with everything switched on', (_n, p) => {
    expect(planInbound(facts({ number: num(p), studioEnabled: true }))).toMatchObject({ kind: 'message', reason: 'no_agent_for_brand' });
  });
  it('the test line is answered whether its brand is recorded or not', () => {
    for (const brandSlug of ['colaberry', null]) expect(planInbound(facts({ number: num({ brandSlug }) })).kind).toBe('agent');
  });
  it('the human fallback dials only inside transfer hours and with a number configured', () => {
    const n = num({ routingPolicy: policy({ enabled: false, fallback: 'human_line' }) });
    expect(planInbound(facts({ number: n })).kind).toBe('human');
    expect(planInbound(facts({ number: n, now: SUN_10_CT })).kind).toBe('message');
    expect(planInbound(facts({ number: n, transferTarget: undefined })).kind).toBe('message');
  });
});

function deps(over: Partial<InboundDeps> = {}, f: Partial<InboundFacts> = {}, n: CalledNumber | null = num()) {
  const { number: _n, ...rest } = facts(f);
  const d = {
    findNumber: jest.fn().mockResolvedValue(n), facts: () => rest, publicBaseUrl: () => 'https://enterprise.example',
    openCall: jest.fn().mockResolvedValue({ callId: '4d5e6f70-8192-4a3b-8cdd-eeff00112233' }), markFallback: jest.fn().mockResolvedValue(undefined),
    agentTwiml: jest.fn().mockResolvedValue('<Response><Connect/></Response>'), log: jest.fn(), ...over,
  };
  return d as typeof d & InboundDeps;
}
const IN = { calledNumber: '+15555550142', callSid: 'CA' + 'a1'.repeat(16) };

describe('answerInbound', () => {
  it('answers, opens one call from the number row, and stores or logs no phone number', async () => {
    const d = deps();
    expect(await answerInbound(IN, d)).toBe('<Response><Connect/></Response>');
    expect(d.openCall).toHaveBeenCalledWith({ callSid: IN.callSid, number: num(), engine: 'conversation_relay', testMode: true });
    expect(JSON.stringify([(d.openCall as jest.Mock).mock.calls, (d.log as jest.Mock).mock.calls])).not.toMatch(/\+1\d{10}/);
  });
  it('unknown number or no CallSid: message, no call row, no agent', async () => {
    for (const [i, d] of [[IN, deps({}, {}, null)], [{ ...IN, callSid: undefined }, deps()], [{ ...IN, calledNumber: undefined }, deps()]] as const) {
      expect(await answerInbound(i, d)).toBe(INBOUND_MESSAGE_TWIML);
      expect(d.openCall).not.toHaveBeenCalled();
      expect(d.agentTwiml).not.toHaveBeenCalled();
    }
  });
  it('a fallback is recorded with its reason; the human line gets a signed dial action', async () => {
    const d = deps({}, {}, num({ routingPolicy: policy({ enabled: false, fallback: 'human_line' }) }));
    const xml = await answerInbound(IN, d);
    expect(xml).toContain(`>${HUMAN}</Dial>`);
    expect(xml).toContain('/dial-action?ref=');
    expect(d.markFallback).toHaveBeenCalledWith(expect.any(String), 'inbound_disabled', false); // the dial action closes it
    const m = deps({}, {}, num({ routingPolicy: {} }));
    await answerInbound(IN, m);
    expect(m.markFallback).toHaveBeenCalledWith(expect.any(String), 'inbound_no_policy', true); // a message ends the call
    expect(d.agentTwiml).not.toHaveBeenCalled();
    expect(JSON.stringify((d.log as jest.Mock).mock.calls)).not.toContain('5555550199');
  });
  it.each(['findNumber', 'openCall', 'agentTwiml', 'markFallback'] as const)('%s failing is the safe message, logged with its class', async (k) => {
    const boom = jest.fn().mockRejectedValue(Object.assign(new Error('secret'), { name: 'ConnectionError' }));
    const d = deps({ [k]: boom }, {}, k === 'markFallback' ? num({ routingPolicy: {} }) : num());
    expect(await answerInbound(IN, d)).toBe(INBOUND_MESSAGE_TWIML);
    expect(d.log).toHaveBeenCalledWith(expect.objectContaining({ event: 'voice_inbound_failed', error_class: 'ConnectionError' }));
    if (k === 'agentTwiml') expect(d.markFallback).toHaveBeenCalledWith(expect.any(String), 'inbound_error', true); // the row does not stay ringing
  });
});

describe('caller verification before sensitive data', () => {
  const tool: RegisteredTool = { def: { name: 'admissions_knowledge', description: 'x', input_schema: { type: 'object' } }, schema: z.object({}) as z.ZodType<unknown>, readOnly: true, sensitive: true, run: async () => 'x' };
  const base = { agentKey: 'edu-cory-outbound', brandSlug: 'colaberry', versionPermissions: ['admissions_knowledge'], registered: [tool] };
  it('the broker itself refuses a sensitive tool, however it was built', async () => {
    const run = jest.fn().mockResolvedValue('personal data');
    const out = await new ToolBroker([{ ...tool, run }]).run('a', 'admissions_knowledge', {});
    expect(out).toMatchObject({ isError: true, errorClass: 'CallerNotVerified' });
    expect(run).not.toHaveBeenCalled();
    expect(toolVerdict({ committed: false, errorClass: 'CallerNotVerified' }).decision).toBe('denied');
    expect((await new ToolBroker([{ ...tool, run }], undefined, undefined, true).run('b', 'admissions_knowledge', {})).content).toBe('personal data');
  });
  it('a sensitive tool is refused by default and allowed only on a verified call', () => {
    expect(effectiveVoiceTools(base).denied).toContainEqual({ name: 'admissions_knowledge', reason: 'caller_not_verified' });
    expect(effectiveVoiceTools({ ...base, callerVerified: true }).allowed.map((t) => t.def.name)).toEqual(['admissions_knowledge']);
    expect(effectiveVoiceTools({ ...base, registered: [{ ...tool, sensitive: false }] }).allowed).toHaveLength(1);
  });
});

it('closing is for inbound only: an outbound action request touches nothing', async () => {
  await expect(closeInboundCall('x', { Direction: 'outbound-api', CallSid: IN.callSid })).resolves.toBeUndefined();
});
