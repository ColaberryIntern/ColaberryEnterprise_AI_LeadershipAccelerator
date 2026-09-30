/**
 * bpos_orchestrator ticket auto-resolve (2026-08-16) — registry test for the new
 * `BposCapabilityTicketAutoResolver` cron. Confirms it is a real AiAgent registry row,
 * `trigger_type:'cron'`, `enabled:false` (seeded disabled — held until the reviewed
 * historical clear succeeds in production, per this run's execution-contract.md), and
 * that its `schedule` string does not collide with any other entry in the full
 * registry. Mirrors agentRegistrySeedReeseStudentSupportSupersession.test.ts's exact
 * mocking shape.
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

describe('agentRegistrySeed — BposCapabilityTicketAutoResolver registration', () => {
  it('registers as a real cron job, seeded enabled:false (held until the reviewed historical clear succeeds)', async () => {
    await seedAgentRegistry();

    const call = findCallFor('BposCapabilityTicketAutoResolver');
    expect(call).toBeDefined();
    expect(call![0].defaults.trigger_type).toBe('cron');
    expect(call![0].defaults.enabled).toBe(false);
    expect(call![0].defaults.module).toBe('company');
    expect(call![0].defaults.schedule).toBe('55 */6 * * *');
  });

  it('the existing bpos_orchestrator ticket_creator_identity row is untouched (still on_demand, no schedule)', async () => {
    await seedAgentRegistry();

    const call = findCallFor('bpos_orchestrator');
    expect(call).toBeDefined();
    expect(call![0].defaults.trigger_type).toBe('on_demand');
    expect(call![0].defaults.agent_type).toBe('ticket_creator_identity');
  });

  it('idempotent: running the seed twice never creates a duplicate row (findOrCreate, not create)', async () => {
    await seedAgentRegistry();
    mockFindOrCreate.mockImplementation(async ({ defaults }: any) => [
      { ...defaults, update: jest.fn().mockResolvedValue(undefined) },
      false, // second run: row already existed
    ]);
    await seedAgentRegistry();

    const calls = mockFindOrCreate.mock.calls.filter(
      (c) => c[0]?.where?.agent_name === 'BposCapabilityTicketAutoResolver',
    );
    expect(calls.length).toBe(2); // called twice, but via findOrCreate both times — never Model.create
    for (const call of calls) {
      expect(call[0].where).toEqual({ agent_name: 'BposCapabilityTicketAutoResolver' });
    }
  });

  it('enabled:false is honored only on first creation — once a human flips it to true, a redeploy never resets it', async () => {
    const targetInstance = { enabled: true, config: {}, update: jest.fn().mockResolvedValue(undefined) };
    mockFindOrCreate.mockImplementation(async ({ where }: any) =>
      where.agent_name === 'BposCapabilityTicketAutoResolver'
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
  it('no other registry entry shares BposCapabilityTicketAutoResolver\'s exact schedule string', async () => {
    await seedAgentRegistry();

    const scheduleCallsAt5560 = mockFindOrCreate.mock.calls.filter(
      (c) => c[0]?.defaults?.schedule === '55 */6 * * *',
    );
    expect(scheduleCallsAt5560).toHaveLength(1);
    expect(scheduleCallsAt5560[0][0].where.agent_name).toBe('BposCapabilityTicketAutoResolver');
  });
});
