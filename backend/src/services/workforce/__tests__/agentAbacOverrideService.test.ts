import AiAgent from '../../../models/AiAgent';
import { setAgentAbacOverride } from '../agentAbacOverrideService';

// Real-enforcement scoping, Phase 3 (2026-09-20) — setAgentAbacOverride() is the real,
// deliberate mechanism behind the per-agent switch Ali asked for. Mirrors
// agentReactivationService.test.ts's exact mocking shape (findByPk + a mutable agent.update
// mock) — no real DB row, real or synthetic, is ever touched by this test.

jest.mock('../../../models/AiAgent', () => ({ findByPk: jest.fn() }));

const mockAgentFindByPk = AiAgent.findByPk as unknown as jest.Mock;

function makeAgent(overrides: Partial<any> = {}) {
  const agent: any = { id: 'agent-1', agent_name: 'TestAgent', abac_mode_override: null, ...overrides };
  agent.update = jest.fn(async (fields: any) => Object.assign(agent, fields));
  return agent;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('setAgentAbacOverride', () => {
  it('happy path: sets the override and real audit-trail fields (set_at/set_by) in the same update', async () => {
    const agent = makeAgent();
    mockAgentFindByPk.mockResolvedValue(agent);

    const result = await setAgentAbacOverride('agent-1', 'enforce', 'ali@colaberry.com');

    expect(agent.update).toHaveBeenCalledWith({
      abac_mode_override: 'enforce',
      abac_mode_override_set_at: expect.any(Date),
      abac_mode_override_set_by: 'ali@colaberry.com',
    });
    expect(result).toEqual({
      agentId: 'agent-1', agentName: 'TestAgent', found: true, updated: true, override: 'enforce',
      setAt: expect.any(Date), setBy: 'ali@colaberry.com', error: null,
    });
  });

  it('setting override to null is a real, first-class action ("revert to global default") — it still stamps set_at/set_by, not a no-op', async () => {
    const agent = makeAgent({ abac_mode_override: 'enforce' });
    mockAgentFindByPk.mockResolvedValue(agent);

    const result = await setAgentAbacOverride('agent-1', null, 'ali@colaberry.com');

    expect(agent.update).toHaveBeenCalledWith({
      abac_mode_override: null,
      abac_mode_override_set_at: expect.any(Date),
      abac_mode_override_set_by: 'ali@colaberry.com',
    });
    expect(result.override).toBeNull();
    expect(result.updated).toBe(true);
    expect(result.setAt).toBeInstanceOf(Date); // the revert itself is still a real, timestamped decision
    expect(result.setBy).toBe('ali@colaberry.com');
  });

  it.each(['shadow', 'enforce'] as const)("accepts the real value '%s'", async (value) => {
    const agent = makeAgent();
    mockAgentFindByPk.mockResolvedValue(agent);

    const result = await setAgentAbacOverride('agent-1', value, 'ali@colaberry.com');

    expect(result.override).toBe(value);
  });

  it('boundary: a non-existent agent id reports found:false and updated:false, never throws', async () => {
    mockAgentFindByPk.mockResolvedValue(null);

    const result = await setAgentAbacOverride('does-not-exist', 'enforce', 'ali@colaberry.com');

    expect(result).toEqual({
      agentId: 'does-not-exist', agentName: 'does-not-exist', found: false, updated: false, override: null,
      setAt: null, setBy: null, error: 'Agent not found',
    });
  });

  it('failure isolation: a DB update failure is reported on the result, never thrown', async () => {
    const agent = makeAgent();
    agent.update = jest.fn().mockRejectedValue(new Error('DB unavailable'));
    mockAgentFindByPk.mockResolvedValue(agent);

    const result = await setAgentAbacOverride('agent-1', 'enforce', 'ali@colaberry.com');

    expect(result.updated).toBe(false);
    expect(result.error).toBe('DB unavailable');
  });
});
