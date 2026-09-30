/**
 * Fleet-wide autonomy-level auto-classification, Phase 4 (2026-09-14) —
 * confirms `seedAgentRegistry()` actually calls the real reclassification
 * functions at the right point in both branches, mirroring
 * agentRegistrySeedPersonaVersionHistory.test.ts's exact shape/scope
 * (Reese, a real registry entry with a real `tools_granted`) — not
 * re-testing the whole 230+-entry registry.
 */
jest.mock('../../models/AiAgent', () => ({ findOrCreate: jest.fn(), update: jest.fn().mockResolvedValue([0]) }));
jest.mock('../reese/reeseIdentitySeed', () => ({ seedReeseIdentity: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../reese/reeseSystemPrompt', () => ({ REESE_PERSONA_BLOCK: 'MOCKED_PERSONA_BLOCK' }));
jest.mock('../agentPersonaVersionHistoryService', () => ({ recordPersonaVersionChangeIfNeeded: jest.fn() }));
jest.mock('../agentAutonomyReclassificationService', () => ({
  classifyNewAgentAutonomyLevel: jest.fn(),
  maybeReclassifyAutonomyLevel: jest.fn(),
}));

import AiAgent from '../../models/AiAgent';
import { seedAgentRegistry } from '../agentRegistrySeed';
import { classifyNewAgentAutonomyLevel, maybeReclassifyAutonomyLevel } from '../agentAutonomyReclassificationService';

const mockFindOrCreate = AiAgent.findOrCreate as unknown as jest.Mock;
const mockClassifyNew = classifyNewAgentAutonomyLevel as unknown as jest.Mock;
const mockMaybeReclassify = maybeReclassifyAutonomyLevel as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('agentRegistrySeed — autonomy-level reclassification wiring', () => {
  it('a brand-new agent (created:true) is classified via classifyNewAgentAutonomyLevel with its real starting tools_granted', async () => {
    mockFindOrCreate.mockImplementation(async ({ defaults }: any) => [
      { ...defaults, id: 'agent-1', update: jest.fn().mockResolvedValue(undefined) },
      true,
    ]);

    await seedAgentRegistry();

    const reeseCall = mockClassifyNew.mock.calls.find((c) => c[0]?.agent_name === 'Reese');
    expect(reeseCall).toBeDefined();
    expect(reeseCall![1]).toEqual(['respond_to_dm', 'read_learner_context', 'read_student_success_snapshot', 'assess_student_health']);
    expect(mockMaybeReclassify).not.toHaveBeenCalled();
  });

  it('an existing agent (created:false) is checked via maybeReclassifyAutonomyLevel with the REAL pre-update tools_granted, before agent.update() applies the new one', async () => {
    // Tagged per-agent-name, not a flat list — seedAgentRegistry() loops
    // over 230+ agents, each pushing its own update/reclassify pair, so a
    // flat "does update ever precede reclassify" check would trivially
    // pass from unrelated agents regardless of whether THIS ordering fix
    // is even correct. Only Reese's own two entries prove it.
    const callOrder: string[] = [];
    mockFindOrCreate.mockImplementation(async ({ defaults, where }: any) => {
      const name = where?.agent_name;
      const agent = {
        ...defaults,
        id: 'agent-1',
        // Deliberately different from Reese's real current registry
        // tools_granted, only for Reese — every other agent's mocked row
        // just reuses its own defaults so the assertion below can identify
        // Reese's call specifically, same precision as the sibling
        // persona-version-history integration test.
        tools_granted: name === 'Reese' ? ['old_tool_from_before_this_boot'] : defaults.tools_granted,
        config: {},
        enabled: true,
        autonomy_level_source: 'auto',
        update: jest.fn().mockImplementation(async () => { callOrder.push(`update:${name}`); }),
      };
      return [agent, false]; // !created — the branch under test
    });
    mockMaybeReclassify.mockImplementation(async (agent: any) => { callOrder.push(`reclassify:${agent.agent_name}`); });

    await seedAgentRegistry();

    const reeseCall = mockMaybeReclassify.mock.calls.find((c) => c[0]?.agent_name === 'Reese');
    expect(reeseCall).toBeDefined();
    expect(reeseCall![1]).toEqual(['old_tool_from_before_this_boot']); // the real pre-update stored value, not the new one
    expect(mockClassifyNew).not.toHaveBeenCalled();
    // Reese's own update must happen before Reese's own reclassify check —
    // the field itself needs the new tools_granted committed first, but the
    // PREVIOUS value passed to maybeReclassifyAutonomyLevel is still the
    // real pre-update one, captured before that update ran.
    expect(callOrder.indexOf('update:Reese')).toBeGreaterThanOrEqual(0);
    expect(callOrder.indexOf('reclassify:Reese')).toBeGreaterThan(callOrder.indexOf('update:Reese'));
  });
});
