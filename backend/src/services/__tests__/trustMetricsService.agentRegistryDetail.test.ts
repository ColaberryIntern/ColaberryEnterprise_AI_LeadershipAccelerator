/**
 * trustMetricsService — generalized agent-registry detail (T012, Phase B Trust 90+ drill-down).
 *
 * getAgentDetail() (the 10 WORKFORCE_AGENT_NAME Workforce directors) is deliberately left
 * UNTOUCHED — this file's first describe block is a REGRESSION test proving its shape and
 * behavior are unchanged. getAgentRegistryDetail() is a new sibling function covering any of
 * the 211 ai_agents rows by agent_name.
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

import { sequelize } from '../../config/database';
import AiAgent from '../../models/AiAgent';
import AiAgentActivityLog from '../../models/AiAgentActivityLog';
import { isKillSwitchActive } from '../launchSafety';
import { isSafeModeActive } from '../systemControlService';
import { getAgentPermission } from '../agentPermissionService';
import { getAgentDetail, getAgentRegistryDetail } from '../trustMetricsService';

const query = sequelize.query as jest.Mock;
const agentFindOne = AiAgent.findOne as jest.Mock;
const logFindAll = AiAgentActivityLog.findAll as jest.Mock;
const killSwitch = isKillSwitchActive as jest.Mock;
const safeMode = isSafeModeActive as jest.Mock;
const agentPermission = getAgentPermission as jest.Mock;

function directorRow(over: any = {}) {
  return { id: 'agent-uuid-1', agent_name: 'WorkforceStudentSuccessDirector', enabled: true, status: 'idle', trigger_type: 'cron', schedule: '0 6 * * *', ...over };
}

beforeEach(() => {
  jest.clearAllMocks();
  killSwitch.mockResolvedValue(false);
  safeMode.mockResolvedValue(false);
  agentPermission.mockReturnValue({ tier: 'write_with_audit', allowedTables: ['workforce_tasks'], allowedOperations: ['flag_student_success'], requiresEvaluateSend: false });
});

describe('getAgentDetail — REGRESSION (T012 must not change this)', () => {
  it('the original 10-slug Workforce director shape is unchanged: same fields, same scoring', async () => {
    agentFindOne.mockResolvedValue(directorRow());
    logFindAll.mockResolvedValue([
      { action: 'flag_student_success', result: 'success', reason: null, trace_id: 'trace-1', created_at: new Date() },
      { action: 'flag_student_success', result: 'success', reason: null, trace_id: 'trace-2', created_at: new Date() },
    ]);
    query.mockResolvedValue([{ costUsd: 0 }]);

    const detail = await getAgentDetail('student_success');

    expect(detail).not.toBeNull();
    expect(Object.keys(detail!).sort()).toEqual(
      [
        'slug', 'agentName', 'name', 'role', 'mission', 'enabled', 'status', 'tier',
        'triggerType', 'schedule', 'killSwitchActive', 'safeModeActive', 'goals',
        'goalsOverall', 'recentActivity', 'cost7d',
      ].sort()
    );
    expect(detail!.tier).toBe('write_with_audit');
    expect(detail!.goals.find((g) => g.key === 'observability')!.score).toBe(5);
    expect(detail!.recentActivity).toHaveLength(2);
  });

  it('unknown slug still returns null without querying AiAgent (unchanged)', async () => {
    const detail = await getAgentDetail('not-a-real-director');
    expect(detail).toBeNull();
    expect(agentFindOne).not.toHaveBeenCalled();
  });
});

describe('getAgentRegistryDetail (T012 new sibling function)', () => {
  it('happy path: looks up ANY ai_agents row by agent_name, not just the 10 Workforce directors', async () => {
    agentFindOne.mockResolvedValue({
      agent_name: 'PromptMonitorAgent', agent_type: 'prompt_monitor', category: 'maintenance',
      status: 'idle', enabled: true, trigger_type: 'cron', schedule: '*/15 * * * *',
      run_count: 195333, last_run_at: new Date('2026-07-30T10:00:00Z'),
      id: 'agent-uuid-2', config: {},
    });
    query.mockResolvedValue([{ agentId: 'agent-uuid-2', costUsd: 1.5, runs: 12 }]);

    const detail = await getAgentRegistryDetail('PromptMonitorAgent');

    expect(detail).not.toBeNull();
    expect(detail!.agentName).toBe('PromptMonitorAgent');
    expect(detail!.runCount).toBe(195333);
    expect(detail!.cost7d).toBe(1.5);
    expect(detail!.runs7d).toBe(12);
    expect(detail!.lastRunAt).toBe('2026-07-30T10:00:00.000Z');
    // No goals/mission/employee fields — this is the registry shape, not the director shape.
    expect((detail as any).goals).toBeUndefined();
    expect((detail as any).mission).toBeUndefined();
  });

  it('prefers the DB config.registry_audit annotation over the static classification module', async () => {
    agentFindOne.mockResolvedValue({
      agent_name: 'NarrativeAgent', agent_type: 'narrative_generation', category: 'reporting',
      status: 'idle', enabled: false, trigger_type: null, schedule: null, run_count: 0,
      last_run_at: null, id: 'agent-uuid-3',
      config: { registry_audit: { status: 'confirmed_dead', note: 'DB annotation wins' } },
    });
    query.mockResolvedValue([]);

    const detail = await getAgentRegistryDetail('NarrativeAgent');

    expect(detail!.registryAudit).toEqual({ status: 'confirmed_dead', note: 'DB annotation wins', parentAgent: undefined });
  });

  it('falls back to the static classifyAgent() module when no DB annotation exists', async () => {
    agentFindOne.mockResolvedValue({
      agent_name: 'ArchitectureAgent', agent_type: 'architecture_analyzer', category: 'meta',
      status: 'idle', enabled: true, trigger_type: null, schedule: null, run_count: 5,
      last_run_at: null, id: 'agent-uuid-4', config: {},
    });
    query.mockResolvedValue([]);

    const detail = await getAgentRegistryDetail('ArchitectureAgent');

    expect(detail!.registryAudit).toEqual(expect.objectContaining({ status: 'internal_pipeline_step', parentAgent: 'MetaAgentLoop' }));
  });

  it('boundary: an unknown agent name returns null, not a throw', async () => {
    agentFindOne.mockResolvedValue(null);
    const detail = await getAgentRegistryDetail('TotallyMadeUpAgent');
    expect(detail).toBeNull();
  });

  it('failure path: a query error returns null rather than throwing', async () => {
    agentFindOne.mockRejectedValue(new Error('db down'));
    const detail = await getAgentRegistryDetail('AnyAgent');
    expect(detail).toBeNull();
  });
});
