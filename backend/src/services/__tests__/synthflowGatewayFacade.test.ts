jest.mock('../../config/env', () => ({
  env: {
    databaseUrl: 'postgres://user:pass@localhost:5432/test',
    nodeEnv: 'test',
    enableVoiceCalls: true,
    voiceCallPaths: 'interest,callback,agent-tool,welcome,open_house,project_discovery,colaberry-internship,ai-flotation,enterprise-intake,cpn',
    synthflowApiKey: 'test-key',
    synthflowInterestAgentId: 'agent-interest',
    synthflowWelcomeAgentId: 'agent-welcome',
    synthflowCallbackAgentId: 'agent-callback',
    synthflowOpenHouseAgentId: 'agent-openhouse',
    synthflowProjectDiscoveryAgentId: 'agent-discovery',
    synthflowInternshipAgentId: 'agent-internship',
    synthflowEnterpriseIntakeAgentId: 'agent-enterprise',
    synthflowCpnAgentId: 'agent-cpn',
    synthflowAgentToolAgentId: 'agent-tool-id',
    synthflowAiFlotationAgentId: 'agent-flotation',
  },
}));
jest.mock('../launchSafety', () => ({ isKillSwitchActive: jest.fn().mockResolvedValue(false) }));
jest.mock('../settingsService', () => ({ getTestOverrides: jest.fn().mockResolvedValue({ enabled: false }) }));
jest.mock('../voice/gateway/legacyFacade', () => ({ dispatchLegacyViaGateway: jest.fn() }));
// triggerVoiceCall's failure event is fire-and-forget (unchanged legacy behavior); keep it off the real DB writer.
jest.mock('../aiEventService', () => ({ emitAiEvent: jest.fn().mockResolvedValue(undefined) }));

import { triggerVoiceCall } from '../synthflowService';
import { dispatchLegacyViaGateway } from '../voice/gateway/legacyFacade';

/**
 * VS1.6: triggerVoiceCall is the facade every caller uses. With VOICE_GATEWAY_LEGACY_ENABLED on, the
 * dial goes through the Voice Gateway; every check that ran before still runs first, in the same order,
 * and callers get the same result shape. With it off (default), the gateway is never touched.
 */
const facade = dispatchLegacyViaGateway as jest.Mock;
const base = { name: 'Test', phone: '5555550123', callType: 'interest' as const };
const p = 'Speak as the caller for this brand.';

describe('triggerVoiceCall facade (VS1.6)', () => {
  afterEach(() => {
    delete process.env.VOICE_GATEWAY_LEGACY_ENABLED;
    jest.restoreAllMocks();
    facade.mockReset();
  });

  it('flag OFF (default): never touches the gateway; dials directly as before', async () => {
    const fetchSpy = jest.spyOn(global as never, 'fetch').mockResolvedValue({ ok: true, status: 200, text: async () => '{"call_id":"c_1"}' } as never);
    const r = await triggerVoiceCall(base);
    expect(facade).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(r.success).toBe(true);
  });

  it('flag ON: dials through the gateway, never directly, and returns its legacy-shaped result', async () => {
    process.env.VOICE_GATEWAY_LEGACY_ENABLED = 'true';
    const fetchSpy = jest.spyOn(global as never, 'fetch');
    facade.mockResolvedValue({ success: true, data: { call_id: 'sf-1' } });
    const r = await triggerVoiceCall(base);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(facade).toHaveBeenCalledTimes(1);
    const arg = facade.mock.calls[0][0];
    expect(arg.phoneE164).toBe('+15555550123'); // E.164 normalization still happens first (+1 regression)
    expect(arg.requestBody.model_id).toBe('agent-interest');
    expect(r).toEqual({ success: true, data: { call_id: 'sf-1' } });
  });

  it('flag ON: earlier checks still run first (a disallowed path never reaches the gateway)', async () => {
    process.env.VOICE_GATEWAY_LEGACY_ENABLED = 'true';
    const r = await triggerVoiceCall({ ...base, callType: 'callback', brandSlug: 'not-on-the-allowlist', prompt: p });
    expect(r).toEqual({ success: true, data: { skipped: true, reason: 'path_not_allowed' } });
    expect(facade).not.toHaveBeenCalled();
  });

  it('flag ON: a branded call without a prompt is still refused before the gateway', async () => {
    process.env.VOICE_GATEWAY_LEGACY_ENABLED = 'true';
    const r = await triggerVoiceCall({ ...base, callType: 'callback', brandSlug: 'agent-tool' });
    expect(r).toEqual({ success: true, data: { skipped: true, reason: 'no_prompt' } });
    expect(facade).not.toHaveBeenCalled();
  });

  it('flag ON: a gateway skip is passed through unchanged (callers read data.skipped and data.reason)', async () => {
    process.env.VOICE_GATEWAY_LEGACY_ENABLED = 'true';
    facade.mockResolvedValue({ success: true, data: { skipped: true, reason: 'number_dialed_recently' } });
    expect(await triggerVoiceCall(base)).toEqual({ success: true, data: { skipped: true, reason: 'number_dialed_recently' } });
  });

  it('flag ON: a provider failure keeps the legacy error shape and drops the internal failure field', async () => {
    process.env.VOICE_GATEWAY_LEGACY_ENABLED = 'true';
    facade.mockResolvedValue({ success: false, error: 'Synthflow HTTP 500: x', status: 500, rawBody: 'x', failure: { status: 500, message: 'x' } });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const r = await triggerVoiceCall(base);
    expect(r).toEqual({ success: false, error: 'Synthflow HTTP 500: x', status: 500, rawBody: 'x' });
  });

  it('only the exact string "true" turns the gateway on (boundary)', async () => {
    process.env.VOICE_GATEWAY_LEGACY_ENABLED = 'TRUE';
    jest.spyOn(global as never, 'fetch').mockResolvedValue({ ok: true, status: 200, text: async () => '{}' } as never);
    await triggerVoiceCall(base);
    expect(facade).not.toHaveBeenCalled();
  });
});

/**
 * Per-caller contract (one case per route key in INVENTORY.md): the request the gateway path sends to
 * Synthflow is IDENTICAL to what the legacy path sends today, so every caller gets the same agent, prompt
 * and variables whichever way the flag is set.
 */
describe('per-caller contract: flag ON sends the same Synthflow request as flag OFF', () => {
  afterEach(() => { delete process.env.VOICE_GATEWAY_LEGACY_ENABLED; jest.restoreAllMocks(); facade.mockReset(); });
  const cases = [
    ['scheduler / automation interest', { callType: 'interest' as const }, 'agent-interest'],
    ['enrollment welcome + exec alerts', { callType: 'welcome' as const }, 'agent-welcome'],
    ['open house countdown', { callType: 'open_house' as const, prompt: p }, 'agent-openhouse'],
    ['SBP project discovery', { callType: 'project_discovery' as const, prompt: p }, 'agent-discovery'],
    ['internship interview', { callType: 'internship_interview' as const, brandSlug: 'colaberry-internship', prompt: p }, 'agent-internship'],
    ['AI Flotation callback hub', { callType: 'callback' as const, brandSlug: 'ai-flotation', prompt: p }, 'agent-flotation'],
    ['Enterprise intake', { callType: 'callback' as const, brandSlug: 'enterprise-intake', prompt: p }, 'agent-enterprise'],
    ['CPN scholarship', { callType: 'callback' as const, brandSlug: 'cpn', prompt: p }, 'agent-cpn'],
    ['Maya / agent tool', { callType: 'callback' as const, brandSlug: 'agent-tool', prompt: p }, 'agent-tool-id'],
  ] as const;

  it.each(cases)('%s', async (_name, extra, agent) => {
    const fetchSpy = jest.spyOn(global as never, 'fetch').mockResolvedValue({ ok: true, status: 200, text: async () => '{"call_id":"c"}' } as never);
    await triggerVoiceCall({ ...base, ...extra });
    const offBody = JSON.parse(String((fetchSpy.mock.calls[0] as unknown[])[1] && ((fetchSpy.mock.calls[0] as unknown[])[1] as { body: string }).body));

    process.env.VOICE_GATEWAY_LEGACY_ENABLED = 'true';
    facade.mockResolvedValue({ success: true, data: { call_id: 'c' } });
    await triggerVoiceCall({ ...base, ...extra });
    const on = facade.mock.calls[0][0];

    expect(offBody.model_id).toBe(agent);
    expect(on.requestBody).toEqual(offBody);
    expect(on.phoneE164).toBe(offBody.phone);
  });
});
