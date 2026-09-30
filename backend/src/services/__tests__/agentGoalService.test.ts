/**
 * agentGoalService — AI Workforce Management, Checkpoint D. Pins the two
 * real metric computations (never a fabricated/guessed current value),
 * the met/not-met comparison for both directions, the honest empty-goals
 * state, and the archive idempotency guard.
 */
const mockAiAgentFindByPk = jest.fn();
jest.mock('../../models/AiAgent', () => ({
  __esModule: true,
  default: { findByPk: (...a: any[]) => mockAiAgentFindByPk(...a) },
}));

const mockAdminUserFindOne = jest.fn();
jest.mock('../../models/AdminUser', () => ({
  __esModule: true,
  default: { findOne: (...a: any[]) => mockAdminUserFindOne(...a) },
}));

const mockGoalCreate = jest.fn();
const mockGoalFindAll = jest.fn();
const mockGoalFindByPk = jest.fn();
jest.mock('../../models/AgentGoal', () => ({
  __esModule: true,
  default: {
    create: (...a: any[]) => mockGoalCreate(...a),
    findAll: (...a: any[]) => mockGoalFindAll(...a),
    findByPk: (...a: any[]) => mockGoalFindByPk(...a),
  },
}));

const mockAgentCostRows = jest.fn();
jest.mock('../trustMetricsService', () => ({ agentCostRows: (...a: any[]) => mockAgentCostRows(...a) }));

const mockCountOpenTicketsForAgent = jest.fn();
jest.mock('../workforce/liveAgentsService', () => ({
  countOpenTicketsForAgent: (...a: any[]) => mockCountOpenTicketsForAgent(...a),
}));

import { createGoal, listActiveGoals, archiveGoal, AgentNotFoundError, GoalNotFoundError } from '../agentGoalService';

const AGENT = { id: 'agent-1' };

beforeEach(() => {
  jest.clearAllMocks();
  mockAiAgentFindByPk.mockResolvedValue(AGENT);
});

describe('createGoal — real metric computation, never fabricated', () => {
  it('happy path: monthly_cost_usd reuses the exact same agentCostRows() Agent Detail\'s own cost_summary uses', async () => {
    mockGoalCreate.mockResolvedValue({
      id: 'goal-1', metric_key: 'monthly_cost_usd', comparison: 'at_most', target_value: 50,
      status: 'active', created_by_email: 'manager@colaberry.com', created_at: new Date(),
    });
    mockAgentCostRows.mockResolvedValue([{ agentId: 'agent-1', costUsd: 12.5, runs: 40 }]);

    const result = await createGoal('agent-1', 'org-member-1', 'manager@colaberry.com', 'monthly_cost_usd', 'at_most', 50);

    expect(mockAgentCostRows).toHaveBeenCalledWith(30, 'agent-1');
    expect(result.currentValue).toBe(12.5);
    expect(result.met).toBe(true); // 12.5 <= 50
  });

  it('happy path: open_ticket_count reuses the exact same countOpenTicketsForAgent() Agent Detail\'s own open_ticket_count uses', async () => {
    mockGoalCreate.mockResolvedValue({
      id: 'goal-2', metric_key: 'open_ticket_count', comparison: 'at_most', target_value: 10,
      status: 'active', created_by_email: 'manager@colaberry.com', created_at: new Date(),
    });
    mockAdminUserFindOne.mockResolvedValue({ id: 'admin-user-1' });
    mockCountOpenTicketsForAgent.mockResolvedValue(15);

    const result = await createGoal('agent-1', null, 'manager@colaberry.com', 'open_ticket_count', 'at_most', 10);

    expect(mockCountOpenTicketsForAgent).toHaveBeenCalledWith('admin-user-1', AGENT);
    expect(result.currentValue).toBe(15);
    expect(result.met).toBe(false); // 15 > 10
  });

  it('regression: an agent with no linked AdminUser is UNMEASURED (null), never a fabricated 0 — the real bug caught in the Checkpoint A design review, fixed here', async () => {
    mockGoalCreate.mockResolvedValue({
      id: 'goal-3', metric_key: 'open_ticket_count', comparison: 'at_least', target_value: 0,
      status: 'active', created_by_email: 'manager@colaberry.com', created_at: new Date(),
    });
    mockAdminUserFindOne.mockResolvedValue(null);

    const result = await createGoal('agent-1', null, 'manager@colaberry.com', 'open_ticket_count', 'at_least', 0);

    expect(mockCountOpenTicketsForAgent).not.toHaveBeenCalled();
    expect(result.currentValue).toBeNull();
    expect(result.met).toBeNull(); // never vacuously "met" from missing data
  });

  it('a real AdminUser link with genuinely zero open tickets is a real, measured 0 — distinct from the no-link UNMEASURED case above', async () => {
    mockGoalCreate.mockResolvedValue({
      id: 'goal-3b', metric_key: 'open_ticket_count', comparison: 'at_most', target_value: 5,
      status: 'active', created_by_email: 'manager@colaberry.com', created_at: new Date(),
    });
    mockAdminUserFindOne.mockResolvedValue({ id: 'admin-user-1' });
    mockCountOpenTicketsForAgent.mockResolvedValue(0);

    const result = await createGoal('agent-1', null, 'manager@colaberry.com', 'open_ticket_count', 'at_most', 5);

    expect(result.currentValue).toBe(0);
    expect(result.met).toBe(true); // a real, measured 0 <= 5 — legitimately met, not vacuous
  });

  it('at_least comparison direction is honored correctly', async () => {
    mockGoalCreate.mockResolvedValue({
      id: 'goal-4', metric_key: 'monthly_cost_usd', comparison: 'at_least', target_value: 100,
      status: 'active', created_by_email: 'manager@colaberry.com', created_at: new Date(),
    });
    mockAgentCostRows.mockResolvedValue([{ agentId: 'agent-1', costUsd: 5, runs: 3 }]);

    const result = await createGoal('agent-1', null, 'manager@colaberry.com', 'monthly_cost_usd', 'at_least', 100);

    expect(result.met).toBe(false); // 5 is not >= 100
  });

  it('BREAK: a nonexistent agent throws AgentNotFoundError and never writes', async () => {
    mockAiAgentFindByPk.mockResolvedValue(null);

    await expect(createGoal('does-not-exist', null, 'manager@colaberry.com', 'monthly_cost_usd', 'at_most', 50)).rejects.toBeInstanceOf(AgentNotFoundError);
    expect(mockGoalCreate).not.toHaveBeenCalled();
  });

  it('regression: zero real cost-tracked events over the window is UNMEASURED (null), never a fabricated 0 that vacuously satisfies an at_most goal', async () => {
    mockGoalCreate.mockResolvedValue({
      id: 'goal-5', metric_key: 'monthly_cost_usd', comparison: 'at_most', target_value: 50,
      status: 'active', created_by_email: 'manager@colaberry.com', created_at: new Date(),
    });
    mockAgentCostRows.mockResolvedValue([]);

    const result = await createGoal('agent-1', null, 'manager@colaberry.com', 'monthly_cost_usd', 'at_most', 50);

    expect(result.currentValue).toBeNull();
    expect(result.met).toBeNull();
  });

  it('a real cost row that genuinely sums to $0 is a real, measured 0 — distinct from no rows at all', async () => {
    mockGoalCreate.mockResolvedValue({
      id: 'goal-5b', metric_key: 'monthly_cost_usd', comparison: 'at_most', target_value: 50,
      status: 'active', created_by_email: 'manager@colaberry.com', created_at: new Date(),
    });
    mockAgentCostRows.mockResolvedValue([{ agentId: 'agent-1', costUsd: 0, runs: 3 }]);

    const result = await createGoal('agent-1', null, 'manager@colaberry.com', 'monthly_cost_usd', 'at_most', 50);

    expect(result.currentValue).toBe(0);
    expect(result.met).toBe(true); // a real, measured $0 <= $50 — legitimately met
  });
});

describe('listActiveGoals', () => {
  it('boundary: a real agent with zero goals returns an empty array, not an error', async () => {
    mockGoalFindAll.mockResolvedValue([]);

    const result = await listActiveGoals('agent-1');

    expect(result).toEqual([]);
  });

  it('boundary: a nonexistent agent returns null', async () => {
    mockAiAgentFindByPk.mockResolvedValue(null);

    const result = await listActiveGoals('does-not-exist');

    expect(result).toBeNull();
    expect(mockGoalFindAll).not.toHaveBeenCalled();
  });

  it('only fetches status=active — archived goals are not shown here', async () => {
    mockGoalFindAll.mockResolvedValue([]);

    await listActiveGoals('agent-1');

    const callArgs = mockGoalFindAll.mock.calls[0][0];
    expect(callArgs.where.status).toBe('active');
  });
});

describe('archiveGoal', () => {
  it('happy path: marks an active goal archived', async () => {
    const row: any = {
      id: 'goal-1', agent_id: 'agent-1', status: 'active', metric_key: 'monthly_cost_usd', comparison: 'at_most',
      target_value: 50, created_by_email: 'a@x.com', created_at: new Date(), update: jest.fn().mockResolvedValue(undefined),
    };
    mockGoalFindByPk.mockResolvedValue(row);
    mockAgentCostRows.mockResolvedValue([]);

    await archiveGoal('goal-1');

    expect(row.update).toHaveBeenCalledWith({ status: 'archived' });
  });

  it('idempotency: archiving an already-archived goal is a no-op, not a second archival event', async () => {
    const row: any = {
      id: 'goal-1', agent_id: 'agent-1', status: 'archived', metric_key: 'monthly_cost_usd', comparison: 'at_most',
      target_value: 50, created_by_email: 'a@x.com', created_at: new Date(), update: jest.fn(),
    };
    mockGoalFindByPk.mockResolvedValue(row);
    mockAgentCostRows.mockResolvedValue([]);

    await archiveGoal('goal-1');

    expect(row.update).not.toHaveBeenCalled();
  });

  it('BREAK: a nonexistent goal throws GoalNotFoundError', async () => {
    mockGoalFindByPk.mockResolvedValue(null);

    await expect(archiveGoal('does-not-exist')).rejects.toBeInstanceOf(GoalNotFoundError);
  });
});
