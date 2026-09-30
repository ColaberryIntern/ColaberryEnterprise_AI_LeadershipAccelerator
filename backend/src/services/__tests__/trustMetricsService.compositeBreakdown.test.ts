/**
 * trustMetricsService — composite-score breakdown (T008, Phase B Trust 90+ drill-down).
 * Verifies getCompositeBreakdown() reshapes evaluateAll()'s dimension scores into an
 * equal-weighted contribution breakdown that rolls up to the same composite score
 * getTrustOverview() already computes.
 */

jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../models/ContentGenerationLog', () => ({ __esModule: true, default: { count: jest.fn(), findAll: jest.fn() } }));
jest.mock('../../models/AiAgentActivityLog', () => ({ __esModule: true, default: { findOne: jest.fn(), findAll: jest.fn(), count: jest.fn() } }));
jest.mock('../../models/ChatConversation', () => ({ __esModule: true, default: { count: jest.fn(), findAll: jest.fn() } }));
jest.mock('../../models/AgentWriteAudit', () => ({ __esModule: true, default: { count: jest.fn(), findAll: jest.fn() } }));
jest.mock('../../models/AiEvent', () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock('../../models/AiAgent', () => ({ __esModule: true, default: { findAll: jest.fn(), findOne: jest.fn() } }));
jest.mock('../launchSafety', () => ({ isKillSwitchActive: jest.fn() }));
jest.mock('../systemControlService', () => ({ isSafeModeActive: jest.fn() }));
jest.mock('../agentPermissionService', () => ({ getAgentPermission: jest.fn() }));
jest.mock('../trustRubric', () => ({
  collectLiveSignals: jest.fn(), evaluateAll: jest.fn(), evaluateDimension: jest.fn(), collectOpenActions: jest.fn(),
}));

import { collectLiveSignals, evaluateAll } from '../trustRubric';
import { getCompositeBreakdown } from '../trustMetricsService';

const collectLiveSignalsMock = collectLiveSignals as jest.Mock;
const evaluateAllMock = evaluateAll as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  collectLiveSignalsMock.mockResolvedValue({});
});

describe('getCompositeBreakdown', () => {
  it('rolls up equal-weighted dimension contributions to the same composite score getTrustOverview computes', async () => {
    evaluateAllMock.mockReturnValue([
      { key: 'user', label: 'User', score: 80, band: 'green', state: 'live', summary: 'ok', criteria: [] },
      { key: 'workflow', label: 'Workflow', score: 60, band: 'amber', state: 'live', summary: 'ok', criteria: [] },
      { key: 'agent', label: 'Agent', score: 40, band: 'red', state: 'baseline', summary: 'ok', criteria: [] },
      { key: 'tool', label: 'Tool', score: 20, band: 'red', state: 'baseline', summary: 'ok', criteria: [] },
    ]);

    const result = await getCompositeBreakdown();

    expect(result.compositeTrustScore).toBe(50); // (80+60+40+20)/4
    expect(result.band).toBe('amber');
    expect(result.rows).toHaveLength(4);
    result.rows.forEach((r) => expect(r.weightPct).toBe(25));
    expect(result.rows.find((r) => r.key === 'user')!.contribution).toBe(20); // 80/4
    // contributions sum back to the composite score
    const summed = result.rows.reduce((s, r) => s + r.contribution, 0);
    expect(Math.round(summed)).toBe(result.compositeTrustScore);
  });

  it('handles zero dimensions without dividing by zero', async () => {
    evaluateAllMock.mockReturnValue([]);
    const result = await getCompositeBreakdown();
    expect(result.rows).toEqual([]);
    expect(Number.isNaN(result.compositeTrustScore)).toBe(false);
  });
});
