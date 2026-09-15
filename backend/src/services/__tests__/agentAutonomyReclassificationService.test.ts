/**
 * Fleet-wide autonomy-level auto-classification, Phase 4 — the real
 * ongoing-sync mechanism (Ali: "will this stay in sync going forward").
 * Pins the two real-world guarantees: (1) a real human's manual choice is
 * NEVER silently overwritten, even when the agent's real capabilities
 * change; (2) a no-op reseed (the common case, every boot, for an agent
 * whose tools_granted hasn't changed) never re-classifies or re-writes.
 */
import { classifyNewAgentAutonomyLevel, maybeReclassifyAutonomyLevel } from '../agentAutonomyReclassificationService';

function fakeAgent(overrides: Partial<Record<string, any>> = {}) {
  return {
    agent_name: 'SomeAgent',
    autonomy_level_source: null,
    update: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('classifyNewAgentAutonomyLevel', () => {
  it('happy path: a brand-new agent with real tools_granted is classified and stamped auto immediately', async () => {
    const agent = fakeAgent();

    await classifyNewAgentAutonomyLevel(agent as any, ['create_tickets']);

    expect(agent.update).toHaveBeenCalledWith(
      expect.objectContaining({ autonomy_level: 'act_audited', autonomy_level_source: 'auto' }),
    );
    expect(agent.update.mock.calls[0][0].autonomy_level_set_at).toBeInstanceOf(Date);
  });

  it('boundary: a brand-new agent whose registry entry declares no tools_granted at all still gets stamped (the safe observe default), never left untouched', async () => {
    const agent = fakeAgent();

    await classifyNewAgentAutonomyLevel(agent as any, undefined);

    expect(agent.update).toHaveBeenCalledWith(
      expect.objectContaining({ autonomy_level: 'observe', autonomy_level_source: 'auto' }),
    );
  });

  it('failure: a real write failure never throws out of the seeding loop', async () => {
    const agent = fakeAgent({ update: jest.fn().mockRejectedValue(new Error('db down')) });

    await expect(classifyNewAgentAutonomyLevel(agent as any, ['create_tickets'])).resolves.toBeUndefined();
  });
});

describe('maybeReclassifyAutonomyLevel', () => {
  it('happy path: tools_granted genuinely changed on an auto-sourced agent — reclassified and re-stamped', async () => {
    const agent = fakeAgent({ autonomy_level_source: 'auto' });

    await maybeReclassifyAutonomyLevel(agent as any, ['read_x'], ['send_email']);

    expect(agent.update).toHaveBeenCalledWith(
      expect.objectContaining({ autonomy_level: 'communicate', autonomy_level_source: 'auto' }),
    );
  });

  it('happy path: an agent nobody has ever touched (null source) is treated the same as auto — reclassified', async () => {
    const agent = fakeAgent({ autonomy_level_source: null });

    await maybeReclassifyAutonomyLevel(agent as any, null, ['send_email']);

    expect(agent.update).toHaveBeenCalledWith(expect.objectContaining({ autonomy_level: 'communicate' }));
  });

  it('the non-negotiable guardrail: a MANUALLY-set agent is never silently overwritten even when its real tools_granted changes', async () => {
    const agent = fakeAgent({ autonomy_level_source: 'manual' });

    await maybeReclassifyAutonomyLevel(agent as any, ['read_x'], ['send_email']);

    expect(agent.update).not.toHaveBeenCalled();
  });

  it('boundary: no real change in tools_granted never reclassifies, even on an auto-sourced agent (the common no-op reseed case)', async () => {
    const agent = fakeAgent({ autonomy_level_source: 'auto' });

    await maybeReclassifyAutonomyLevel(agent as any, ['create_tickets'], ['create_tickets']);

    expect(agent.update).not.toHaveBeenCalled();
  });

  it('boundary: this registry entry does not declare tools_granted at all this boot — never reclassifies, distinct from "changed to nothing"', async () => {
    const agent = fakeAgent({ autonomy_level_source: 'auto' });

    await maybeReclassifyAutonomyLevel(agent as any, ['create_tickets'], undefined);

    expect(agent.update).not.toHaveBeenCalled();
  });

  it('a real change from having tools to having none is still a real change and reclassifies to the honest observe default', async () => {
    const agent = fakeAgent({ autonomy_level_source: 'auto' });

    await maybeReclassifyAutonomyLevel(agent as any, ['send_email'], []);

    expect(agent.update).toHaveBeenCalledWith(expect.objectContaining({ autonomy_level: 'observe' }));
  });

  it('failure: a real write failure never throws out of the seeding loop', async () => {
    const agent = fakeAgent({ autonomy_level_source: 'auto', update: jest.fn().mockRejectedValue(new Error('db down')) });

    await expect(maybeReclassifyAutonomyLevel(agent as any, ['a'], ['send_email'])).resolves.toBeUndefined();
  });
});
