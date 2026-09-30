jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../models/ContentGenerationLog', () => ({ __esModule: true, default: { count: jest.fn() } }));
jest.mock('../../models/AiAgentActivityLog', () => ({ __esModule: true, default: { findOne: jest.fn(), findAll: jest.fn(), count: jest.fn() } }));
jest.mock('../../models/ChatConversation', () => ({ __esModule: true, default: { count: jest.fn() } }));
jest.mock('../../models/AgentWriteAudit', () => ({ __esModule: true, default: { count: jest.fn() } }));
jest.mock('../../models/AiEvent', () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock('../../models/AiAgent', () => ({ __esModule: true, default: { findAll: jest.fn(), findOne: jest.fn() } }));
jest.mock('../launchSafety', () => ({ isKillSwitchActive: jest.fn() }));
jest.mock('../systemControlService', () => ({ isSafeModeActive: jest.fn() }));
// See trustMetricsService.agentRoster.test.ts for why this whole module is mocked rather than
// its models: agentPermissionService pulls in the real models/index.ts association file, which
// would try to call .hasMany() etc. on our plain-object AiAgent mock above.
jest.mock('../agentPermissionService', () => ({ getAgentPermission: jest.fn() }));
jest.mock('../trustRubric', () => ({
  collectLiveSignals: jest.fn(), evaluateAll: jest.fn(), evaluateDimension: jest.fn(), collectOpenActions: jest.fn(),
}));
jest.mock('../trustInpactGoalsService', () => ({ getInpactGoalsEstimate: jest.fn() }));
jest.mock('../workforce/orgRegistry', () => ({
  WORKFORCE_AGENT_NAME: { operations: 'WorkforceOperationsDirector', career: 'WorkforceCareerDirector' },
  findEmployee: jest.fn(),
}));

import AiAgent from '../../models/AiAgent';
import { getRegistryHealth } from '../trustMetricsService';

const findAllMock = AiAgent.findAll as jest.Mock;

function row(agent_name: string, overrides: Record<string, any> = {}) {
  return { agent_name, category: 'test', run_count: 0, config: {}, ...overrides };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getRegistryHealth', () => {
  it('buckets a DB-annotated confirmed_dead row from config.registry_audit', async () => {
    findAllMock.mockResolvedValue([
      row('NarrativeAgent', { enabled: false, config: { registry_audit: { status: 'confirmed_dead', note: 'seed-only' } } }),
    ]);
    const health = await getRegistryHealth();
    expect(health.confirmed_dead.count).toBe(1);
    expect(health.confirmed_dead.agents[0]).toEqual(expect.objectContaining({ name: 'NarrativeAgent', note: 'seed-only' }));
  });

  it('buckets a T002-wired agent (MetaAgentLoop) as live even with run_count still 0 and no annotation — the pre-first-cron-tick window', async () => {
    findAllMock.mockResolvedValue([row('MetaAgentLoop', { run_count: 0 })]);
    const health = await getRegistryHealth();
    expect(health.live.count).toBe(1);
    expect(health.unclassified.count).toBe(0);
  });

  it('buckets a DB-annotated internal_pipeline_step row', async () => {
    findAllMock.mockResolvedValue([
      row('ArchitectureAgent', { config: { registry_audit: { status: 'internal_pipeline_step', note: 'step of MetaAgentLoop' } } }),
    ]);
    const health = await getRegistryHealth();
    expect(health.internal_pipeline_step.count).toBe(1);
  });

  it('falls back to the static classification module for a row not yet annotated in the DB', async () => {
    findAllMock.mockResolvedValue([row('WebsiteBrokenLinkAgent')]); // no config.registry_audit set
    const health = await getRegistryHealth();
    expect(health.confirmed_dead.count).toBe(1);
    expect(health.confirmed_dead.agents[0].name).toBe('WebsiteBrokenLinkAgent');
  });

  it('buckets an unclassified, unannotated Workforce director with run_count 0 as staged_pending_activation', async () => {
    findAllMock.mockResolvedValue([row('WorkforceCareerDirector', { run_count: 0 })]);
    const health = await getRegistryHealth();
    expect(health.staged_pending_activation.count).toBe(1);
  });

  it('buckets a genuinely active agent (run_count > 0, no annotation) as live', async () => {
    findAllMock.mockResolvedValue([row('PromptMonitorAgent', { run_count: 195333 })]);
    const health = await getRegistryHealth();
    expect(health.live.count).toBe(1);
  });

  it('buckets an agent with run_count 0, no annotation, and not a Workforce director as unclassified rather than silently dropped', async () => {
    findAllMock.mockResolvedValue([row('SomeBrandNewAgentNotYetAudited', { run_count: 0 })]);
    const health = await getRegistryHealth();
    expect(health.unclassified.count).toBe(1);
    expect(health.unclassified.agents[0].name).toBe('SomeBrandNewAgentNotYetAudited');
  });

  it('every agent lands in exactly one bucket — counts sum to the total row count', async () => {
    findAllMock.mockResolvedValue([
      row('NarrativeAgent', { config: { registry_audit: { status: 'confirmed_dead' } } }),
      row('ArchitectureAgent', { config: { registry_audit: { status: 'internal_pipeline_step' } } }),
      row('WorkforceCareerDirector', { run_count: 0 }),
      row('PromptMonitorAgent', { run_count: 500 }),
      row('SomeBrandNewAgentNotYetAudited', { run_count: 0 }),
    ]);
    const health = await getRegistryHealth();
    const total = Object.values(health).reduce((s, g) => s + g.count, 0);
    expect(total).toBe(5);
  });
});
