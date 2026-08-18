/**
 * openclawCircuitBreaker tests — pure evaluator (existing, unchanged) plus
 * the BC #10099862873 (P0, item 2) ops-alerting wiring: a CLOSED→OPEN
 * transition must emit a critical alert, but re-checking an already-OPEN
 * circuit must not re-alert (relies on the in-memory transition guard here,
 * layered on top of alertService's own 1h title+type dedup).
 */
jest.mock('../../../../models', () => ({
  OpenclawTask: { findAll: jest.fn() },
  OpenclawResponse: { findAll: jest.fn() },
}));
jest.mock('../../../alertService', () => ({ emitAlert: jest.fn().mockResolvedValue({ id: 'alert-1' }) }));

import { evaluateCircuit, checkCircuitBreaker } from '../openclawCircuitBreaker';
import { OpenclawTask, OpenclawResponse } from '../../../../models';
import { emitAlert } from '../../../alertService';

const findAllTasks = OpenclawTask.findAll as jest.Mock;
const findAllResponses = OpenclawResponse.findAll as jest.Mock;
const mockEmitAlert = emitAlert as jest.Mock;

function mockPlatformTasks(platform: string, statuses: Array<'completed' | 'failed'>) {
  findAllResponses.mockResolvedValue(statuses.map((_, i) => ({ id: `resp-${platform}-${i}` })));
  findAllTasks.mockResolvedValue(
    statuses.map((status, i) => ({
      status,
      updated_at: new Date(),
      input_data: { response_id: `resp-${platform}-${i}` },
    }))
  );
}

describe('evaluateCircuit — pure function (unchanged behavior)', () => {
  it('happy path: stays CLOSED below the min sample size', () => {
    expect(evaluateCircuit(4, 4, null, null)).toBe('CLOSED');
  });

  it('boundary: exactly 50% error rate at the threshold opens the circuit', () => {
    expect(evaluateCircuit(5, 10, new Date(), null)).toBe('OPEN');
  });
});

describe('checkCircuitBreaker — ops alerting wiring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('happy path: a healthy platform (low error rate) never alerts', async () => {
    mockPlatformTasks('reddit_ok', ['completed', 'completed', 'completed', 'completed', 'completed']);

    const status = await checkCircuitBreaker('reddit_ok');

    expect(status.state).toBe('CLOSED');
    expect(mockEmitAlert).not.toHaveBeenCalled();
  });

  it('failure path: crossing the error threshold trips the breaker and emits one critical alert', async () => {
    mockPlatformTasks('reddit_trip', ['failed', 'failed', 'failed', 'completed', 'completed']); // 60%

    const status = await checkCircuitBreaker('reddit_trip');

    expect(status.state).toBe('OPEN');
    expect(mockEmitAlert).toHaveBeenCalledTimes(1);
    expect(mockEmitAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'critical',
        title: 'Circuit Breaker Tripped: openclaw_posting_reddit_trip',
        description: expect.stringContaining('OpenClaw has stopped posting to reddit_trip'),
        sourceType: 'system',
        impactArea: 'openclaw_posting',
      })
    );
  });

  it('idempotency: re-checking an already-OPEN circuit does not re-alert', async () => {
    mockPlatformTasks('reddit_repeat', ['failed', 'failed', 'failed', 'completed', 'completed']);

    await checkCircuitBreaker('reddit_repeat'); // trips, alerts once
    await checkCircuitBreaker('reddit_repeat'); // still OPEN (within cooldown) — must not re-alert
    await checkCircuitBreaker('reddit_repeat');

    expect(mockEmitAlert).toHaveBeenCalledTimes(1);
  });
});
