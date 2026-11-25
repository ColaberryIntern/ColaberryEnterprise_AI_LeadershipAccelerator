const m = {
  schedule: jest.fn(),
  instrument: jest.fn(),
  sweep: jest.fn(),
};
jest.mock('node-cron', () => ({ __esModule: true, default: { schedule: (...a: unknown[]) => m.schedule(...a) } }));
jest.mock('../../cronInstrumentation', () => ({ instrumentCronJob: (...a: unknown[]) => m.instrument(...a) }));
jest.mock('../../agentDomain/planRepoSyncSweep', () => ({ runPlanRepoSync: (...a: unknown[]) => m.sweep(...a) }));

import * as fs from 'fs';
import * as path from 'path';
import { registerPlanRepoSyncCrons, PLAN_REPO_SYNC_AGENT, PLAN_REPO_SYNC_SCHEDULE } from '../planRepoSyncCrons';

/**
 * The plan-to-repo sweep's registration.
 *
 * Three things have to agree or the job is invisible: the cron expression it registers on,
 * the `ai_agents` row that records its runs, and the generated timer scan that is the only
 * list of what is actually wired to a clock. A job whose registry row disagrees with its
 * clock reports against the wrong schedule, and a timer with no `reportsAs` fires watched
 * by nobody. Those are the exact findings this job was written in response to, so the pins
 * below are not ceremony.
 *
 * Source-level assertions, like the scheduler's other cron guards, because importing
 * `schedulerService` pulls in half the service graph.
 */

const ROOT = path.join(__dirname, '..', '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const crons = read('services/scheduling/planRepoSyncCrons.ts');
const scheduler = read('services/schedulerService.ts');
const registry = read('services/agentRegistry/agentDomainPlanSyncAgents.ts');
const seed = read('services/agentRegistrySeed.ts');
const timerScan = read('data/platformOperations/timerScan.ts');

const AGENT = 'AgentDomainPlanRepoSync';
const SCHEDULE = '41 */6 * * *';

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset();
  m.instrument.mockImplementation(async (_name: string, body: () => Promise<void>) => body());
  m.sweep.mockResolvedValue({ attempted: 0, written: 0, unchanged: 0, skipped: 0, failed: 0, drifted: 0 });
});

describe('registration', () => {
  it('registers exactly one cron, on the published schedule', () => {
    registerPlanRepoSyncCrons();
    expect(m.schedule).toHaveBeenCalledTimes(1);
    expect(m.schedule.mock.calls[0][0]).toBe(SCHEDULE);
  });

  it('runs the sweep through instrumentCronJob, under the registry name', async () => {
    registerPlanRepoSyncCrons();
    await m.schedule.mock.calls[0][1]();
    expect(m.instrument).toHaveBeenCalledTimes(1);
    expect(m.instrument.mock.calls[0][0]).toBe(AGENT);
    expect(m.sweep).toHaveBeenCalledTimes(1);
  });

  it('swallows a failing sweep so one bad run cannot take the scheduler down', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    m.instrument.mockRejectedValue(new Error('boom'));
    registerPlanRepoSyncCrons();
    await expect(Promise.resolve(m.schedule.mock.calls[0][1]())).resolves.not.toThrow();
    await new Promise((r) => setImmediate(r));
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it('exports its agent name and schedule as constants that match what it registers', () => {
    expect(PLAN_REPO_SYNC_AGENT).toBe(AGENT);
    expect(PLAN_REPO_SYNC_SCHEDULE).toBe(SCHEDULE);
  });
});

describe('the three records agree', () => {
  it('registers the schedule as a literal, so the timer scan can read it', () => {
    // scanTimers refuses to guess at a non-literal argument: pass a constant here and the
    // generated scan records `schedule: null`, which is how a timer goes unaccounted for.
    expect(crons).toContain(`cron.schedule('${SCHEDULE}'`);
    expect(crons).toContain(`instrumentCronJob('${AGENT}'`);
  });

  it('carries a registry row whose schedule is byte-identical to the cron expression', () => {
    expect(registry).toContain(`agent_name: '${AGENT}'`);
    expect(registry).toContain(`schedule: '${SCHEDULE}'`);
    expect(registry).toContain("trigger_type: 'cron'");
    expect(registry).toContain("agent_type: 'scheduled_processor'");
  });

  it('is spread into the registry seed, or the row would never be created', () => {
    expect(seed).toContain("import { AGENT_DOMAIN_PLAN_SYNC_ENTRIES } from './agentRegistry/agentDomainPlanSyncAgents';");
    expect(seed.split('...AGENT_DOMAIN_PLAN_SYNC_ENTRIES,').length - 1).toBe(1);
  });

  it('appears in the generated timer scan with a schedule and a reporting name', () => {
    const line = timerScan
      .split('\n')
      .find((l) => l.includes('services/scheduling/planRepoSyncCrons.ts'));
    expect(line).toBeDefined();
    expect(line).toContain(`schedule: "${SCHEDULE}"`);
    expect(line).toContain(`reportsAs: "${AGENT}"`);
  });

  it('the scheduler calls the module exactly once and names the agent nowhere itself', () => {
    expect(scheduler).toContain("import { registerPlanRepoSyncCrons } from './scheduling/planRepoSyncCrons';");
    expect(scheduler.split('registerPlanRepoSyncCrons();').length - 1).toBe(1);
    expect(scheduler).not.toContain(AGENT);
  });
});
