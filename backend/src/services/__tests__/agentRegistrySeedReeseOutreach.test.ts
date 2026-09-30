/**
 * Reese Phase 2 (Autonomous Outreach) — registry test. Confirms the two new
 * cron jobs (ReeseAutonomousOutreachSweep, ReeseOutreachFollowUps) are real
 * AiAgent registry rows, `enabled:true`, `trigger_type:'cron'` — the row
 * schedulerService.ts's instrumentCronJob() needs to exist for its
 * enabled/paused pause mechanism to actually gate these jobs (the real
 * rollback/kill-switch this run relies on; see execution-contract.md). Scoped
 * narrowly to these two entries rather than re-testing the whole 130+-entry
 * registry seed, which has no existing dedicated test file.
 */
jest.mock('../../models/AiAgent', () => ({ findOrCreate: jest.fn(), update: jest.fn() }));
jest.mock('../reese/reeseIdentitySeed', () => ({ seedReeseIdentity: jest.fn().mockResolvedValue(undefined) }));
// agentRegistrySeed.ts imports REESE_PERSONA_BLOCK from reeseSystemPrompt.ts,
// which transitively imports learnerContextService.ts -> the FULL models/index.ts
// barrel (association wiring at module-load time, requiring every mocked
// model to implement hasMany/belongsTo/etc.). Mocked directly here to cut
// that chain — this test only needs the registry array's shape, not the real
// persona text or any model association graph.
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

describe('agentRegistrySeed — Reese Phase 2 cron registrations', () => {
  it('registers ReeseAutonomousOutreachSweep as a real, enabled cron job', async () => {
    await seedAgentRegistry();

    const call = findCallFor('ReeseAutonomousOutreachSweep');
    expect(call).toBeDefined();
    expect(call![0].defaults.trigger_type).toBe('cron');
    expect(call![0].defaults.enabled).toBe(true);
    expect(call![0].defaults.module).toBe('reese');
  });

  it('registers ReeseOutreachFollowUps as a real, enabled cron job', async () => {
    await seedAgentRegistry();

    const call = findCallFor('ReeseOutreachFollowUps');
    expect(call).toBeDefined();
    expect(call![0].defaults.trigger_type).toBe('cron');
    expect(call![0].defaults.enabled).toBe(true);
  });

  it('idempotent: running the seed twice never creates a duplicate row (findOrCreate, not create)', async () => {
    await seedAgentRegistry();
    mockFindOrCreate.mockImplementation(async ({ defaults }: any) => [
      { ...defaults, update: jest.fn().mockResolvedValue(undefined) },
      false, // second run: row already existed
    ]);
    await seedAgentRegistry();

    const sweepCalls = mockFindOrCreate.mock.calls.filter((c) => c[0]?.where?.agent_name === 'ReeseAutonomousOutreachSweep');
    expect(sweepCalls.length).toBe(2); // called twice, but via findOrCreate both times — never Model.create
    for (const call of sweepCalls) {
      expect(call[0].where).toEqual({ agent_name: 'ReeseAutonomousOutreachSweep' });
    }
  });
});
