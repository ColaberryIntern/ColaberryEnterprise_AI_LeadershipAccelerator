/**
 * Reese ticket auto-resolve (2026-08-16) — registry test for the new
 * `ReeseStudentSupportSupersessionResolver` cron. Confirms it is a real AiAgent
 * registry row, `trigger_type:'cron'`, `enabled:false` (seeded disabled — held
 * until the reviewed historical clear succeeds in production, per this run's
 * execution-contract.md), and that its `schedule` string does not collide with any
 * other entry in the full registry. Mirrors
 * agentRegistrySeedReeseOutreach.test.ts's exact mocking shape (same reason: cut
 * the reeseSystemPrompt.ts -> learnerContextService.ts -> full models/index.ts
 * association-wiring chain, which this test doesn't need).
 */
jest.mock('../../models/AiAgent', () => ({ findOrCreate: jest.fn(), update: jest.fn() }));
jest.mock('../reese/reeseIdentitySeed', () => ({ seedReeseIdentity: jest.fn().mockResolvedValue(undefined) }));
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

describe('agentRegistrySeed — ReeseStudentSupportSupersessionResolver registration', () => {
  it('registers as a real cron job, seeded enabled:false (held until the reviewed historical clear succeeds)', async () => {
    await seedAgentRegistry();

    const call = findCallFor('ReeseStudentSupportSupersessionResolver');
    expect(call).toBeDefined();
    expect(call![0].defaults.trigger_type).toBe('cron');
    expect(call![0].defaults.enabled).toBe(false);
    expect(call![0].defaults.module).toBe('reese');
    expect(call![0].defaults.schedule).toBe('0 17 * * *');
  });

  it('idempotent: running the seed twice never creates a duplicate row (findOrCreate, not create)', async () => {
    await seedAgentRegistry();
    mockFindOrCreate.mockImplementation(async ({ defaults }: any) => [
      { ...defaults, update: jest.fn().mockResolvedValue(undefined) },
      false, // second run: row already existed
    ]);
    await seedAgentRegistry();

    const calls = mockFindOrCreate.mock.calls.filter(
      (c) => c[0]?.where?.agent_name === 'ReeseStudentSupportSupersessionResolver',
    );
    expect(calls.length).toBe(2); // called twice, but via findOrCreate both times — never Model.create
    for (const call of calls) {
      expect(call[0].where).toEqual({ agent_name: 'ReeseStudentSupportSupersessionResolver' });
    }
  });

  it('enabled:false is honored only on first creation — once a human flips it to true, a redeploy never resets it', async () => {
    // Mirrors the sibling Phase 2 crons' own documented contract for the `enabled?`
    // field (see agentRegistrySeed.ts's AgentSeedEntry interface comment). Simulates
    // a SECOND boot after a human already flipped this row to enabled:true in
    // production — findOrCreate's own `created:false` branch calls `agent.update()`
    // with a fixed field list that must never include `enabled`, or every redeploy
    // would silently re-disable an operator's own decision.
    const targetInstance = { enabled: true, config: {}, update: jest.fn().mockResolvedValue(undefined) };
    mockFindOrCreate.mockImplementation(async ({ where }: any) =>
      where.agent_name === 'ReeseStudentSupportSupersessionResolver'
        ? [targetInstance, false] // created:false — row already exists, human already enabled it
        : [{ config: {}, update: jest.fn().mockResolvedValue(undefined) }, false],
    );

    await seedAgentRegistry();

    expect(targetInstance.update).toHaveBeenCalled();
    const updatePayload = targetInstance.update.mock.calls[0][0];
    expect(updatePayload).not.toHaveProperty('enabled');
  });
});

describe('agentRegistrySeed — schedule collision check', () => {
  it('no other registry entry shares ReeseStudentSupportSupersessionResolver\'s exact schedule string', async () => {
    await seedAgentRegistry();

    const scheduleCallsAt0170 = mockFindOrCreate.mock.calls.filter(
      (c) => c[0]?.defaults?.schedule === '0 17 * * *',
    );
    expect(scheduleCallsAt0170).toHaveLength(1);
    expect(scheduleCallsAt0170[0][0].where.agent_name).toBe('ReeseStudentSupportSupersessionResolver');
  });

  it('sequences naturally after Reese\'s own two existing crons (0 15, 0 16) without colliding with either', async () => {
    await seedAgentRegistry();

    const sweep = findCallFor('ReeseAutonomousOutreachSweep');
    const followUps = findCallFor('ReeseOutreachFollowUps');
    const supersession = findCallFor('ReeseStudentSupportSupersessionResolver');

    expect(sweep![0].defaults.schedule).toBe('0 15 * * *');
    expect(followUps![0].defaults.schedule).toBe('0 16 * * *');
    expect(supersession![0].defaults.schedule).toBe('0 17 * * *');
    const schedules = [sweep, followUps, supersession].map((c) => c![0].defaults.schedule);
    expect(new Set(schedules).size).toBe(3); // all three distinct
  });
});
