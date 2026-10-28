jest.mock('../../models/AiAgent', () => ({ __esModule: true, default: { findOne: jest.fn() } }));

import AiAgent from '../../models/AiAgent';
import { trackAgentRun } from '../agentRunTracker';

const findOneMock = AiAgent.findOne as jest.Mock;

function fakeAgent(
  overrides: Partial<{
    enabled: boolean;
    run_count: number;
    error_count: number;
    avg_duration_ms: number | null;
  }> = {},
) {
  const update = jest.fn().mockResolvedValue(undefined);
  return {
    enabled: true,
    run_count: 0,
    error_count: 0,
    avg_duration_ms: null as number | null,
    ...overrides,
    update,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('trackAgentRun', () => {
  it('happy path: runs fn, increments run_count, sets last_run_at, computes avg_duration_ms', async () => {
    const agent = fakeAgent({ run_count: 4, avg_duration_ms: 100 });
    findOneMock.mockResolvedValue(agent);
    const fn = jest.fn().mockResolvedValue('ok');

    const result = await trackAgentRun('SomeAgent', fn);

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(agent.update).toHaveBeenCalledTimes(1);
    const call = agent.update.mock.calls[0][0];
    expect(call.run_count).toBe(5);
    expect(call.last_run_at).toBeInstanceOf(Date);
    expect(typeof call.avg_duration_ms).toBe('number');
    // The other half of the fix below: a success must never move error_count, or the health
    // score decays on a job that is working.
    expect(call.error_count).toBeUndefined();
  });

  it('failure path: run_count still increments, last_error is set, and the error is rethrown', async () => {
    const agent = fakeAgent({ run_count: 2 });
    findOneMock.mockResolvedValue(agent);
    const fn = jest.fn().mockRejectedValue(new Error('boom'));

    await expect(trackAgentRun('SomeAgent', fn)).rejects.toThrow('boom');

    expect(agent.update).toHaveBeenCalledTimes(1);
    const call = agent.update.mock.calls[0][0];
    expect(call.run_count).toBe(3);
    expect(call.last_error).toBe('boom');
    expect(call.last_error_at).toBeInstanceOf(Date);
  });

  /**
   * Reported by Quincy 2026-10-28. This file's own failure-path test above asserted
   * run_count and last_error and never looked at error_count, so the defect was encoded as
   * correct behaviour by the test that was supposed to catch it.
   *
   * aiOpsService.ts:472 scores health as `100 - error_count / max(run_count, 1) * 200`,
   * clamped at 0. With error_count frozen, that is exactly 100 no matter how many runs fail.
   */
  it('failure path: error_count increments, so a failing job cannot score a green 100', async () => {
    const agent = fakeAgent({ run_count: 9, error_count: 3 });
    findOneMock.mockResolvedValue(agent);

    await expect(trackAgentRun('SomeAgent', jest.fn().mockRejectedValue(new Error('boom'))))
      .rejects.toThrow('boom');

    const call = agent.update.mock.calls[0][0];
    expect(call.error_count).toBe(4);

    // The assertion that actually proves the symptom is gone, rather than proving the field
    // moved: run the product's own formula over the row this update would leave behind.
    const health = (runs: number, errors: number) =>
      Math.max(0, Math.round(100 - (errors / Math.max(runs, 1)) * 200));
    expect(health(call.run_count, call.error_count)).toBeLessThan(100);
    // An all-failing timer, which is the case Quincy found reading as healthy.
    expect(health(6, 6)).toBe(0);
  });

  /**
   * Writing a status here would make this file a completion writer able to erase an
   * operator's mid-run pause, because the gate that prevents that is only reached by callers
   * that claim the run with `status: 'running'`. Pinned at the unit level too, so the
   * reason travels with the code rather than living only in the tree-wide sweep.
   */
  it('neither path writes a status, on which the no-gate-needed invariant rests', async () => {
    const ok = fakeAgent();
    findOneMock.mockResolvedValue(ok);
    await trackAgentRun('SomeAgent', jest.fn().mockResolvedValue('ok'));
    expect(ok.update.mock.calls[0][0].status).toBeUndefined();

    const bad = fakeAgent();
    findOneMock.mockResolvedValue(bad);
    await expect(trackAgentRun('SomeAgent', jest.fn().mockRejectedValue(new Error('boom'))))
      .rejects.toThrow('boom');
    expect(bad.update.mock.calls[0][0].status).toBeUndefined();
  });

  // Regression (found in production verification, 2026-08-01): CoryEvolutionCycle has
  // no AiAgent row at all, and an earlier version of this function treated "not found"
  // the same as "explicitly disabled" — silently skipping fn() and stopping a real,
  // previously-working scheduled job from ever running again. A missing dashboard
  // registration must never gate real business logic (CLAUDE.md Failure-First Design).
  it('boundary: agent not found still RUNS fn and returns its result — only bookkeeping is skipped', async () => {
    findOneMock.mockResolvedValue(null);
    const fn = jest.fn().mockResolvedValue('ran-anyway');

    const result = await trackAgentRun('UnregisteredAgent', fn);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(result).toBe('ran-anyway');
  });

  it('boundary: disabled agent is skipped without calling fn or updating the row', async () => {
    const agent = fakeAgent({ enabled: false });
    findOneMock.mockResolvedValue(agent);
    const fn = jest.fn();

    const result = await trackAgentRun('DisabledAgent', fn);

    expect(result).toBeNull();
    expect(fn).not.toHaveBeenCalled();
    expect(agent.update).not.toHaveBeenCalled();
  });
});
