/**
 * cronHealthAlertService tests — BC #10099862873 (P0, item 3): extends cron
 * alerting beyond the single scheduler-heartbeat special case to every
 * cron-triggered AiAgent (error-rate spike + missed-run detection).
 */
jest.mock('../../models/AiAgent', () => ({ findAll: jest.fn() }));
jest.mock('../../models/AiAgentActivityLog', () => ({ findAll: jest.fn() }));
jest.mock('../alertService', () => ({ emitAlert: jest.fn().mockResolvedValue({ id: 'alert-1' }) }));

import { evaluateCronJobHealth, checkAllCronJobHealth, CronJobHealthInput } from '../cronHealthAlertService';
import AiAgent from '../../models/AiAgent';
import AiAgentActivityLog from '../../models/AiAgentActivityLog';
import { emitAlert } from '../alertService';

const findAllAgents = AiAgent.findAll as jest.Mock;
const findAllLogs = AiAgentActivityLog.findAll as jest.Mock;
const mockEmitAlert = emitAlert as jest.Mock;

function baseInput(overrides: Partial<CronJobHealthInput> = {}): CronJobHealthInput {
  return {
    agentName: 'TestJob',
    schedule: null,
    lastRunAt: null,
    recentRuns: [],
    now: new Date('2026-07-16T12:00:00Z'),
    lastError: null,
    ...overrides,
  };
}

describe('evaluateCronJobHealth — pure evaluator', () => {
  it('happy path: no failures, no missed run — no alerts', () => {
    const alerts = evaluateCronJobHealth(baseInput({
      schedule: '*/15 * * * *',
      lastRunAt: new Date('2026-07-16T11:50:00Z'), // 10m ago, well within interval
      recentRuns: Array(5).fill({ result: 'success' }),
    }));
    expect(alerts).toEqual([]);
  });

  it('boundary: below the min sample size (4 runs), even all-failed does not trigger an error-rate alert', () => {
    const alerts = evaluateCronJobHealth(baseInput({
      recentRuns: Array(4).fill({ result: 'failed' }),
    }));
    expect(alerts).toEqual([]);
  });

  it('boundary: error rate at exactly the 50% threshold (3/6) triggers a warning', () => {
    const alerts = evaluateCronJobHealth(baseInput({
      recentRuns: [
        { result: 'failed' }, { result: 'failed' }, { result: 'failed' },
        { result: 'success' }, { result: 'success' }, { result: 'success' },
      ],
    }));
    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe('warning');
    expect(alerts[0].metadata.error_rate).toBe(50);
  });

  it('failure path: error rate at 60% (3/5) triggers a warning, not critical', () => {
    const alerts = evaluateCronJobHealth(baseInput({
      recentRuns: [
        { result: 'failed' }, { result: 'failed' }, { result: 'failed' },
        { result: 'success' }, { result: 'success' },
      ],
    }));
    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe('warning');
    expect(alerts[0].title).toContain('TestJob');
    expect(alerts[0].metadata.error_rate).toBe(60);
  });

  it('failure path: error rate at 80% (4/5) escalates to critical', () => {
    const alerts = evaluateCronJobHealth(baseInput({
      recentRuns: [
        { result: 'failed' }, { result: 'failed' }, { result: 'failed' }, { result: 'failed' },
        { result: 'success' },
      ],
    }));
    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe('critical');
    expect(alerts[0].metadata.error_rate).toBe(80);
  });

  it('boundary: missed-run just under the 2x warning multiplier does not fire', () => {
    const alerts = evaluateCronJobHealth(baseInput({
      schedule: '*/15 * * * *', // ~15m expected interval
      lastRunAt: new Date('2026-07-16T11:45:00Z'), // 15m ago, ~1x
    }));
    expect(alerts).toEqual([]);
  });

  it('warning: missed-run at ~2x-4x the expected interval', () => {
    const alerts = evaluateCronJobHealth(baseInput({
      schedule: '*/15 * * * *',
      lastRunAt: new Date('2026-07-16T11:29:00Z'), // 31m ago, ~2.07x
    }));
    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe('warning');
    expect(alerts[0].title).toContain('Missed Runs');
  });

  it('critical: missed-run beyond 4x the expected interval — job has likely stopped entirely', () => {
    const alerts = evaluateCronJobHealth(baseInput({
      schedule: '*/15 * * * *',
      lastRunAt: new Date('2026-07-16T11:00:00Z'), // 60m ago, ~4x
    }));
    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe('critical');
  });

  it('failure path: an invalid cron expression is skipped rather than throwing', () => {
    expect(() =>
      evaluateCronJobHealth(baseInput({ schedule: 'not-a-cron-expr', lastRunAt: new Date('2026-07-16T00:00:00Z') }))
    ).not.toThrow();
  });

  it('boundary: no schedule or no lastRunAt skips the missed-run check entirely', () => {
    const alerts = evaluateCronJobHealth(baseInput({ schedule: null, lastRunAt: null }));
    expect(alerts).toEqual([]);
  });

  it('regression: a concrete last_error is surfaced in both the alert metadata and description, not just the failure count', () => {
    const alerts = evaluateCronJobHealth(baseInput({
      recentRuns: [
        { result: 'failed' }, { result: 'failed' }, { result: 'failed' }, { result: 'failed' },
        { result: 'success' },
      ],
      lastError: 'Timeout connecting to synthflow.ai',
    }));
    expect(alerts).toHaveLength(1);
    expect(alerts[0].metadata.last_error).toBe('Timeout connecting to synthflow.ai');
    expect(alerts[0].description).toContain('Timeout connecting to synthflow.ai');
  });

  it('boundary: a null last_error does not appear in the description and metadata stays null, not "undefined"', () => {
    const alerts = evaluateCronJobHealth(baseInput({
      recentRuns: Array(5).fill({ result: 'failed' }),
      lastError: null,
    }));
    expect(alerts[0].metadata.last_error).toBeNull();
    expect(alerts[0].description).not.toContain('undefined');
    expect(alerts[0].description).not.toContain('Last error:');
  });

  it('both detectors can fire together for the same job', () => {
    const alerts = evaluateCronJobHealth(baseInput({
      schedule: '*/15 * * * *',
      lastRunAt: new Date('2026-07-16T11:00:00Z'), // ~4x overdue -> critical
      recentRuns: [
        { result: 'failed' }, { result: 'failed' }, { result: 'failed' }, { result: 'failed' },
        { result: 'success' },
      ], // 80% -> critical
    }));
    expect(alerts).toHaveLength(2);
  });
});

describe('checkAllCronJobHealth — orchestrator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('happy path: emits one alert per unhealthy agent, none for healthy ones', async () => {
    findAllAgents.mockResolvedValue([
      { id: 'agent-1', agent_name: 'HealthyJob', schedule: '*/15 * * * *', last_run_at: new Date(), enabled: true, last_error: null },
      { id: 'agent-2', agent_name: 'FailingJob', schedule: '*/15 * * * *', last_run_at: new Date(), enabled: true, last_error: 'ECONNREFUSED' },
    ]);
    findAllLogs
      .mockResolvedValueOnce(Array(5).fill({ result: 'success' })) // HealthyJob
      .mockResolvedValueOnce(Array(5).fill({ result: 'failed' })); // FailingJob

    await checkAllCronJobHealth();

    expect(mockEmitAlert).toHaveBeenCalledTimes(1);
    expect(mockEmitAlert.mock.calls[0][0]).toEqual(
      expect.objectContaining({ type: 'critical', sourceAgentId: 'agent-2', impactArea: 'scheduled_jobs' })
    );
    expect(mockEmitAlert.mock.calls[0][0].metadata.last_error).toBe('ECONNREFUSED');
  });

  it('failure path: one agent throwing during evaluation does not block alerting for the rest', async () => {
    findAllAgents.mockResolvedValue([
      { id: 'agent-1', agent_name: 'BrokenLookup', schedule: '*/15 * * * *', last_run_at: new Date(), enabled: true },
      { id: 'agent-2', agent_name: 'FailingJob', schedule: '*/15 * * * *', last_run_at: new Date(), enabled: true },
    ]);
    findAllLogs
      .mockRejectedValueOnce(new Error('DB timeout'))
      .mockResolvedValueOnce(Array(5).fill({ result: 'failed' }));

    await expect(checkAllCronJobHealth()).resolves.not.toThrow();
    expect(mockEmitAlert).toHaveBeenCalledTimes(1);
    expect(mockEmitAlert.mock.calls[0][0].sourceAgentId).toBe('agent-2');
  });

  it('boundary: no cron agents registered — resolves cleanly with no alerts', async () => {
    findAllAgents.mockResolvedValue([]);
    await checkAllCronJobHealth();
    expect(mockEmitAlert).not.toHaveBeenCalled();
  });
});
