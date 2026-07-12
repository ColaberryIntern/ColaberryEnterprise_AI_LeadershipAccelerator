import { AiAgent } from '../../models';
import { getSetting } from '../../services/settingsService';
import { emitAiEvent } from '../../services/aiEventService';
import { isKillSwitchActive } from '../../services/launchSafety';
import { isSafeModeActive } from '../../services/systemControlService';
import { authorizeAgentAction, getAbacMode } from '../../services/agentAuthorizationService';

jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../models', () => ({ AiAgent: { findOne: jest.fn() } }));
jest.mock('../../services/settingsService', () => ({ getSetting: jest.fn() }));
jest.mock('../../services/aiEventService', () => ({ emitAiEvent: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../services/launchSafety', () => ({ isKillSwitchActive: jest.fn() }));
jest.mock('../../services/systemControlService', () => ({ isSafeModeActive: jest.fn() }));

const findOne = AiAgent.findOne as unknown as jest.Mock;
const mockSetting = getSetting as unknown as jest.Mock;
const mockEmit = emitAiEvent as unknown as jest.Mock;
const mockKill = isKillSwitchActive as unknown as jest.Mock;
const mockSafe = isSafeModeActive as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockSetting.mockResolvedValue('shadow');
  findOne.mockResolvedValue(null); // unregistered → not disabled
  mockKill.mockResolvedValue(false);
  mockSafe.mockResolvedValue(false);
});

const base = { agentId: 'a1', agentName: 'TestAgent' };

describe('getAbacMode', () => {
  it('defaults to shadow for blank/garbage; honors off/enforce', async () => {
    mockSetting.mockResolvedValue('garbage');
    expect(await getAbacMode()).toBe('shadow');
    mockSetting.mockResolvedValue('enforce');
    expect(await getAbacMode()).toBe('enforce');
    mockSetting.mockResolvedValue('off');
    expect(await getAbacMode()).toBe('off');
  });
});

describe('authorizeAgentAction — shadow-first', () => {
  it('shadow: an over-privileged action is recorded as would-deny but NOT blocked', async () => {
    const r = await authorizeAgentAction({ ...base, action: 'update_campaign_config', tier: 'read_only' });
    expect(r.wouldDeny).toBe(true); // observe may not write
    expect(r.allowed).toBe(true); // shadow never blocks
    expect(r.enforced).toBe(false);
    expect(mockEmit).toHaveBeenCalledTimes(1);
    const meta = mockEmit.mock.calls[0][0].metadata;
    expect(meta.would_deny).toBe(true);
    expect(meta.verdict).toBe('block');
    expect(mockEmit.mock.calls[0][0].outcome).toBe('success'); // shadow → action proceeds
  });

  it('enforce: the same action is actually blocked', async () => {
    mockSetting.mockResolvedValue('enforce');
    const r = await authorizeAgentAction({ ...base, action: 'update_campaign_config', tier: 'read_only' });
    expect(r.allowed).toBe(false);
    expect(r.enforced).toBe(true);
    expect(r.reason).toBe('level_forbids:write');
    expect(mockEmit.mock.calls[0][0].outcome).toBe('blocked');
  });

  it('allows an in-scope action (communicate tier sending email, established lead)', async () => {
    const r = await authorizeAgentAction({ ...base, action: 'send_email', tier: 'communication' });
    expect(r.allowed).toBe(true);
    expect(r.wouldDeny).toBe(false);
    expect(r.reason).toBe('ok');
  });
});

describe('authorizeAgentAction — kill switch (Q6: reads keep running)', () => {
  it('blocks a side-effecting action when the kill switch is on', async () => {
    mockKill.mockResolvedValue(true);
    const r = await authorizeAgentAction({ ...base, action: 'update_campaign_config', tier: 'write_with_audit' });
    expect(r.wouldDeny).toBe(true);
    expect(r.reason).toBe('kill_switch_active');
  });
  it('lets a READ run even with the kill switch on', async () => {
    mockKill.mockResolvedValue(true);
    const r = await authorizeAgentAction({ ...base, action: 'scan_campaign', tier: 'read_only' });
    expect(r.wouldDeny).toBe(false);
    expect(r.reason).toBe('ok');
  });
});

describe('authorizeAgentAction — HITL', () => {
  it('enforce: a first-touch send to a new lead is queued for approval, not executed', async () => {
    mockSetting.mockResolvedValue('enforce');
    const r = await authorizeAgentAction({ ...base, action: 'send_email', tier: 'communication', context: { isNewLead: true } });
    expect(r.requiresApproval).toBe(true);
    expect(r.allowed).toBe(false); // queued
    expect(r.reason).toBe('requires_approval:first_touch_new_lead');
    expect(mockEmit.mock.calls[0][0].outcome).toBe('escalated');
  });
  it('shadow: the same action proceeds but is logged as would-deny', async () => {
    const r = await authorizeAgentAction({ ...base, action: 'send_email', tier: 'communication', context: { isNewLead: true } });
    expect(r.requiresApproval).toBe(true);
    expect(r.allowed).toBe(true);
    expect(r.wouldDeny).toBe(true);
  });
});

describe('authorizeAgentAction — disabled agent + off + fail-open', () => {
  it('enforce: a disabled/paused agent is blocked', async () => {
    mockSetting.mockResolvedValue('enforce');
    findOne.mockResolvedValue({ enabled: false, status: 'paused' });
    const r = await authorizeAgentAction({ ...base, action: 'send_email', tier: 'communication' });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('agent_disabled');
  });
  it('off: gate disabled, nothing emitted, always allows', async () => {
    mockSetting.mockResolvedValue('off');
    const r = await authorizeAgentAction({ ...base, action: 'update_campaign_config', tier: 'read_only' });
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe('gate_off'); // off short-circuits before evaluation
    // off mode never emits
    expect(mockEmit).not.toHaveBeenCalled();
  });
  it('FAILS OPEN: an internal error never blocks a live agent path', async () => {
    mockSetting.mockResolvedValue('enforce');
    mockKill.mockRejectedValue(new Error('control plane down'));
    const r = await authorizeAgentAction({ ...base, action: 'update_campaign_config', tier: 'write_with_audit' });
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe('authz_error');
  });
});
