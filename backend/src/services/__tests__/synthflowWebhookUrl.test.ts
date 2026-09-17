jest.mock('../../config/env', () => ({
  env: {
    databaseUrl: 'postgres://user:pass@localhost:5432/test',
    nodeEnv: 'test',
    enableVoiceCalls: true,
    synthflowApiKey: 'test-key',
    synthflowCallbackAgentId: 'agent-callback',
    synthflowAiFlotationAgentId: 'agent-flotation',
    synthflowWelcomeAgentId: 'agent-welcome',
    synthflowInterestAgentId: 'agent-interest',
    synthflowWebhookUrl: 'https://enterprise.colaberry.ai/api/webhook/synthflow/call-complete',
  },
}));
jest.mock('../launchSafety', () => ({ isKillSwitchActive: jest.fn().mockResolvedValue(false) }));
jest.mock('../settingsService', () => ({ getTestOverrides: jest.fn().mockResolvedValue({ enabled: false }) }));

import { env } from '../../config/env';
import { triggerVoiceCall } from '../synthflowService';

/**
 * Every call we place tells Synthflow where to post its completion.
 *
 * WHY THIS EXISTS. Completion used to depend on a per-agent webhook setting in the
 * Synthflow dashboard. It was unset for the internship interviewer (found, worked around
 * with a reconciler) and then for AI Flotation: three out of three calls ever placed sat
 * at `sent` with no transcript and nothing extracted. A call whose completion never
 * arrives is a conversation nobody reads. The URL now travels with the call.
 */
describe('the call carries our webhook URL', () => {
  const fetchSpy = jest.spyOn(global as any, 'fetch');

  beforeEach(() => {
    fetchSpy.mockReset();
    fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ call_id: 'call_1' }) } as any);
  });
  afterAll(() => fetchSpy.mockRestore());

  const place = () => triggerVoiceCall({
    name: 'Marta',
    phone: '+15550100',
    callType: 'callback',
    brandSlug: 'ai-flotation',
    prompt: 'You are calling on behalf of AI Flotation about a tool library.',
  } as any);

  it('sends external_webhook_url on a Flotation call', async () => {
    const res = await place();
    expect(res.success).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.external_webhook_url).toBe('https://enterprise.colaberry.ai/api/webhook/synthflow/call-complete');
    expect(body.model_id).toBe('agent-flotation');
  });

  it('sends it on an unbranded call too - the gap was per agent, the fix is per call', async () => {
    await triggerVoiceCall({ name: 'Sam', phone: '+15550100', callType: 'welcome' } as any);
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.external_webhook_url).toBe(env.synthflowWebhookUrl);
  });

  it('omits the field when the URL is disabled, rather than sending an empty string', async () => {
    (env as any).synthflowWebhookUrl = '';
    try {
      await place();
      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body).not.toHaveProperty('external_webhook_url');
    } finally {
      (env as any).synthflowWebhookUrl = 'https://enterprise.colaberry.ai/api/webhook/synthflow/call-complete';
    }
  });
});
