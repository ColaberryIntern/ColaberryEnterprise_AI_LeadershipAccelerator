/**
 * agentGoalsDimensionsService — AI Workforce Management, Checkpoint E. Pins
 * that this reimplements the SAME real GOALS scoring formula
 * trustMetricsService.ts's roster-keyed getAgentDetail(slug) uses, but
 * generically for any real AiAgent — never touching that existing
 * function or its roster dependency.
 */
const mockGetAgentPermission = jest.fn();
jest.mock('../agentPermissionService', () => ({
  getAgentPermission: (...a: any[]) => mockGetAgentPermission(...a),
}));

const mockActivityFindAll = jest.fn();
jest.mock('../../models/AiAgentActivityLog', () => ({
  __esModule: true,
  default: { findAll: (...a: any[]) => mockActivityFindAll(...a) },
}));

import { computeAgentGoalsDimensions } from '../agentGoalsDimensionsService';

const BASE_AGENT: any = {
  id: 'agent-1', agent_name: 'CustomAgent', category: 'operations', enabled: true, trigger_type: 'cron', schedule: '*/5 * * * *',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAgentPermission.mockReturnValue({ tier: 'write_with_audit', allowedTables: ['tickets'], allowedOperations: [], requiresEvaluateSend: false });
});

function logRow(overrides: any = {}) {
  return { trace_id: 'trace-1', result: 'success', ...overrides };
}

describe('computeAgentGoalsDimensions', () => {
  it('happy path: real activity logs produce real observability/solid scores from the actual trace/failure ratio', async () => {
    mockActivityFindAll.mockResolvedValue([logRow(), logRow(), logRow({ trace_id: null }), logRow({ result: 'failed' })]);

    const { goals } = await computeAgentGoalsDimensions(BASE_AGENT);

    const observability = goals.find((g) => g.key === 'observability')!;
    const solid = goals.find((g) => g.key === 'solid')!;
    expect(observability.evidence).toContain('3/4');
    expect(solid.evidence).toContain('1/4');
  });

  it('boundary: zero activity logs falls back to the honest neutral defaults, not zero or a fabricated score', async () => {
    mockActivityFindAll.mockResolvedValue([]);

    const { goals } = await computeAgentGoalsDimensions(BASE_AGENT);

    expect(goals.find((g) => g.key === 'observability')!.score).toBe(3);
    expect(goals.find((g) => g.key === 'solid')!.score).toBe(5);
  });

  it('boundary: a disabled agent scores availability at the floor regardless of activity', async () => {
    mockActivityFindAll.mockResolvedValue([logRow(), logRow()]);

    const { goals } = await computeAgentGoalsDimensions({ ...BASE_AGENT, enabled: false });

    const availability = goals.find((g) => g.key === 'availability')!;
    expect(availability.score).toBe(1);
    expect(availability.evidence).toContain('Disabled');
  });

  it('boundary: an on_demand agent with zero recent activity still scores availability high — no activity is expected, not a red flag', async () => {
    mockActivityFindAll.mockResolvedValue([]);

    const { goals } = await computeAgentGoalsDimensions({ ...BASE_AGENT, trigger_type: 'on_demand' });

    expect(goals.find((g) => g.key === 'availability')!.score).toBe(5);
  });

  it('governance reflects the real getAgentPermission tier for this agent_name, not a hardcoded value', async () => {
    mockActivityFindAll.mockResolvedValue([]);
    mockGetAgentPermission.mockReturnValue({ tier: 'communication', allowedTables: ['leads', 'messages'], allowedOperations: [], requiresEvaluateSend: true });

    const { goals } = await computeAgentGoalsDimensions(BASE_AGENT);

    expect(mockGetAgentPermission).toHaveBeenCalledWith('CustomAgent');
    expect(goals.find((g) => g.key === 'governance')!.evidence).toContain('communication');
    expect(goals.find((g) => g.key === 'governance')!.evidence).toContain('leads, messages');
  });

  it('lexicon uses the real AiAgent.category — never a roster lookup', async () => {
    mockActivityFindAll.mockResolvedValue([]);

    const { goals } = await computeAgentGoalsDimensions(BASE_AGENT);

    expect(goals.find((g) => g.key === 'lexicon')!.evidence).toContain('operations');
  });

  it('boundary: an agent with no category renders an honest "uncategorized", never a fabricated domain', async () => {
    mockActivityFindAll.mockResolvedValue([]);

    const { goals } = await computeAgentGoalsDimensions({ ...BASE_AGENT, category: null });

    expect(goals.find((g) => g.key === 'lexicon')!.evidence).toContain('uncategorized');
  });

  it('goalsOverall is the real rounded average of all 5 dimension scores', async () => {
    mockActivityFindAll.mockResolvedValue([]);

    const { goals, goalsOverall } = await computeAgentGoalsDimensions(BASE_AGENT);

    const expected = Math.round((goals.reduce((s, g) => s + g.score, 0) / goals.length) * 10) / 10;
    expect(goalsOverall).toBe(expected);
  });
});
