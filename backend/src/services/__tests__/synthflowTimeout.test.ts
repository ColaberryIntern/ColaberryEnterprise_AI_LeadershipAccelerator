/**
 * synthflowService — outbound call timeout regression (BC #10099862873).
 *
 * The Synthflow API call had no explicit timeout even after this ticket
 * added failure-classification/alerting around it — a hang would never
 * throw, so the new alerting could never fire for the single most likely
 * real-world failure mode. Verifies the request now carries an abort signal
 * so a hang surfaces as a classified TimeoutError instead of hanging forever.
 */
jest.mock('../../config/env', () => ({
  env: {
    enableVoiceCalls: true,
    synthflowApiKey: 'test-key',
    synthflowWelcomeAgentId: 'agent-1',
    synthflowInterestAgentId: 'agent-1',
    synthflowCallbackAgentId: 'agent-1',
  },
}));
jest.mock('../launchSafety', () => ({ isKillSwitchActive: jest.fn().mockResolvedValue(false) }));
jest.mock('../settingsService', () => ({ getTestOverrides: jest.fn().mockResolvedValue({ enabled: false }) }));
jest.mock('../aiEventService', () => ({ emitAiEvent: jest.fn().mockResolvedValue(undefined) }));

import { triggerVoiceCall } from '../synthflowService';

describe('triggerVoiceCall — request timeout', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('happy path: the outbound request carries an AbortSignal', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ call_id: 'call-1' }),
    });
    global.fetch = mockFetch as any;

    await triggerVoiceCall({ name: 'Test', phone: '+15555550123', callType: 'welcome' });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const options = mockFetch.mock.calls[0][1];
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('failure path: an aborted (hung) request resolves as a classified failure, not an unhandled hang', async () => {
    const abortError = new Error('This operation was aborted');
    abortError.name = 'AbortError';
    global.fetch = jest.fn().mockRejectedValue(abortError) as any;

    const result = await triggerVoiceCall({ name: 'Test', phone: '+15555550123', callType: 'welcome' });

    expect(result.success).toBe(false);
  });
});
