const mockEnv: Record<string, unknown> = {
  enableVoiceCalls: true,
  synthflowApiKey: 'k',
  synthflowCallbackAgentId: 'agent-callback',
  synthflowOpenHouseAgentId: 'agent-oh',
  voiceCallPaths: '',
};
const mockKill = jest.fn();
jest.mock('../../config/env', () => ({ env: mockEnv }));
jest.mock('../launchSafety', () => ({ isKillSwitchActive: () => mockKill() }));
jest.mock('../settingsService', () => ({ getTestOverrides: async () => ({ enabled: false }) }));

import { allowedVoicePaths, isVoicePathAllowed, voiceCallPathKey } from '../voice/voiceCallPaths';
import { triggerVoiceCall } from '../synthflowService';

beforeEach(() => {
  jest.clearAllMocks();
  mockKill.mockResolvedValue(false);
  mockEnv.voiceCallPaths = '';
  (global as any).fetch = jest.fn();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

describe('voice call path allowlist (fail closed)', () => {
  it('path key is the brand, else the call type, lowercased', () => {
    expect(voiceCallPathKey({ brandSlug: 'Enterprise-Intake', callType: 'callback' })).toBe('enterprise-intake');
    expect(voiceCallPathKey({ callType: 'open_house' })).toBe('open_house');
    expect(voiceCallPathKey({ brandSlug: '  ', callType: 'interest' })).toBe('interest');
  });

  it.each([[''], ['   '], [' , '], [undefined]])('an unset or empty list (%p) allows nothing', (raw) => {
    expect(allowedVoicePaths(raw as any).size).toBe(0);
    expect(isVoicePathAllowed('enterprise-intake', raw as any)).toBe(false);
  });

  it('allows exactly the listed keys', () => {
    expect(isVoicePathAllowed('enterprise-intake', 'enterprise-intake, agent-tool')).toBe(true);
    expect(isVoicePathAllowed('agent-tool', 'enterprise-intake, agent-tool')).toBe(true);
    expect(isVoicePathAllowed('open_house', 'enterprise-intake, agent-tool')).toBe(false);
    expect(isVoicePathAllowed('', 'enterprise-intake')).toBe(false);
  });

  it('triggerVoiceCall refuses an unlisted path before any dial (Open House stays off)', async () => {
    mockEnv.voiceCallPaths = 'enterprise-intake,agent-tool';
    const res = await triggerVoiceCall({ name: 'X', phone: '+12145550100', callType: 'open_house', prompt: 'p' } as any);
    expect(res).toEqual({ success: true, data: { skipped: true, reason: 'path_not_allowed' } });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('with ENABLE_VOICE_CALLS on but no list, nothing dials', async () => {
    const res = await triggerVoiceCall({ name: 'X', phone: '+12145550100', callType: 'callback', brandSlug: 'enterprise-intake', prompt: 'p' } as any);
    expect(res.data).toMatchObject({ reason: 'path_not_allowed' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('the kill switch still wins over the list', async () => {
    mockEnv.voiceCallPaths = 'enterprise-intake';
    mockKill.mockResolvedValue(true);
    const res = await triggerVoiceCall({ name: 'X', phone: '+12145550100', callType: 'callback', brandSlug: 'enterprise-intake', prompt: 'p' } as any);
    expect(res.data).toMatchObject({ reason: 'kill_switch_active' });
  });

  it('voice off still reads as feature_disabled, before the list', async () => {
    mockEnv.enableVoiceCalls = false;
    try {
      const res = await triggerVoiceCall({ name: 'X', phone: '+12145550100', callType: 'callback', brandSlug: 'enterprise-intake', prompt: 'p' } as any);
      expect(res.data).toMatchObject({ reason: 'feature_disabled' });
    } finally {
      mockEnv.enableVoiceCalls = true;
    }
  });
});
