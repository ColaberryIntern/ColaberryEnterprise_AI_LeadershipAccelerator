/**
 * MandrillOpenClickPoll — registry test. schedulerService.ts has called
 * instrumentCronJob('MandrillOpenClickPoll', ...) every 30 minutes since the poll
 * existed, but with no AiAgent row instrumentCronJob() took its "not in registry,
 * run untracked" branch on every run: no run_count/error_count, no activity-log
 * row, invisible to cronHealthAlertService's missed-run alerting and to Admin >
 * Agents. Noticed 2026-09-11 when the first tick after a deploy could not be
 * confirmed from anything the platform recorded. Same pattern as
 * agentRegistrySeedReesePresenceHeartbeat.test.ts; scoped to this one entry.
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

const findCallFor = (agentName: string) =>
  mockFindOrCreate.mock.calls.find((call) => call[0]?.where?.agent_name === agentName);

describe('agentRegistrySeed — MandrillOpenClickPoll registration', () => {
  it('registers the poll under the exact name instrumentCronJob() looks up, on its real schedule, enabled', async () => {
    await seedAgentRegistry();
    const call = findCallFor('MandrillOpenClickPoll');
    expect(call).toBeDefined();
    const d = call![0].defaults;
    expect(d.trigger_type).toBe('cron');
    expect(d.schedule).toBe('5,35 * * * *'); // must match cron.schedule() in schedulerService.ts
    expect(d.module).toBe('schedulerService');
    expect(d.source_file).toBe('backend/src/services/mandrillEngagementPoll.ts');
    // No `enabled: false`: this job has always run; registering it must not pause it.
    expect(d.enabled).not.toBe(false);
  });

  it('idempotent: the seed goes through findOrCreate both times, never a bare create', async () => {
    await seedAgentRegistry();
    mockFindOrCreate.mockImplementation(async ({ defaults }: any) => [
      { ...defaults, update: jest.fn().mockResolvedValue(undefined) },
      false,
    ]);
    await seedAgentRegistry();
    const calls = mockFindOrCreate.mock.calls.filter((c) => c[0]?.where?.agent_name === 'MandrillOpenClickPoll');
    expect(calls).toHaveLength(2);
    for (const call of calls) expect(call[0].where).toEqual({ agent_name: 'MandrillOpenClickPoll' });
  });
});
