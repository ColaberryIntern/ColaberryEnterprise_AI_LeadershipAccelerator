jest.mock('../../config/env', () => ({
  env: {
    // synthflowService transitively pulls in config/database, which constructs Sequelize
    // at module load — see synthflowAgentResolution.test.ts for the same workaround.
    databaseUrl: 'postgres://user:pass@localhost:5432/test',
    nodeEnv: 'test',
    enableVoiceCalls: true,
    synthflowApiKey: 'test-key',
    synthflowCallbackAgentId: 'agent-callback',
    synthflowAiFlotationAgentId: 'agent-flotation',
    synthflowCpnAgentId: 'agent-cpn',
    synthflowWelcomeAgentId: 'agent-welcome',
    synthflowInterestAgentId: 'agent-interest',
  },
}));
jest.mock('../launchSafety', () => ({ isKillSwitchActive: jest.fn().mockResolvedValue(false) }));
jest.mock('../settingsService', () => ({ getTestOverrides: jest.fn().mockResolvedValue({ enabled: false }) }));

import { triggerVoiceCall } from '../synthflowService';

/**
 * A branded call must never be dialled without its own instructions.
 *
 * WHY THIS EXISTS. The Synthflow agent is a shell: its saved prompt is literally
 * `{prompt}`, so what a stranger is told arrives at call time. An empty prompt does
 * not produce a neutral agent, it produces an unscripted one, on a number the person
 * may associate with a different business.
 *
 * `synthflowService` knew that and said so in a comment whose reasoning names no
 * brand — and then guarded it with `brandSlug === 'ai-flotation'`. Every other brand
 * arriving without a prompt would have dialled. It had never fired because nothing
 * else was routed to voice; it was a trap armed for whoever came second, and the
 * brand that came second is a nonprofit phoning people who are asking it for help.
 *
 * The guard is now universal. These tests pin that, and pin that the fix did not
 * quietly break the unbranded Colaberry calls that legitimately carry no prompt.
 */
describe('refusing to dial an unscripted agent', () => {
  // Real network calls would be the failure mode this suite exists to prevent, so
  // any test that gets past the guard fails loudly rather than reaching Synthflow.
  const fetchSpy = jest.spyOn(global as any, 'fetch').mockImplementation(() => {
    throw new Error('reached the network — the guard did not hold');
  });

  afterAll(() => fetchSpy.mockRestore());

  it('refuses a CPN call with no prompt', async () => {
    const res = await triggerVoiceCall({
      name: 'Sam',
      phone: '+15550100',
      callType: 'callback',
      brandSlug: 'cpn',
    } as any);

    expect(res).toMatchObject({ success: true, data: { skipped: true, reason: 'no_prompt' } });
  });

  it('refuses a CPN call whose prompt is only whitespace', async () => {
    const res = await triggerVoiceCall({
      name: 'Sam',
      phone: '+15550100',
      callType: 'callback',
      brandSlug: 'cpn',
      prompt: '   \n  ',
    } as any);

    expect(res).toMatchObject({ success: true, data: { skipped: true, reason: 'no_prompt' } });
  });

  it('still refuses AI Flotation with no prompt, which is where the rule started', async () => {
    const res = await triggerVoiceCall({
      name: 'Dana',
      phone: '+15550100',
      callType: 'callback',
      brandSlug: 'ai-flotation',
    } as any);

    expect(res).toMatchObject({ success: true, data: { skipped: true, reason: 'no_prompt' } });
  });

  it('refuses ANY brand, including one nobody has thought of yet', async () => {
    // The property, not the instances. A brand added to voice next year gets the
    // same protection without anybody remembering to extend a list.
    for (const brand of ['refactored', 'training', 'enterprise', 'some-future-brand']) {
      const res = await triggerVoiceCall({
        name: 'Someone',
        phone: '+15550100',
        callType: 'callback',
        brandSlug: brand,
      } as any);

      expect([brand, res.data?.reason]).toEqual([brand, 'no_prompt']);
    }
  });

  it('an unconfigured CPN agent skips rather than borrowing the Colaberry one', async () => {
    // The other half of the safety story. `resolveAgentId` sends cpn to its OWN slot
    // with no fallback: the generic callback agent carries Colaberry's saved
    // training-site script, so falling through would answer a scholarship applicant
    // as the bootcamp's callback line. Unset must mean silence, not substitution.
    const envAny = jest.requireMock('../../config/env').env as any;
    const saved = envAny.synthflowCpnAgentId;
    envAny.synthflowCpnAgentId = '';
    try {
      const res = await triggerVoiceCall({
        name: 'Sam',
        phone: '+15550100',
        callType: 'callback',
        brandSlug: 'cpn',
        prompt: 'a real scholarship script',
      } as any);

      expect(res).toMatchObject({ success: true, data: { skipped: true, reason: 'no_agent_id' } });
    } finally {
      envAny.synthflowCpnAgentId = saved;
    }
  });

  it('does NOT block an unbranded call, which legitimately uses the agent as saved', async () => {
    // Colaberry's own welcome and interest calls carry no brandSlug and no prompt:
    // their agents hold real saved instructions rather than a `{prompt}` shell. The
    // fix must not have turned those into silent no-ops.
    //
    // Asserted on the REASON rather than on a throw. The service catches upstream
    // errors and returns a result, so `rejects.toThrow` was testing the mock rather
    // than the guard - and it sat through the retry backoff to find that out.
    const res = await triggerVoiceCall({
      name: 'Student',
      phone: '+15550100',
      callType: 'welcome',
    } as any);

    // It got past the guard. Whatever happened next is the network's business.
    expect(res.data?.reason).not.toBe('no_prompt');
  }, 60000);
});
