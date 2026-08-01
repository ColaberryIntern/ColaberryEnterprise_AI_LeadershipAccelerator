jest.mock('../../models/AiAgent', () => ({ __esModule: true, default: { findOne: jest.fn() } }));

import AiAgent from '../../models/AiAgent';
import { trackAgentRun } from '../agentRunTracker';

const findOneMock = AiAgent.findOne as jest.Mock;

function fakeAgent(overrides: Partial<{ enabled: boolean; run_count: number; avg_duration_ms: number | null }> = {}) {
  const update = jest.fn().mockResolvedValue(undefined);
  return {
    enabled: true,
    run_count: 0,
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
