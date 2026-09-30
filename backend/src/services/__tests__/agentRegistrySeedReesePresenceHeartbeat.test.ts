/**
 * ReesePresenceHeartbeat — registry test. Closes a real gap: schedulerService.ts's
 * startScheduler() has called instrumentCronJob('ReesePresenceHeartbeat', ...) every
 * minute since Reese Phase 1, but with no matching AiAgent row instrumentCronJob()
 * takes its "agent not in registry, run untracked" branch on every run — no
 * enabled/paused gate, no run_count/error_count, no AiAgentActivityLog row, invisible
 * to cronHealthAlertService's missed-run alerting and to Admin > Agents. This pins
 * the row now existing, enabled, real cron trigger — the same pattern
 * agentRegistrySeedReeseOutreach.test.ts already established for Reese's other cron
 * jobs. Scoped narrowly to this one entry, not the whole 130+-entry registry seed.
 */
jest.mock('../../models/AiAgent', () => ({ findOrCreate: jest.fn(), update: jest.fn() }));
jest.mock('../reese/reeseIdentitySeed', () => ({ seedReeseIdentity: jest.fn().mockResolvedValue(undefined) }));
// agentRegistrySeed.ts imports REESE_PERSONA_BLOCK from reeseSystemPrompt.ts, which
// transitively imports learnerContextService.ts -> the FULL models/index.ts barrel
// (association wiring at module-load time, requiring every mocked model to implement
// hasMany/belongsTo/etc.). Mocked directly here to cut that chain — this test only
// needs the registry array's shape, not the real persona text or any association graph.
jest.mock('../reese/reeseSystemPrompt', () => ({ REESE_PERSONA_BLOCK: 'MOCKED_PERSONA_BLOCK' }));

import AiAgent from '../../models/AiAgent';
import { seedAgentRegistry } from '../agentRegistrySeed';

const mockFindOrCreate = AiAgent.findOrCreate as unknown as jest.Mock;
const mockUpdate = AiAgent.update as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockFindOrCreate.mockImplementation(async ({ defaults }: any) => [
    { ...defaults, update: jest.fn().mockResolvedValue(undefined) },
    true,
  ]);
  mockUpdate.mockResolvedValue([0]);
});

function findCallFor(agentName: string) {
  return mockFindOrCreate.mock.calls.find((call) => call[0]?.where?.agent_name === agentName);
}

describe('agentRegistrySeed — ReesePresenceHeartbeat registration', () => {
  it('registers ReesePresenceHeartbeat as a real, enabled, per-minute cron job — the exact name instrumentCronJob() has always looked up', async () => {
    await seedAgentRegistry();

    const call = findCallFor('ReesePresenceHeartbeat');
    expect(call).toBeDefined();
    expect(call![0].defaults.trigger_type).toBe('cron');
    expect(call![0].defaults.schedule).toBe('*/1 * * * *');
    expect(call![0].defaults.enabled).toBe(true);
    expect(call![0].defaults.module).toBe('reese');
  });

  it('idempotent: running the seed twice never creates a duplicate row (findOrCreate, not create)', async () => {
    await seedAgentRegistry();
    mockFindOrCreate.mockImplementation(async ({ defaults }: any) => [
      { ...defaults, update: jest.fn().mockResolvedValue(undefined) },
      false, // second run: row already existed
    ]);
    await seedAgentRegistry();

    const calls = mockFindOrCreate.mock.calls.filter((c) => c[0]?.where?.agent_name === 'ReesePresenceHeartbeat');
    expect(calls.length).toBe(2); // called twice, but via findOrCreate both times — never Model.create
    for (const call of calls) {
      expect(call[0].where).toEqual({ agent_name: 'ReesePresenceHeartbeat' });
    }
  });
});
