/**
 * compileExecutiveBriefing — the department section and its failure path.
 *
 * This file had NO test of any kind before 2026-10-06, so two changes made for
 * the department-health fix were asserted nowhere:
 *
 *   1. the department query's limit (20 -> 500). 8 super agents x 48 cycles/day
 *      is ~384 rows per 24h, so a limit of 20 was the newest ~75 minutes of a
 *      24-hour window: a department that had stopped writing aged out and
 *      vanished from the briefing, which reads exactly like "nothing to
 *      report".
 *   2. the `.catch` on that query, which was a silent swallow and now logs an
 *      `error_class` from classifyError. An empty department list is
 *      indistinguishable from a quiet, healthy day, so the failure has to be
 *      visible somewhere.
 *
 * It also pins the blast radius: a thrown department query, or a failing
 * campaign-metrics query, must cost its own section and nothing else.
 *
 * No database. Every model and collaborator is mocked, so this suite runs in
 * the CI gate rather than joining jest.ci.config.ts's ignore list.
 */

jest.mock('../digestService', () => ({ compileDigestData: jest.fn() }));
jest.mock('../alertService', () => ({ getAlertStats: jest.fn() }));
jest.mock('../../models', () => ({
  AiAgent: { findAll: jest.fn() },
  SystemSetting: { findOne: jest.fn() },
}));
jest.mock('../../models/Ticket', () => ({ __esModule: true, default: { count: jest.fn() } }));
jest.mock('../../models/IntelligenceDecision', () => ({ __esModule: true, default: { findAll: jest.fn() } }));
jest.mock('../../models/DepartmentReport', () => ({ __esModule: true, default: { findAll: jest.fn() } }));
jest.mock('../../models/AgentTask', () => ({ __esModule: true, default: { findAll: jest.fn() } }));
jest.mock('../../models/StrategicInitiative', () => ({ __esModule: true, default: { findAll: jest.fn() } }));
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn() } }));

import { Op } from 'sequelize';
import { compileDigestData } from '../digestService';
import { getAlertStats } from '../alertService';
import { AiAgent } from '../../models';
import Ticket from '../../models/Ticket';
import IntelligenceDecision from '../../models/IntelligenceDecision';
import DepartmentReport from '../../models/DepartmentReport';
import AgentTask from '../../models/AgentTask';
import StrategicInitiative from '../../models/StrategicInitiative';
import { sequelize } from '../../config/database';
import { compileExecutiveBriefing } from '../executiveBriefingService';

const mockDigest = compileDigestData as unknown as jest.Mock;
const mockAlertStats = getAlertStats as unknown as jest.Mock;
const mockAgentFindAll = AiAgent.findAll as unknown as jest.Mock;
const mockTicketCount = Ticket.count as unknown as jest.Mock;
const mockDecisionFindAll = IntelligenceDecision.findAll as unknown as jest.Mock;
const mockDeptFindAll = DepartmentReport.findAll as unknown as jest.Mock;
const mockTaskFindAll = AgentTask.findAll as unknown as jest.Mock;
const mockInitiativeFindAll = StrategicInitiative.findAll as unknown as jest.Mock;
const mockQuery = (sequelize as unknown as { query: jest.Mock }).query;

const FRESH = new Date(Date.now() - 60 * 1000);

/** A department_reports row, shaped as superAgentBase writes one. */
function deptRow(over: Record<string, unknown> = {}) {
  return {
    department: 'Campaign Operations',
    summary: 'Campaign Operations: health HEALTHY — 6/7 healthy, 0 errored, 1 paused.',
    metrics: { total: 7, healthy: 6, errored: 0, paused: 1, health: 'healthy', collection_ok: true },
    anomalies: null as unknown,
    created_at: FRESH,
    ...over,
  };
}

let errorSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

  mockDigest.mockResolvedValue({ period: 'daily' });
  mockAlertStats.mockResolvedValue({ openCount: 3, criticalOpen: 1, last24h: 4, byType: { agent: 3 }, bySeverity: {}, byStatus: {} });
  mockAgentFindAll.mockResolvedValue([{ getDataValue: () => 'idle' }, { getDataValue: () => 'error' }]);
  mockTicketCount.mockResolvedValueOnce(11).mockResolvedValueOnce(4).mockResolvedValueOnce(2);
  mockDecisionFindAll.mockResolvedValue([]);
  mockDeptFindAll.mockResolvedValue([]);
  mockTaskFindAll.mockResolvedValue([]);
  mockInitiativeFindAll.mockResolvedValue([]);
  // One row per campaign query keeps compileCampaignMetrics on its happy path.
  mockQuery.mockResolvedValue([{ cnt: '0', type: 'nurture', sent: '0' }]);
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe('compileExecutiveBriefing — the department section', () => {
  it('carries the three-state verdict, one row per department, newest first', async () => {
    mockDeptFindAll.mockResolvedValue([
      deptRow({ department: 'Content Engine', summary: 'ce', metrics: { total: 0, healthy: 0, errored: 0, paused: 0 } }),
      deptRow({ department: 'Finance', summary: 'fin', metrics: { total: 1, healthy: 0, errored: 0, paused: 1 } }),
      deptRow({ department: 'Campaign Operations', summary: 'ops' }),
      deptRow({ department: 'campaign operations', summary: 'older duplicate' }),
    ]);

    const data = await compileExecutiveBriefing('daily');

    expect(data.departmentReports).toEqual([
      { department: 'Content Engine', summary: 'ce', health: 'unknown' },
      { department: 'Finance', summary: 'fin', health: 'degraded' },
      { department: 'Campaign Operations', summary: 'ops', health: 'healthy' },
    ]);
    // Stated separately so an all-unknown projection cannot satisfy this test.
    expect(data.departmentReports.filter((d) => d.health === 'healthy')).toHaveLength(1);
  });

  it('queries the whole 24h window with room for every sweep of all 8 supervisors', async () => {
    await compileExecutiveBriefing('daily');

    expect(mockDeptFindAll).toHaveBeenCalledTimes(1);
    const args = mockDeptFindAll.mock.calls[0][0];
    // ~384 rows land per 24h; anything under that silently truncates the window.
    expect(args.limit).toBeGreaterThanOrEqual(400);
    expect(args.order).toEqual([['created_at', 'DESC']]);

    // Op.gte is a Symbol key, so Object.values would not see it.
    const cutoff = args.where.created_at[Op.gte] as Date;
    expect(cutoff).toBeInstanceOf(Date);
    const windowMs = Date.now() - cutoff.getTime();
    expect(windowMs).toBeGreaterThanOrEqual(23.5 * 60 * 60 * 1000);
    expect(windowMs).toBeLessThanOrEqual(24.5 * 60 * 60 * 1000);
  });

  it('uses the same 24h cutoff for the department query on a weekly briefing', async () => {
    // The weekly briefing widens `lookback` to 7 days for insights and tasks.
    // Departments stay on 24h deliberately: a week-old report is not evidence
    // of anything, and judgeDepartmentHealth would call all of them unknown.
    await compileExecutiveBriefing('weekly');

    const cutoff = mockDeptFindAll.mock.calls[0][0].where.created_at[Op.gte] as Date;
    const windowMs = Date.now() - cutoff.getTime();
    expect(windowMs).toBeLessThanOrEqual(24.5 * 60 * 60 * 1000);
  });
});

describe('compileExecutiveBriefing — when the department query fails', () => {
  it('names the error_class in the log instead of swallowing the failure', async () => {
    const timeout = Object.assign(new Error('query timed out'), { code: 'ETIMEDOUT' });
    mockDeptFindAll.mockRejectedValue(timeout);

    const data = await compileExecutiveBriefing('daily');

    expect(data.departmentReports).toEqual([]);
    const logged = errorSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('error_class=TimeoutError');
    expect(logged).toContain('the briefing will omit every department');
  });

  it('classifies the failure rather than logging a bare Error', async () => {
    // classifyError's whole point: 'Error' is not an acceptable error_class in
    // a production code path, so the log must name the real bucket.
    mockDeptFindAll.mockRejectedValue(Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' }));

    await compileExecutiveBriefing('daily');

    const logged = errorSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('error_class=UpstreamUnavailable');
    expect(logged).not.toContain('error_class=Error ');
  });

  it('costs the department section and nothing else', async () => {
    // The query sits in a Promise.all that builds the entire briefing. Without
    // the .catch, one failed department read rejects the whole compile and the
    // daily briefing does not go out at all.
    mockDeptFindAll.mockRejectedValue(new Error('relation "department_reports" does not exist'));

    const data = await compileExecutiveBriefing('daily');

    expect(data.departmentReports).toEqual([]);
    expect(data.ticketSummary).toEqual({ openCount: 11, resolvedLast24h: 4, criticalOpen: 2 });
    expect(data.agentFleet).toEqual({ total: 2, healthy: 1, errored: 1, paused: 0 });
    expect(data.alertSummary.openCount).toBe(3);
  });

  it('keeps the department verdicts when the campaign metrics queries fail', async () => {
    mockDeptFindAll.mockResolvedValue([
      deptRow({ department: 'Finance', summary: 'fin', metrics: { total: 1, healthy: 0, errored: 0, paused: 1 } }),
    ]);
    mockQuery.mockRejectedValue(new Error('page_events does not exist'));

    const data = await compileExecutiveBriefing('daily');

    expect(data.departmentReports).toEqual([
      { department: 'Finance', summary: 'fin', health: 'degraded' },
    ]);
    expect(data.campaignMetrics?.emailsSent).toBe(0);
  });

  it('does not throw on a department row whose JSONB columns are junk', async () => {
    mockDeptFindAll.mockResolvedValue([
      deptRow({ department: 'Partnerships', summary: 'p', metrics: 'corrupted', anomalies: 7 }),
      null,
    ]);

    const data = await compileExecutiveBriefing('daily');

    expect(data.departmentReports).toEqual([
      { department: 'Partnerships', summary: 'p', health: 'degraded' },
      { department: '', summary: '', health: 'unknown' },
    ]);
  });
});
