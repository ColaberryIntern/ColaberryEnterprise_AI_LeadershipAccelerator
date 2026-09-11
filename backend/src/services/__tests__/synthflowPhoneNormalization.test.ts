jest.mock('../../config/env', () => ({
  env: {
    databaseUrl: 'postgres://user:pass@localhost:5432/test',
    nodeEnv: 'test',
    enableVoiceCalls: true,
    synthflowApiKey: 'test-key',
    synthflowAiFlotationAgentId: 'agent-flotation',
    synthflowInternshipAgentId: '',
  },
}));
jest.mock('../launchSafety', () => ({ isKillSwitchActive: jest.fn().mockResolvedValue(false) }));
jest.mock('../settingsService', () => ({ getTestOverrides: jest.fn().mockResolvedValue({ enabled: false }) }));

import { triggerVoiceCall } from '../synthflowService';

/**
 * The number that leaves for Synthflow must be E.164.
 *
 * WHY THIS EXISTS. Synthflow forwards the number to Twilio as-is, prepending only
 * a bare '+' when there is none. A US internship applicant typed a 10-digit number
 * on the form ('6825975784'); it reached Twilio as '+6825975784' — country code
 * +682, Cook Islands — and Twilio rejected it 32205 "No International Permission".
 * The interview call never connected. These tests pin that the service now dials
 * '+16825975784', and that a number too short to dial is skipped, not sent.
 */
describe('the number sent to Synthflow is E.164', () => {
  function okResponse() {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ call_id: 'c_1' }),
    });
  }

  function bodyOf(spy: jest.SpyInstance): any {
    const [, init] = spy.mock.calls[0];
    return JSON.parse((init as any).body);
  }

  const prompt = 'Interview the applicant.';

  it('prepends +1 to a bare 10-digit US number', async () => {
    const fetchSpy = jest.spyOn(global as any, 'fetch').mockImplementation(okResponse as any);
    const res = await triggerVoiceCall({
      name: 'Ali', phone: '6825975784', callType: 'internship_interview',
      brandSlug: 'colaberry-internship', prompt,
    } as any);
    expect(res.success).toBe(true);
    expect(bodyOf(fetchSpy).phone).toBe('+16825975784');
    fetchSpy.mockRestore();
  });

  it('leaves an already-E.164 number alone', async () => {
    const fetchSpy = jest.spyOn(global as any, 'fetch').mockImplementation(okResponse as any);
    await triggerVoiceCall({
      name: 'Ali', phone: '+16825975784', callType: 'internship_interview',
      brandSlug: 'colaberry-internship', prompt,
    } as any);
    expect(bodyOf(fetchSpy).phone).toBe('+16825975784');
    fetchSpy.mockRestore();
  });

  it('normalizes a formatted number with punctuation', async () => {
    const fetchSpy = jest.spyOn(global as any, 'fetch').mockImplementation(okResponse as any);
    await triggerVoiceCall({
      name: 'Ali', phone: '(682) 597-5784', callType: 'internship_interview',
      brandSlug: 'colaberry-internship', prompt,
    } as any);
    expect(bodyOf(fetchSpy).phone).toBe('+16825975784');
    fetchSpy.mockRestore();
  });

  it('skips a number too short to dial, and never reaches the network', async () => {
    const fetchSpy = jest.spyOn(global as any, 'fetch').mockImplementation(() => {
      throw new Error('reached the network — an unusable number was dialled');
    });
    const res = await triggerVoiceCall({
      name: 'Ali', phone: '12345', callType: 'internship_interview',
      brandSlug: 'colaberry-internship', prompt,
    } as any);
    expect(res).toMatchObject({ success: true, data: { skipped: true, reason: 'invalid_phone' } });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
