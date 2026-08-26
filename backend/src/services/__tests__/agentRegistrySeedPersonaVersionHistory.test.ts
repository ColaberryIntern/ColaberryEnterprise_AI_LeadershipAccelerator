/**
 * Trust Contract Phase 1 (2026-08-26) — confirms `seedAgentRegistry()` (the
 * ONE real place `AiAgent.persona_version` ever changes, per this run's
 * investigation) actually calls `recordPersonaVersionChangeIfNeeded()` at the
 * right point in both branches: a brand-new agent (first-ever version) and an
 * existing agent whose registry entry's version has genuinely changed since
 * the last boot. Scoped to Reese specifically (a real registry entry with a
 * real `persona_version`), same narrow-scope convention as
 * agentRegistrySeedReeseOutreach.test.ts — not re-testing the whole 130+-entry
 * registry.
 */
jest.mock('../../models/AiAgent', () => ({ findOrCreate: jest.fn() }));
jest.mock('../reese/reeseIdentitySeed', () => ({ seedReeseIdentity: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../reese/reeseSystemPrompt', () => ({ REESE_PERSONA_BLOCK: 'MOCKED_PERSONA_BLOCK' }));
jest.mock('../agentPersonaVersionHistoryService', () => ({ recordPersonaVersionChangeIfNeeded: jest.fn() }));

import AiAgent from '../../models/AiAgent';
import { seedAgentRegistry } from '../agentRegistrySeed';
import { recordPersonaVersionChangeIfNeeded } from '../agentPersonaVersionHistoryService';

const mockFindOrCreate = AiAgent.findOrCreate as unknown as jest.Mock;
const mockRecordChange = recordPersonaVersionChangeIfNeeded as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

function findCallFor(agentName: string) {
  return mockFindOrCreate.mock.calls.find((call) => call[0]?.where?.agent_name === agentName);
}

describe('agentRegistrySeed — persona version history wiring', () => {
  it('a brand-new agent (created:true) records its first-ever version with previous_version: null', async () => {
    mockFindOrCreate.mockImplementation(async ({ defaults }: any) => [
      { ...defaults, id: 'agent-1', persona_version: defaults.persona_version, update: jest.fn().mockResolvedValue(undefined) },
      true,
    ]);

    await seedAgentRegistry();

    expect(findCallFor('Reese')).toBeDefined();
    // recordPersonaVersionChangeIfNeeded(agentId, null, entry) — previousVersion is null on first creation.
    const reeseCall = mockRecordChange.mock.calls.find((c) => c[2]?.agent_name === 'Reese');
    expect(reeseCall).toBeDefined();
    expect(reeseCall![1]).toBeNull();
  });

  it('an existing agent (created:false) passes the REAL pre-update stored version as previousVersion, before agent.update() applies the new one', async () => {
    const callOrder: string[] = [];
    mockFindOrCreate.mockImplementation(async ({ defaults, where }: any) => {
      const agent = {
        ...defaults,
        id: 'agent-1',
        persona_version: '2026-01-01', // the OLD stored value — deliberately different from the registry's real current value
        config: {},
        enabled: true,
        update: jest.fn().mockImplementation(async () => { callOrder.push('update'); }),
      };
      return [agent, false]; // !created — the branch under test
    });
    mockRecordChange.mockImplementation(async () => { callOrder.push('record'); });

    await seedAgentRegistry();

    const reeseCall = mockRecordChange.mock.calls.find((c) => c[2]?.agent_name === 'Reese');
    expect(reeseCall).toBeDefined();
    expect(reeseCall![0]).toBe('agent-1'); // agentId
    expect(reeseCall![1]).toBe('2026-01-01'); // the real pre-update stored value, not the new one
    // The history write must happen BEFORE agent.update() overwrites the column —
    // otherwise "previous version" would already be gone by the time it's read.
    expect(callOrder.indexOf('record')).toBeLessThan(callOrder.indexOf('update'));
  });
});
