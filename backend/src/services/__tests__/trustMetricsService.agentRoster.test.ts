/**
 * trustMetricsService — AI Workforce drill-down (getAgentRoster / getAgentDetail).
 * Verifies the Trust Center's new agent section reads real per-director status,
 * trigger, and cost, and that an unknown slug is a clean 404-shaped null, not a throw.
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
// agentPermissionService pulls in real Sequelize models (ProposedAgentAction, AgentWriteAudit) that
// would try to .init() against the mocked plain-object `sequelize` above — mock the whole module
// instead, since trustMetricsService only needs the pure getAgentPermission() lookup from it.
jest.mock('../agentPermissionService', () => ({ getAgentPermission: jest.fn() }));
jest.mock('../trustRubric', () => ({
  collectLiveSignals: jest.fn(), evaluateAll: jest.fn(), evaluateDimension: jest.fn(), collectOpenActions: jest.fn(),
}));

import { sequelize } from '../../config/database';
import AiAgent from '../../models/AiAgent';
import AiAgentActivityLog from '../../models/AiAgentActivityLog';
import { isKillSwitchActive } from '../launchSafety';
import { isSafeModeActive } from '../systemControlService';
import { getAgentPermission } from '../agentPermissionService';
import { getAgentRoster, getAgentDetail } from '../trustMetricsService';

const query = sequelize.query as jest.Mock;
const agentFindAll = AiAgent.findAll as jest.Mock;
const agentFindOne = AiAgent.findOne as jest.Mock;
const logFindAll = AiAgentActivityLog.findAll as jest.Mock;
const killSwitch = isKillSwitchActive as jest.Mock;
const safeMode = isSafeModeActive as jest.Mock;
const agentPermission = getAgentPermission as jest.Mock;

function agentRow(over: any = {}) {
  return { id: 'agent-uuid-1', agent_name: 'WorkforceStudentSuccessDirector', enabled: true, status: 'idle', trigger_type: 'cron', schedule: '0 6 * * *', ...over };
}

beforeEach(() => {
  jest.clearAllMocks();
  killSwitch.mockResolvedValue(false);
  safeMode.mockResolvedValue(false);
  agentPermission.mockReturnValue({ tier: 'write_with_audit', allowedTables: ['workforce_tasks'], allowedOperations: ['flag_student_success'], requiresEvaluateSend: false });
});

describe('getAgentRoster', () => {
  it('happy path: returns all 10 directors, with cost/runs and last-activity joined by agent_id via one batched query each (not one findOne per director)', async () => {
    agentFindAll.mockResolvedValue([agentRow()]);
    // Two distinct sequelize.query calls run in parallel (cost aggregation + DISTINCT ON last
    // activity) — dispatch on the SQL text so each gets its own shaped result, not one shared mock.
    query.mockImplementation((sql: string) => {
      if (sql.includes('FROM ai_events')) return Promise.resolve([{ agentId: 'agent-uuid-1', costUsd: 0.0123, runs: 4 }]);
      if (sql.includes('FROM ai_agent_activity_logs')) return Promise.resolve([{ agentId: 'agent-uuid-1', action: 'flag_student_success', result: 'success', createdAt: new Date('2026-07-30T06:00:00Z') }]);
      return Promise.resolve([]);
    });

    const { rows } = await getAgentRoster();

    expect(rows).toHaveLength(10);
    const marcus = rows.find((r) => r.slug === 'student_success')!;
    expect(marcus.name).toBe('Marcus Bell');
    expect(marcus.enabled).toBe(true);
    expect(marcus.cost7d).toBe(0.0123);
    expect(marcus.runs7d).toBe(4);
    expect(marcus.lastAction).toEqual(expect.objectContaining({ action: 'flag_student_success', result: 'success' }));

    // A director with no matching ai_agents row (not yet seeded) degrades cleanly, not a throw.
    const others = rows.filter((r) => r.slug !== 'student_success');
    others.forEach((r) => expect(r.status).toBe('not_registered'));
  });

  it('failure path: a query error yields an empty roster rather than throwing', async () => {
    agentFindAll.mockRejectedValue(new Error('db down'));
    const { rows } = await getAgentRoster();
    expect(rows).toEqual([]);
  });
});

describe('getAgentDetail', () => {
  it('happy path: scores GOALS dimensions from real activity-log evidence', async () => {
    agentFindOne.mockResolvedValue(agentRow());
    logFindAll.mockResolvedValue([
      { action: 'flag_student_success', result: 'success', reason: null, trace_id: 'trace-1', created_at: new Date() },
      { action: 'flag_student_success', result: 'success', reason: null, trace_id: 'trace-2', created_at: new Date() },
    ]);
    query.mockResolvedValue([{ costUsd: 0 }]);

    const detail = await getAgentDetail('student_success');

    expect(detail).not.toBeNull();
    expect(detail!.tier).toBe('write_with_audit');
    expect(detail!.goals.find((g) => g.key === 'observability')!.score).toBe(5); // 2/2 have trace_id
    expect(detail!.goals.find((g) => g.key === 'solid')!.score).toBe(5); // 0 failures
    expect(detail!.recentActivity).toHaveLength(2);
  });

  it('boundary: an unknown slug returns null, not a throw', async () => {
    const detail = await getAgentDetail('not-a-real-director');
    expect(detail).toBeNull();
    expect(agentFindOne).not.toHaveBeenCalled();
  });

  it('boundary: a known slug with no ai_agents row yet (not seeded) returns null', async () => {
    agentFindOne.mockResolvedValue(null);
    const detail = await getAgentDetail('student_success');
    expect(detail).toBeNull();
  });
});
