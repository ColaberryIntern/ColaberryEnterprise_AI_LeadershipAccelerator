/**
 * logAgentActivity — the generic write path that closes the GOALS scorecard
 * gap Ali flagged ("improve the 3.8/5 Trust score for Reese"): an agent's
 * real work must land in AiAgentActivityLog under its OWN AiAgent.id, or
 * observability/availability/solid stay pinned to their zero-row fallback
 * constants forever. Pins the real write shape and the fail-open posture
 * (a logging failure must never throw and break the real action it
 * describes).
 */
const mockCreate = jest.fn();
jest.mock('../../../models/AiAgentActivityLog', () => ({
  __esModule: true,
  default: { create: (...a: any[]) => mockCreate(...a) },
}));

import { logAgentActivity } from '../agentActivityLogService';

beforeEach(() => {
  jest.clearAllMocks();
  mockCreate.mockResolvedValue({});
});

describe('logAgentActivity', () => {
  it('happy path: writes a real row keyed on the given agent id with the real action/result/reason', async () => {
    await logAgentActivity({
      agentId: 'reese-agent-1',
      action: 'reese_autonomous_outreach',
      result: 'success',
      reason: 'inactivity_signal_fired',
      traceId: 'trace-1',
      details: { ticket_id: 'ticket-1', signal_type: 'inactivity' },
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const row = mockCreate.mock.calls[0][0];
    expect(row.agent_id).toBe('reese-agent-1');
    expect(row.action).toBe('reese_autonomous_outreach');
    expect(row.result).toBe('success');
    expect(row.reason).toBe('inactivity_signal_fired');
    expect(row.trace_id).toBe('trace-1');
    expect(row.details).toEqual({ ticket_id: 'ticket-1', signal_type: 'inactivity' });
  });

  it('boundary: omitted optional fields write real nulls, never undefined or fabricated values', async () => {
    await logAgentActivity({ agentId: 'reese-agent-1', action: 'reese_dm_reply', result: 'success' });

    const row = mockCreate.mock.calls[0][0];
    expect(row.reason).toBeNull();
    expect(row.trace_id).toBeNull();
    expect(row.details).toBeNull();
  });

  it('fail-open: a real write failure never throws — a logging failure must not be mistaken for the real action failing', async () => {
    mockCreate.mockRejectedValue(new Error('DB connection lost'));

    await expect(
      logAgentActivity({ agentId: 'reese-agent-1', action: 'reese_dm_reply', result: 'failed', reason: 'timeout' }),
    ).resolves.toBeUndefined();
  });
});
