import AiAgent from '../../../models/AiAgent';
import { recordHumanAutonomyDecision, reactivateAgent } from '../agentReactivationService';

// AI Workforce Reset, Phase C (2026-08-24) — Ali, live: "add new ones slowly
// in a way so I can see how they perform." reactivateAgent() is the real,
// deliberate mechanism: enabled:true and a real, human-chosen autonomy_level
// always land in the SAME update, so an agent can never come back online
// without a recorded level.

jest.mock('../../../models/AiAgent', () => ({ findByPk: jest.fn(), findOne: jest.fn() }));

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
  it('happy path: sets enabled:true, the chosen autonomy_level, a real set_at timestamp AND source=manual in the same update', async () => {
    const agent = makeAgent();
    mockAgentFindByPk.mockResolvedValue(agent);

    const result = await reactivateAgent('agent-1', 'observe');

    expect(agent.update).toHaveBeenCalledWith({
      enabled: true,
      autonomy_level: 'observe',
      autonomy_level_set_at: expect.any(Date),
      // Added 2026-10-11: `set_at` alone stopped meaning "a human chose this" once the autonomy
      // classifier began stamping the same column with source:'auto'. The human path now says so.
      autonomy_level_source: 'manual',
    });
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

      expect(agent.update).toHaveBeenCalledWith({
        enabled: true,
        autonomy_level: level,
        autonomy_level_set_at: expect.any(Date),
        autonomy_level_source: 'manual',
      });
      expect(result.autonomyLevel).toBe(level);
    },
  );

  it('stamps autonomy_level_set_at with the real current time — the marker the real authorization gate uses to distinguish a deliberate choice from the untouched default', async () => {
    const agent = makeAgent();
    mockAgentFindByPk.mockResolvedValue(agent);
    const before = Date.now();

    await reactivateAgent('agent-1', 'act_audited');

    const stamped = agent.update.mock.calls[0][0].autonomy_level_set_at as Date;
    expect(stamped).toBeInstanceOf(Date);
    expect(stamped.getTime()).toBeGreaterThanOrEqual(before);
    expect(stamped.getTime()).toBeLessThanOrEqual(Date.now());
  });

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

describe('recordHumanAutonomyDecision', () => {
  // Deliberately separate from reactivateAgent: that one forces enabled:true because its job is
  // bringing a deactivated agent back. Using it on a RUNNING agent would hide an enablement change
  // inside an authority decision.
  it('records the level, the timestamp and source=manual, and does NOT touch enabled', async () => {
    const agent = makeAgent({ autonomy_level: 'communicate', autonomy_level_source: 'auto' });
    (AiAgent.findOne as jest.Mock).mockResolvedValue(agent);

    const res = await recordHumanAutonomyDecision('Reese', 'communicate');

    expect(res.recorded).toBe(true);
    const payload = agent.update.mock.calls[0][0];
    expect(payload.autonomy_level).toBe('communicate');
    expect(payload.autonomy_level_source).toBe('manual');
    expect(payload.autonomy_level_set_at).toBeInstanceOf(Date);
    // The three columns it is allowed to touch, and nothing else.
    expect(Object.keys(payload).sort()).toEqual(
      ['autonomy_level', 'autonomy_level_set_at', 'autonomy_level_source'],
    );
    expect(payload).not.toHaveProperty('enabled');
    expect(payload).not.toHaveProperty('abac_mode_override');
    expect(payload).not.toHaveProperty('tools_granted');
  });

  it('returns the PREVIOUS values, so an authority change is reversible', async () => {
    const was = new Date('2026-09-15T21:54:21.732Z');
    const agent = makeAgent({ autonomy_level: 'communicate', autonomy_level_source: 'auto', autonomy_level_set_at: was });
    (AiAgent.findOne as jest.Mock).mockResolvedValue(agent);

    const res = await recordHumanAutonomyDecision('Reese', 'communicate');

    // An authority change with no recorded prior state is not reversible.
    expect(res.previous).toEqual({ level: 'communicate', source: 'auto', setAt: was });
  });

  it('reports a missing agent rather than creating one', async () => {
    (AiAgent.findOne as jest.Mock).mockResolvedValue(null);
    const res = await recordHumanAutonomyDecision('NoSuchAgent', 'observe');
    expect(res).toMatchObject({ found: false, recorded: false, previous: null });
  });

  it('POSITIVE CONTROL: the payload assertion above would catch an enabled flip', async () => {
    const payload: Record<string, unknown> = {
      autonomy_level: 'communicate', autonomy_level_set_at: new Date(),
      autonomy_level_source: 'manual', enabled: true,
    };
    expect(Object.keys(payload).sort()).not.toEqual(
      ['autonomy_level', 'autonomy_level_set_at', 'autonomy_level_source'],
    );
  });
});
