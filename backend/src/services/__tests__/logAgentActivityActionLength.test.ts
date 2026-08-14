/**
 * logAgentActivity action-length contract.
 *
 * ai_agent_activity_logs.action is varchar(100). The orchestrator builds that
 * value by joining an agent's distinct action names, which overflowed for
 * richer agents (OpenclawLearningOptimizationAgent emits six). Postgres
 * rejected the INSERT, the throw escaped the orchestrator's success path, and
 * the run was recorded as FAILED even though the agent's work had completed —
 * producing a permanent severity-5 "100% of last 10 runs failed" alert for a
 * job that was actually healthy.
 */
jest.mock('../../models/AiSystemEvent', () => ({ __esModule: true, default: { create: jest.fn() } }));
jest.mock('../../models/AiAgentActivityLog', () => ({ __esModule: true, default: { create: jest.fn() } }));
jest.mock('../../models/AiEvent', () => ({ __esModule: true, default: { create: jest.fn() } }));
jest.mock('../alertService', () => ({ emitAlert: jest.fn() }));
jest.mock('../../utils/requestContext', () => ({ getTraceId: () => 'trace-1' }));
jest.mock('../../utils/piiRedaction', () => ({ redactSensitive: (v: any) => v }));

import { logAgentActivity } from '../aiEventService';
import AiAgentActivityLog from '../../models/AiAgentActivityLog';

const create = AiAgentActivityLog.create as unknown as jest.Mock;

const ACTION_MAX_LENGTH = 100;

describe('logAgentActivity action length', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    create.mockResolvedValue({});
  });

  it('passes a short action through untouched', async () => {
    await logAgentActivity({ agent_id: 'a1', action: 'scan_completed_no_issues', result: 'success' });

    expect(create.mock.calls[0][0].action).toBe('scan_completed_no_issues');
  });

  it('truncates the real overflowing summary to fit the column', async () => {
    // The exact string OpenclawLearningOptimizationAgent produced in production.
    const action =
      '6 action(s): tone_analysis, platform_tone_analysis, topic_analysis, ' +
      'content_effectiveness, revenue_attribution, response_outcome_tracking';
    expect(action.length).toBeGreaterThan(ACTION_MAX_LENGTH);

    await logAgentActivity({ agent_id: 'a1', action, result: 'success' });

    const written = create.mock.calls[0][0].action;
    expect(written.length).toBeLessThanOrEqual(ACTION_MAX_LENGTH);
    expect(written.startsWith('6 action(s): tone_analysis')).toBe(true);
  });

  it('keeps a value sitting exactly on the boundary intact', async () => {
    const action = 'x'.repeat(ACTION_MAX_LENGTH);

    await logAgentActivity({ agent_id: 'a1', action, result: 'success' });

    expect(create.mock.calls[0][0].action).toBe(action);
    expect(create.mock.calls[0][0].action.length).toBe(ACTION_MAX_LENGTH);
  });

  it('marks truncation visibly so a reader knows the value was cut', async () => {
    await logAgentActivity({ agent_id: 'a1', action: 'y'.repeat(ACTION_MAX_LENGTH + 50), result: 'success' });

    expect(create.mock.calls[0][0].action.endsWith('…')).toBe(true);
  });
});
