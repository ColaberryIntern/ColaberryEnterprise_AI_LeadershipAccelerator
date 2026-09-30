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

import { triggerVoiceCall, resolveAgentId } from '../synthflowService';

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

  describe('which agent CPN borrows when it has none of its own', () => {
    // Ali, 2026-09-08: phone-number provisioning is blocked, so CPN reuses the AI
    // Flotation agent for now. Safe ONLY because that agent is a `{prompt}` shell
    // with no script of its own - borrowing a shell is not borrowing a voice.
    //
    // The Colaberry agents are the opposite: they carry saved scripts, and falling
    // through to one would answer a scholarship applicant as the bootcamp's callback
    // line. That distinction is the entire rule, so both halves are pinned.
    const envAny = () => jest.requireMock('../../config/env').env as any;

    it('borrows the AI Flotation SHELL when SYNTHFLOW_CPN_AGENT_ID is unset', () => {
      const e = envAny();
      const saved = e.synthflowCpnAgentId;
      e.synthflowCpnAgentId = '';
      try {
        expect(resolveAgentId({ callType: 'callback', brandSlug: 'cpn' })).toBe('agent-flotation');
      } finally {
        e.synthflowCpnAgentId = saved;
      }
    });

    it('never borrows a Colaberry agent, which carries its own script', () => {
      const e = envAny();
      const saved = e.synthflowCpnAgentId;
      e.synthflowCpnAgentId = '';
      try {
        const agent = resolveAgentId({ callType: 'callback', brandSlug: 'cpn' });

        // The defect this replaced: cpn fell through to the callback agent.
        expect(agent).not.toBe('agent-callback');
        expect(agent).not.toBe('agent-interest');
        expect(agent).not.toBe('agent-welcome');
      } finally {
        e.synthflowCpnAgentId = saved;
      }
    });

    it('prefers its own agent the moment one is configured', () => {
      expect(resolveAgentId({ callType: 'callback', brandSlug: 'cpn' })).toBe('agent-cpn');
    });

    it('skips entirely when neither its own agent nor the shell exists', () => {
      const e = envAny();
      const savedCpn = e.synthflowCpnAgentId;
      const savedFlot = e.synthflowAiFlotationAgentId;
      e.synthflowCpnAgentId = '';
      e.synthflowAiFlotationAgentId = '';
      try {
        expect(resolveAgentId({ callType: 'callback', brandSlug: 'cpn' })).toBeFalsy();
      } finally {
        e.synthflowCpnAgentId = savedCpn;
        e.synthflowAiFlotationAgentId = savedFlot;
      }
    });
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
