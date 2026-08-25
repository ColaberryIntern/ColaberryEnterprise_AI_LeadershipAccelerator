import AiAgent from '../../../models/AiAgent';
import { reactivateAgent } from '../agentReactivationService';

// AI Workforce Reset, Phase C (2026-08-24) — Ali, live: "add new ones slowly
// in a way so I can see how they perform." reactivateAgent() is the real,
// deliberate mechanism: enabled:true and a real, human-chosen autonomy_level
// always land in the SAME update, so an agent can never come back online
// without a recorded level.

jest.mock('../../../models/AiAgent', () => ({ findByPk: jest.fn() }));

const mockAgentFindByPk = AiAgent.findByPk as unknown as jest.Mock;

function makeAgent(overrides: Partial<any> = {}) {
  const agent: any = { id: 'agent-1', agent_name: 'ExecutiveStrategyArchitect', enabled: false, autonomy_level: null, ...overrides };
  agent.update = jest.fn(async (fields: any) => Object.assign(agent, fields));
  return agent;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('reactivateAgent', () => {
  it('happy path: sets enabled:true and the real chosen autonomy_level in the same update', async () => {
    const agent = makeAgent();
    mockAgentFindByPk.mockResolvedValue(agent);

    const result = await reactivateAgent('agent-1', 'observe');

    expect(agent.update).toHaveBeenCalledWith({ enabled: true, autonomy_level: 'observe' });
    expect(result).toEqual({
      agentId: 'agent-1', agentName: 'ExecutiveStrategyArchitect', found: true, reactivated: true, autonomyLevel: 'observe', error: null,
    });
  });

  it.each(['observe', 'suggest', 'act_audited', 'communicate'] as const)(
    "accepts the real level '%s' from abac-design.md's 4-level ladder",
    async (level) => {
      const agent = makeAgent();
      mockAgentFindByPk.mockResolvedValue(agent);

      const result = await reactivateAgent('agent-1', level);

      expect(agent.update).toHaveBeenCalledWith({ enabled: true, autonomy_level: level });
      expect(result.autonomyLevel).toBe(level);
    },
  );

  it('boundary: a non-existent agent id reports found:false and reactivated:false, never throws', async () => {
    mockAgentFindByPk.mockResolvedValue(null);

    const result = await reactivateAgent('does-not-exist', 'observe');

    expect(result).toEqual({
      agentId: 'does-not-exist', agentName: 'does-not-exist', found: false, reactivated: false, autonomyLevel: null, error: 'Agent not found',
    });
  });

  it('failure isolation: a DB update failure is reported on the result, never thrown', async () => {
    const agent = makeAgent();
    agent.update = jest.fn().mockRejectedValue(new Error('DB unavailable'));
    mockAgentFindByPk.mockResolvedValue(agent);

    const result = await reactivateAgent('agent-1', 'observe');

    expect(result.reactivated).toBe(false);
    expect(result.error).toBe('DB unavailable');
  });
});
