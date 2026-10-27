/**
 * cronInstrumentation — BC #10099862873 (P1, item 1): extracted from
 * schedulerService.ts so aiOpsScheduler.ts's previously-untracked cron jobs
 * can report into the same AiAgent registry that cronHealthAlertService.ts
 * reads for error-rate/missed-run alerting. Previously had zero direct
 * tests (only exercised indirectly through whichever cron job happened to
 * fire in other tests) — first dedicated coverage for this function.
 */
// Two mocks, one function behind them. `cronInstrumentation` reads the models barrel, while
// `agents/agentControlGate` (which owns the conditional closing write) imports
// `models/AiAgent` directly so it does not drag the barrel's associations into every suite
// that mocks model files individually. Mocking only one of the two leaves the other reaching
// the real Sequelize model.
// The `mock` prefix is required: a jest.mock factory may not reference an out-of-scope
// variable unless its name starts with `mock`.
const mockStaticUpdate = jest.fn();

jest.mock('../../models', () => ({
  AiAgent: { findOne: jest.fn(), update: (...a: unknown[]) => mockStaticUpdate(...a) },
  AiAgentActivityLog: { create: jest.fn() },
}));
jest.mock('../../models/AiAgent', () => ({
  __esModule: true,
  default: { update: (...a: unknown[]) => mockStaticUpdate(...a) },
}));
jest.mock('../../utils/requestContext', () => ({
  runWithRequestContext: (_ctx: any, fn: () => Promise<void>) => fn(),
}));

import { instrumentCronJob } from '../cronInstrumentation';
import { AiAgent, AiAgentActivityLog } from '../../models';

const findOneAgent = AiAgent.findOne as jest.Mock;
const createActivityLog = AiAgentActivityLog.create as jest.Mock;
// The CLOSING write moved from the instance to the static on 2026-10-27, because it is now
// conditional on status = 'running' so a pause set mid-run is not erased by the run ending,
// and an instance update cannot carry a WHERE. The opening status: 'running' write is still
// the instance. The assertions below follow that split; WHAT they assert is unchanged.
const staticUpdate = mockStaticUpdate;

function mockAgent(overrides: Partial<{ enabled: boolean; status: string; run_count: number; avg_duration_ms: number | null; error_count: number }> = {}) {
  const agent: Record<string, any> = { enabled: true, status: 'idle', run_count: 0, avg_duration_ms: null, error_count: 0, id: 'agent-1', ...overrides };
  agent.update = jest.fn(async (fields: Record<string, any>) => Object.assign(agent, fields));
  return agent;
}

describe('instrumentCronJob', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Sequelize's static update resolves to [affectedCount]. The closing write destructures it.
    staticUpdate.mockResolvedValue([1]);
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('a pause set DURING the run survives the run ending', async () => {
    // Finding 33. The closing write used to be unconditional, so a pause issued while the job
    // was running was erased the moment it finished. Zero rows affected means the row is no
    // longer `running` - somebody paused it - and their change must win.
    const agent = mockAgent({ run_count: 7 });
    findOneAgent.mockResolvedValue(agent);
    staticUpdate.mockResolvedValueOnce([0]).mockResolvedValueOnce([1]);

    await instrumentCronJob('TestJob', jest.fn().mockResolvedValue(undefined));

    // Second write carries the bookkeeping but NOT the status, so the pause stands.
    const lastFields = staticUpdate.mock.calls[staticUpdate.mock.calls.length - 1][0];
    expect(lastFields.status).toBeUndefined();
    expect(lastFields).toEqual(expect.objectContaining({ run_count: 8 }));
  });

  it('happy path: runs the job, updates run_count and last_run_at, logs a success activity row', async () => {
    const agent = mockAgent({ run_count: 4 });
    findOneAgent.mockResolvedValue(agent);
    const fn = jest.fn().mockResolvedValue(undefined);

    await instrumentCronJob('TestJob', fn);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(agent.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'running' }));
    expect(staticUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'idle', run_count: 5 }),
      expect.objectContaining({ where: { id: 'agent-1', status: 'running' } }),
    );
    expect(createActivityLog).toHaveBeenCalledWith(expect.objectContaining({ agent_id: 'agent-1', result: 'success' }));
  });

  it('failure path: a throwing job increments error_count and logs a failed activity row, without throwing itself', async () => {
    const agent = mockAgent({ run_count: 2, error_count: 1 });
    findOneAgent.mockResolvedValue(agent);
    const fn = jest.fn().mockRejectedValue(new Error('job blew up'));

    await expect(instrumentCronJob('TestJob', fn)).resolves.toBeUndefined();

    expect(staticUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'idle', run_count: 3, error_count: 2, last_error: 'job blew up' }),
      expect.objectContaining({ where: { id: 'agent-1', status: 'running' } }),
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
    // The closing write is now a STATIC update, which does not mutate the in-memory instance the
    // way the old instance update did. Production re-reads the row with its own findOne on every
    // call, so the next run sees the new count; this mock has to do the same or the suite would
    // be asserting an artifact of sharing one object across both runs.
    staticUpdate.mockImplementation(async (fields: Record<string, any>) => {
      Object.assign(agent, fields);
      return [1];
    });
    const fn = jest.fn().mockResolvedValue(undefined);

    await instrumentCronJob('TestJob', fn);
    await instrumentCronJob('TestJob', fn);

    expect(staticUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ run_count: 2 }), expect.anything(),
    );
  });

  it('failure path: an activity-log write failure is caught and logged, not thrown', async () => {
    const agent = mockAgent();
    findOneAgent.mockResolvedValue(agent);
    createActivityLog.mockRejectedValue(new Error('log write failed'));
    const fn = jest.fn().mockResolvedValue(undefined);

    await expect(instrumentCronJob('TestJob', fn)).resolves.toBeUndefined();
  });
});
