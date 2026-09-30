/**
 * trustMetricsService — per-user cost drill-down (getCostByUser, T004 / P3-4).
 * Mirrors the existing getCostBreakdown query shape, grouped by user_id instead of
 * workflow_id — verifies the grouping/aggregation logic and the '(unattributed)' fallback.
 */

jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../models/ContentGenerationLog', () => ({ __esModule: true, default: { count: jest.fn() } }));
jest.mock('../../models/AiAgentActivityLog', () => ({ __esModule: true, default: { findOne: jest.fn(), findAll: jest.fn(), count: jest.fn() } }));
jest.mock('../../models/ChatConversation', () => ({ __esModule: true, default: { count: jest.fn() } }));
jest.mock('../../models/AgentWriteAudit', () => ({ __esModule: true, default: { count: jest.fn() } }));
jest.mock('../../models/AiEvent', () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock('../../models/AiAgent', () => ({ __esModule: true, default: { findAll: jest.fn(), findOne: jest.fn() } }));
jest.mock('../launchSafety', () => ({ isKillSwitchActive: jest.fn() }));
jest.mock('../systemControlService', () => ({ isSafeModeActive: jest.fn() }));
jest.mock('../agentPermissionService', () => ({ getAgentPermission: jest.fn() }));
jest.mock('../trustRubric', () => ({
  collectLiveSignals: jest.fn(), evaluateAll: jest.fn(), evaluateDimension: jest.fn(), collectOpenActions: jest.fn(),
}));

import { sequelize } from '../../config/database';
import { getCostByUser } from '../trustMetricsService';

const query = sequelize.query as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getCostByUser', () => {
  it('returns rows grouped by user_id with a rolled-up total', async () => {
    query.mockResolvedValue([
      { userId: 'user-1', calls: 10, costUsd: 1.25, totalTokens: 5000 },
      { userId: '(unattributed)', calls: 40, costUsd: 3.75, totalTokens: 20000 },
    ]);

    const result = await getCostByUser();

    expect(result.windowDays).toBe(30);
    expect(result.totalUsd).toBe(5);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].userId).toBe('user-1');

    const [sql] = query.mock.calls[0];
    expect(sql).toContain("COALESCE(user_id, '(unattributed)')");
    expect(sql).toContain("event_type = 'llm.call'");
    expect(sql).toContain('GROUP BY 1');
  });

  it('returns an empty, zero-total result (not a throw) when the query fails', async () => {
    query.mockRejectedValue(new Error('db unavailable'));

    const result = await getCostByUser();

    expect(result.rows).toEqual([]);
    expect(result.totalUsd).toBe(0);
  });
});
