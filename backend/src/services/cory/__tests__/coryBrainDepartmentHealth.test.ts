/**
 * The COO dashboard's department verdict.
 *
 * WHAT THIS GUARDS
 * ----------------
 * getCOODashboardData is served by GET /api/admin/intelligence/cory/coo-dashboard
 * and rendered by frontend CoryCOOTab.tsx. It used to compute, inline:
 *
 *     health: r.anomalies && (r.anomalies as any[]).length > 0 ? 'degraded' : 'healthy',
 *     agent_count: (r.metrics as any)?.total || 0,
 *
 * so the dashboard displayed "Content Engine — healthy — 0 agents": the number
 * that proves the supervisor saw nothing, printed next to the word healthy.
 * That is the live surface; the executive briefing field that carries the same
 * data has no renderer at all.
 *
 * Every test below asserts the verdict that reaches the dashboard, not that the
 * two calls agree with each other, so an empty or silent projection fails them.
 *
 * No database: every model and collaborator coryBrain imports is mocked, which
 * is why this suite runs in the CI gate rather than sitting on its ignore list.
 */

jest.mock('../../../intelligence/strategy/aiCOO', () => ({
  runStrategicCycle: jest.fn(),
  getLatestStrategicReport: jest.fn(() => null),
}));
jest.mock('../../../models/DepartmentReport', () => ({
  __esModule: true,
  default: { findAll: jest.fn(), count: jest.fn() },
}));
jest.mock('../../../models/IntelligenceDecision', () => ({
  __esModule: true,
  default: { findAll: jest.fn() },
}));
jest.mock('../../../models/AgentTask', () => ({
  __esModule: true,
  default: { findAll: jest.fn(), findOne: jest.fn() },
}));
jest.mock('../../../models/AgentCreationProposal', () => ({
  __esModule: true,
  default: { create: jest.fn() },
}));
jest.mock('../../../models/AiAgent', () => ({
  __esModule: true,
  default: { findAll: jest.fn() },
}));
jest.mock('../../../models/StrategicInitiative', () => ({
  __esModule: true,
  default: { findAll: jest.fn(), create: jest.fn(), findByPk: jest.fn() },
}));
jest.mock('../../taskOrchestrator', () => ({
  createTask: jest.fn(),
  getTaskStats: jest.fn(),
}));
jest.mock('../../aiEventService', () => ({ logAiEvent: jest.fn(() => Promise.resolve()) }));
jest.mock('../coryInitiatives', () => ({
  createStrategicInitiative: jest.fn(),
  getRecentInitiatives: jest.fn(() => Promise.resolve([])),
  getInitiativeStats: jest.fn(() =>
    Promise.resolve({ total: 0, proposed: 0, approved: 0, in_progress: 0, completed: 0, cancelled: 0 }),
  ),
}));
jest.mock('../coryEvolution', () => ({ runEvolutionCycle: jest.fn() }));

import { Op } from 'sequelize';
import DepartmentReport from '../../../models/DepartmentReport';
import IntelligenceDecision from '../../../models/IntelligenceDecision';
import AgentTask from '../../../models/AgentTask';
import AiAgent from '../../../models/AiAgent';
import { createTask, getTaskStats } from '../../taskOrchestrator';
import {
  getCOODashboardData,
  collectDepartmentReports,
  generateStrategicActions,
} from '../coryBrain';

const mockDeptFindAll = DepartmentReport.findAll as unknown as jest.Mock;
const mockDecisionFindAll = IntelligenceDecision.findAll as unknown as jest.Mock;
const mockTaskFindAll = AgentTask.findAll as unknown as jest.Mock;
const mockTaskFindOne = AgentTask.findOne as unknown as jest.Mock;
const mockAgentFindAll = AiAgent.findAll as unknown as jest.Mock;
const mockCreateTask = createTask as unknown as jest.Mock;
const mockGetTaskStats = getTaskStats as unknown as jest.Mock;

// getCOODashboardData reads the real clock (it has no injected `now`), and the
// verdict calls a report older than four 30-minute cycles 'unknown'. A fixture
// pinned to a literal date would therefore pass today and fail tomorrow, so
// "fresh" is expressed relative to now and the stale case states its own age.
const REPORTED_AT = new Date(Date.now() - 60 * 1000);
const REPORTED_AT_ISO = REPORTED_AT.toISOString();

/** A department_reports row, shaped exactly as superAgentBase writes one. */
function deptRow(over: Record<string, unknown> = {}) {
  return {
    id: 'rep-1',
    department: 'Campaign Operations',
    report_type: 'periodic',
    summary: 'Campaign Operations: health HEALTHY — 6/7 healthy, 0 errored, 1 paused.',
    metrics: { total: 7, healthy: 6, errored: 0, paused: 1, health: 'healthy', collection_ok: true },
    anomalies: null as unknown,
    recommendations: null as unknown,
    created_at: REPORTED_AT,
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDeptFindAll.mockResolvedValue([]);
  mockDecisionFindAll.mockResolvedValue([]);
  mockTaskFindAll.mockResolvedValue([]);
  mockTaskFindOne.mockResolvedValue(null);
  mockAgentFindAll.mockResolvedValue([]);
  mockCreateTask.mockImplementation((input: Record<string, unknown>) =>
    Promise.resolve({ id: 'task-1', ...input }),
  );
  mockGetTaskStats.mockResolvedValue({ total: 0, pending: 0, in_progress: 0, completed: 0, failed: 0 });
});

describe('getCOODashboardData — the verdict the dashboard displays', () => {
  it('judges the three production shapes without ever pairing healthy with no working agents', async () => {
    mockDeptFindAll.mockResolvedValue([
      // ContentEngine: 9,366 reports for an agent_group with no rows at all.
      deptRow({
        id: 'r-ce',
        department: 'Content Engine',
        summary: 'Content Engine: 0/0 healthy',
        metrics: { total: 0, healthy: 0, errored: 0, paused: 0 },
        anomalies: null,
      }),
      // Finance: one subordinate, switched off on 2026-08-24, reported
      // 'healthy' every 30 minutes for six weeks afterwards.
      deptRow({
        id: 'r-fin',
        department: 'Finance',
        summary: 'Finance: 0/1 healthy',
        metrics: { total: 1, healthy: 0, errored: 0, paused: 1 },
        anomalies: null,
      }),
      // A department that is genuinely fine, which must still read healthy or
      // the dashboard cries wolf and gets ignored.
      deptRow({ id: 'r-ops', department: 'Campaign Operations' }),
    ]);

    const data = await getCOODashboardData();

    expect(data.status.departments).toEqual([
      { name: 'Content Engine', health: 'unknown', agent_count: 0, last_report_at: REPORTED_AT_ISO },
      { name: 'Finance', health: 'degraded', agent_count: 1, last_report_at: REPORTED_AT_ISO },
      { name: 'Campaign Operations', health: 'healthy', agent_count: 7, last_report_at: REPORTED_AT_ISO },
    ]);
    // The positive half, stated separately so "everything is unknown" cannot
    // pass this test: exactly one department earned the green tick.
    expect(data.status.departments.filter((d) => d.health === 'healthy')).toHaveLength(1);
  });

  it('reports a null agent count, not 0, when the row carries no readable headcount', async () => {
    mockDeptFindAll.mockResolvedValue([
      deptRow({ department: 'Partnerships', metrics: 'corrupted-jsonb' }),
    ]);

    const data = await getCOODashboardData();

    expect(data.status.departments[0].health).toBe('unknown');
    expect(data.status.departments[0].agent_count).toBeNull();
  });

  it('does not believe a healthy stamp from a supervisor whose agent read failed', async () => {
    mockDeptFindAll.mockResolvedValue([
      deptRow({
        department: 'Admissions',
        metrics: { total: 0, healthy: 0, errored: 0, paused: 0, health: 'unknown', collection_ok: false, error_class: 'TimeoutError' },
        anomalies: ['Agent status collection failed (TimeoutError): query timed out'],
      }),
    ]);

    const data = await getCOODashboardData();

    expect(data.status.departments[0].health).toBe('degraded');
  });

  it('reports a department whose last word is four cycles old as unknown', async () => {
    // The super agents sweep every 30 minutes, so a report older than two
    // hours is four consecutive missed cycles.
    mockDeptFindAll.mockResolvedValue([
      deptRow({ department: 'Finance', created_at: new Date(Date.now() - 3 * 60 * 60 * 1000) }),
    ]);

    const data = await getCOODashboardData();

    expect(data.status.departments[0].health).toBe('unknown');
  });

  it('survives a created_at that is a string rather than a Date', async () => {
    // `r.created_at?.toISOString()` throws a TypeError on a string, and the
    // throw lands inside getCOODashboardData — one malformed timestamp used to
    // 500 the whole dashboard.
    mockDeptFindAll.mockResolvedValue([
      deptRow({ department: 'Finance', created_at: REPORTED_AT_ISO as unknown as Date }),
    ]);

    const data = await getCOODashboardData();

    expect(data.status.departments[0].last_report_at).toBe(REPORTED_AT_ISO);
    expect(data.status.departments[0].health).toBe('healthy');
  });

  it('reports a null last_report_at for an unreadable timestamp instead of throwing', async () => {
    mockDeptFindAll.mockResolvedValue([
      deptRow({ department: 'Finance', created_at: 'not a date' as unknown as Date }),
    ]);

    const data = await getCOODashboardData();

    expect(data.status.departments[0].last_report_at).toBeNull();
  });
});

describe('collectDepartmentReports — the window the dashboard sees', () => {
  it('queries the whole 24h window, newest first, with room for every sweep', async () => {
    // 8 super agents x 48 cycles/day = ~384 rows per 24h. A limit of 50 was the
    // newest ~3 hours, so a department that stopped writing disappeared
    // entirely instead of showing up as its last, stale report.
    await collectDepartmentReports();

    expect(mockDeptFindAll).toHaveBeenCalledTimes(1);
    const args = mockDeptFindAll.mock.calls[0][0];
    expect(args.limit).toBeGreaterThanOrEqual(400);
    expect(args.order).toEqual([['created_at', 'DESC']]);

    // Op.gte is a Symbol key, so Object.values would not see it.
    const cutoff = args.where.created_at[Op.gte] as Date;
    expect(cutoff).toBeInstanceOf(Date);
    const windowMs = Date.now() - cutoff.getTime();
    expect(windowMs).toBeGreaterThanOrEqual(23.5 * 60 * 60 * 1000);
    expect(windowMs).toBeLessThanOrEqual(24.5 * 60 * 60 * 1000);
  });

  it('keeps the newest row per department and collapses two spellings of one name', async () => {
    mockDeptFindAll.mockResolvedValue([
      deptRow({ id: 'new', department: ' Finance ', summary: 'newest' }),
      deptRow({ id: 'old', department: 'finance', summary: 'older' }),
      deptRow({ id: 'adm', department: 'Admissions', summary: 'other' }),
    ]);

    const rows = await collectDepartmentReports();

    expect(rows.map((r) => r.id)).toEqual(['new', 'adm']);
  });
});

describe('generateStrategicActions — one repair task per anomalous report', () => {
  const anomalous = deptRow({
    id: 'r-fin',
    department: 'Finance',
    metrics: { total: 1, healthy: 0, errored: 0, paused: 1 },
    anomalies: ['CollectionsAgent is disabled after 412 run(s)'],
  });

  it('raises a repair task the first time it sees the anomalies', async () => {
    mockDeptFindAll.mockResolvedValue([anomalous]);

    const tasks = await generateStrategicActions();

    expect(mockCreateTask).toHaveBeenCalledTimes(1);
    expect(mockCreateTask.mock.calls[0][0]).toMatchObject({
      task_type: 'repair',
      assigned_department: 'Finance',
      context: { report_id: 'r-fin' },
    });
    expect(tasks).toHaveLength(1);
  });

  it('raises nothing when a task for that report is already open', async () => {
    // IDEMPOTENCY. Now that the query reaches back a full 24 hours, a
    // department that goes quiet while erroring would otherwise be re-ticketed
    // every 30-minute cycle for a day.
    mockDeptFindAll.mockResolvedValue([anomalous]);
    mockTaskFindOne.mockResolvedValue({ id: 'existing-task' });

    const tasks = await generateStrategicActions();

    expect(mockCreateTask).not.toHaveBeenCalled();
    expect(tasks).toHaveLength(0);
  });
});
