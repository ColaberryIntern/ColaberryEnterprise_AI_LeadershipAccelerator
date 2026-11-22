/**
 * OH1m (T7): the Open House countdown call runs on our own agent, never a neighbor's, and a
 * refused dial keeps Synthflow's HTTP status and raw body. fetch is mocked; nothing dials.
 */
jest.mock('../../config/env', () => ({
  env: {
    databaseUrl: 'postgres://user:pass@localhost:5432/test',
    nodeEnv: 'test',
    enableVoiceCalls: true,
    // Agent comms tool: these suites exercise the dial path itself, so every path is allowed here.
    voiceCallPaths: 'open_house,interest,callback,welcome,project_discovery,internship_interview,ai-flotation,enterprise-intake,cpn,colaberry-internship,agent-tool,alert,admissions,test',
    synthflowApiKey: 'test-key',
    synthflowWelcomeAgentId: 'agent-welcome',
    synthflowInterestAgentId: 'agent-interest',
    synthflowCallbackAgentId: 'agent-callback',
    synthflowAiFlotationAgentId: 'agent-flotation',
    synthflowInternshipAgentId: 'agent-internship',
    synthflowCpnAgentId: 'agent-cpn',
    synthflowProjectDiscoveryAgentId: 'agent-discovery',
    synthflowOpenHouseAgentId: 'agent-open-house',
  },
}));
jest.mock('../launchSafety', () => ({ isKillSwitchActive: jest.fn().mockResolvedValue(false) }));
jest.mock('../settingsService', () => ({ getTestOverrides: jest.fn().mockResolvedValue({ enabled: false }) }));
jest.mock('../aiEventService', () => ({ emitAiEvent: jest.fn().mockResolvedValue(undefined) }));

import { resolveAgentId, triggerVoiceCall } from '../synthflowService';
import { env } from '../../config/env';

const anyEnv = env as any;
const call = { name: 'Pat', phone: '+15555550123', callType: 'open_house' as const, prompt: 'brief' };

describe('resolveAgentId: open_house', () => {
  afterEach(() => { anyEnv.synthflowOpenHouseAgentId = 'agent-open-house'; });

  it('uses the Open House agent', () => {
    expect(resolveAgentId({ callType: 'open_house' })).toBe('agent-open-house');
  });

  it('unset returns empty, never another agent (every other slot is configured)', () => {
    anyEnv.synthflowOpenHouseAgentId = '';
    expect(resolveAgentId({ callType: 'open_house' })).toBe('');
    expect(resolveAgentId({ callType: 'open_house', brandSlug: 'ai-flotation' })).toBe('');
  });

  it('the other call types are unchanged', () => {
    expect(resolveAgentId({ callType: 'interest' })).toBe('agent-interest');
    expect(resolveAgentId({ callType: 'welcome' })).toBe('agent-welcome');
  });
});

describe('triggerVoiceCall: open_house', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    global.fetch = originalFetch;
    anyEnv.synthflowOpenHouseAgentId = 'agent-open-house';
    jest.restoreAllMocks();
  });

  it('dials with the Open House agent as model_id', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '{"call_id":"c-1"}' });
    global.fetch = fetchMock as any;
    const res = await triggerVoiceCall(call);
    expect(res.success).toBe(true);
    expect(res.data.call_id).toBe('c-1');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model_id).toBe('agent-open-house');
  });

  it('missing agent id: refused with a clear error, no request made', async () => {
    anyEnv.synthflowOpenHouseAgentId = '';
    const fetchMock = jest.fn();
    global.fetch = fetchMock as any;
    const res = await triggerVoiceCall(call);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/SYNTHFLOW_OPEN_HOUSE_AGENT_ID is not set/);
    expect(res.data.reason).toBe('no_open_house_agent_id');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a non-JSON error body is kept with its HTTP status', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false, status: 502, text: async () => '<html>502 Bad Gateway</html>',
    }) as any;
    const res = await triggerVoiceCall(call);
    expect(res.success).toBe(false);
    expect(res.status).toBe(502);
    expect(res.rawBody).toBe('<html>502 Bad Gateway</html>');
    expect(res.error).toContain('Synthflow HTTP 502');
  });

  it('a JSON error body is kept raw as well', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false, status: 400, text: async () => '{"detail":"model_id not found"}',
    }) as any;
    const res = await triggerVoiceCall(call);
    expect(res.status).toBe(400);
    expect(res.rawBody).toBe('{"detail":"model_id not found"}');
  });

  it('an empty success body does not throw', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '' }) as any;
    const res = await triggerVoiceCall(call);
    expect(res.success).toBe(true);
    expect(res.data.call_id).toBeNull();
  });
});
