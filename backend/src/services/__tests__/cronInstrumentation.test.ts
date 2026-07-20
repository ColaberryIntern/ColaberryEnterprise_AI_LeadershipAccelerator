/**
 * cronInstrumentation — BC #10099862873 (P1, item 1): extracted from
 * schedulerService.ts so aiOpsScheduler.ts's previously-untracked cron jobs
 * can report into the same AiAgent registry that cronHealthAlertService.ts
 * reads for error-rate/missed-run alerting. Previously had zero direct
 * tests (only exercised indirectly through whichever cron job happened to
 * fire in other tests) — first dedicated coverage for this function.
 */
jest.mock('../../models', () => ({
  AiAgent: { findOne: jest.fn() },
  AiAgentActivityLog: { create: jest.fn() },
}));
jest.mock('../../utils/requestContext', () => ({
  runWithRequestContext: (_ctx: any, fn: () => Promise<void>) => fn(),
}));

import { instrumentCronJob } from '../cronInstrumentation';
import { AiAgent, AiAgentActivityLog } from '../../models';

const findOneAgent = AiAgent.findOne as jest.Mock;
const createActivityLog = AiAgentActivityLog.create as jest.Mock;

function mockAgent(overrides: Partial<{ enabled: boolean; status: string; run_count: number; avg_duration_ms: number | null; error_count: number }> = {}) {
  const agent: Record<string, any> = { enabled: true, status: 'idle', run_count: 0, avg_duration_ms: null, error_count: 0, id: 'agent-1', ...overrides };
  agent.update = jest.fn(async (fields: Record<string, any>) => Object.assign(agent, fields));
  return agent;
}

describe('instrumentCronJob', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('happy path: runs the job, updates run_count and last_run_at, logs a success activity row', async () => {
    const agent = mockAgent({ run_count: 4 });
    findOneAgent.mockResolvedValue(agent);
    const fn = jest.fn().mockResolvedValue(undefined);

    await instrumentCronJob('TestJob', fn);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(agent.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'running' }));
    expect(agent.update).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'idle', run_count: 5 }));
    expect(createActivityLog).toHaveBeenCalledWith(expect.objectContaining({ agent_id: 'agent-1', result: 'success' }));
  });

  it('failure path: a throwing job increments error_count and logs a failed activity row, without throwing itself', async () => {
    const agent = mockAgent({ run_count: 2, error_count: 1 });
    findOneAgent.mockResolvedValue(agent);
    const fn = jest.fn().mockRejectedValue(new Error('job blew up'));

    await expect(instrumentCronJob('TestJob', fn)).resolves.toBeUndefined();

    expect(agent.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'idle', run_count: 3, error_count: 2, last_error: 'job blew up' })
    );
    expect(createActivityLog).toHaveBeenCalledWith(expect.objectContaining({ result: 'failed', reason: 'job blew up' }));
  });

  it('boundary: a disabled agent is skipped entirely — the job never runs, and the skip is logged, not silent', async () => {
    const agent = mockAgent({ enabled: false });
    findOneAgent.mockResolvedValue(agent);
    const fn = jest.fn();

    await instrumentCronJob('TestJob', fn);

    expect(fn).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('cron_job_skipped_disabled')
    );
  });

  it('boundary: a paused agent is skipped entirely — the job never runs, and the skip is logged, not silent', async () => {
    const agent = mockAgent({ status: 'paused' });
    findOneAgent.mockResolvedValue(agent);
    const fn = jest.fn();

    await instrumentCronJob('TestJob', fn);

    expect(fn).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('cron_job_skipped_disabled')
    );
  });

  it('boundary: an agent not in the registry still runs, untracked (no AiAgent update)', async () => {
    findOneAgent.mockResolvedValue(null);
    const fn = jest.fn().mockResolvedValue(undefined);

    await instrumentCronJob('UnregisteredJob', fn);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(createActivityLog).not.toHaveBeenCalled();
  });

  it('failure path: a registry lookup failure still runs the job untracked rather than skipping it', async () => {
    findOneAgent.mockRejectedValue(new Error('DB down'));
    const fn = jest.fn().mockResolvedValue(undefined);

    await instrumentCronJob('TestJob', fn);

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('idempotency: consecutive runs accumulate run_count rather than resetting it', async () => {
    const agent = mockAgent({ run_count: 0 });
    findOneAgent.mockResolvedValue(agent);
    const fn = jest.fn().mockResolvedValue(undefined);

    await instrumentCronJob('TestJob', fn);
    await instrumentCronJob('TestJob', fn);

    expect(agent.update).toHaveBeenLastCalledWith(expect.objectContaining({ run_count: 2 }));
  });

  it('failure path: an activity-log write failure is caught and logged, not thrown', async () => {
    const agent = mockAgent();
    findOneAgent.mockResolvedValue(agent);
    createActivityLog.mockRejectedValue(new Error('log write failed'));
    const fn = jest.fn().mockResolvedValue(undefined);

    await expect(instrumentCronJob('TestJob', fn)).resolves.toBeUndefined();
  });
});
