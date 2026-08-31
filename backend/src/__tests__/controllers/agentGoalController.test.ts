import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { createGoal, listActiveGoals, archiveGoal, AgentNotFoundError, GoalNotFoundError } from '../../services/agentGoalService';
import agentGoalRoutes from '../../routes/admin/agentGoalRoutes';

// agentGoalService.ts is this checkpoint's first service to import
// trustMetricsService.ts (for the real agentCostRows() reuse) — that file
// transitively imports agentPermissionService.ts -> models/index.ts, which
// wires up REAL Sequelize cross-model associations (Organization.hasMany
// (OrgMember, ...) etc.) at import time. jest.requireActual below still
// runs agentGoalService.ts's real top-level imports, so without mocking
// these two first, models/index.ts would try to associate against the
// MOCKED (non-Model) OrgMember stub below and crash at module-load time —
// not a real bug in the feature, a test-setup ordering issue.
jest.mock('../../services/trustMetricsService', () => ({ agentCostRows: jest.fn() }));
jest.mock('../../services/workforce/liveAgentsService', () => ({ countOpenTicketsForAgent: jest.fn() }));

jest.mock('../../services/agentGoalService', () => {
  const actual = jest.requireActual('../../services/agentGoalService');
  return { ...actual, createGoal: jest.fn(), listActiveGoals: jest.fn(), archiveGoal: jest.fn() };
});

const mockOrgMemberFindOne = jest.fn();
jest.mock('../../models/OrgMember', () => ({
  __esModule: true,
  default: { findOne: (...a: any[]) => mockOrgMemberFindOne(...a) },
}));

const mockIsAgentInHumanDownstream = jest.fn();
jest.mock('../../services/workforce/orgChartHierarchyService', () => ({
  isAgentInHumanDownstream: (...a: any[]) => mockIsAgentInHumanDownstream(...a),
}));

const mockCreateGoal = createGoal as unknown as jest.Mock;
const mockListActiveGoals = listActiveGoals as unknown as jest.Mock;
const mockArchiveGoal = archiveGoal as unknown as jest.Mock;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(agentGoalRoutes);
  return app;
}

function superAdminToken() {
  return jwt.sign({ sub: 'admin-1', email: 'ali@colaberry.com', role: 'super_admin' }, env.jwtSecret);
}

function managerToken(email = 'manager@colaberry.com') {
  return jwt.sign({ sub: 'admin-2', email, role: 'admin' }, env.jwtSecret);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/admin/agents/:id/goals', () => {
  it('happy path: 200s with the real active goals', async () => {
    mockListActiveGoals.mockResolvedValue([{ id: 'goal-1', status: 'active' }]);

    const res = await request(buildApp()).get('/api/admin/agents/agent-1/goals').set('Authorization', `Bearer ${superAdminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.goals).toHaveLength(1);
  });

  it('boundary: a nonexistent agent 404s', async () => {
    mockListActiveGoals.mockResolvedValue(null);

    const res = await request(buildApp()).get('/api/admin/agents/does-not-exist/goals').set('Authorization', `Bearer ${superAdminToken()}`);

    expect(res.status).toBe(404);
  });

  it('auth: an admin outside this agent\'s reporting chain is 403d and the service is never called', async () => {
    mockOrgMemberFindOne.mockResolvedValue({ id: 'org-member-1' });
    mockIsAgentInHumanDownstream.mockResolvedValue(false);

    const res = await request(buildApp()).get('/api/admin/agents/agent-1/goals').set('Authorization', `Bearer ${managerToken()}`);

    expect(res.status).toBe(403);
    expect(mockListActiveGoals).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/agents/:id/goals', () => {
  it('happy path: a manager in this agent\'s chain can create a goal', async () => {
    mockOrgMemberFindOne.mockResolvedValue({ id: 'org-member-1' });
    mockIsAgentInHumanDownstream.mockResolvedValue(true);
    mockCreateGoal.mockResolvedValue({ id: 'goal-1', status: 'active' });

    const res = await request(buildApp())
      .post('/api/admin/agents/agent-1/goals')
      .set('Authorization', `Bearer ${managerToken()}`)
      .send({ metricKey: 'monthly_cost_usd', comparison: 'at_most', targetValue: 50 });

    expect(res.status).toBe(201);
    expect(mockCreateGoal).toHaveBeenCalledWith('agent-1', 'org-member-1', 'manager@colaberry.com', 'monthly_cost_usd', 'at_most', 50);
  });

  it('BREAK: an invalid metricKey outside the closed enum 400s before the service is ever called', async () => {
    const res = await request(buildApp())
      .post('/api/admin/agents/agent-1/goals')
      .set('Authorization', `Bearer ${superAdminToken()}`)
      .send({ metricKey: 'made_up_metric', comparison: 'at_most', targetValue: 50 });

    expect(res.status).toBe(400);
    expect(mockCreateGoal).not.toHaveBeenCalled();
  });

  it('BREAK: a negative targetValue 400s', async () => {
    const res = await request(buildApp())
      .post('/api/admin/agents/agent-1/goals')
      .set('Authorization', `Bearer ${superAdminToken()}`)
      .send({ metricKey: 'monthly_cost_usd', comparison: 'at_most', targetValue: -5 });

    expect(res.status).toBe(400);
    expect(mockCreateGoal).not.toHaveBeenCalled();
  });

  it('BREAK: an admin outside the chain is 403d and never reaches the service', async () => {
    mockOrgMemberFindOne.mockResolvedValue({ id: 'org-member-1' });
    mockIsAgentInHumanDownstream.mockResolvedValue(false);

    const res = await request(buildApp())
      .post('/api/admin/agents/agent-1/goals')
      .set('Authorization', `Bearer ${managerToken()}`)
      .send({ metricKey: 'monthly_cost_usd', comparison: 'at_most', targetValue: 50 });

    expect(res.status).toBe(403);
    expect(mockCreateGoal).not.toHaveBeenCalled();
  });

  it('boundary: a nonexistent agent 404s (service throws AgentNotFoundError)', async () => {
    mockCreateGoal.mockRejectedValue(new AgentNotFoundError('does-not-exist'));

    const res = await request(buildApp())
      .post('/api/admin/agents/does-not-exist/goals')
      .set('Authorization', `Bearer ${superAdminToken()}`)
      .send({ metricKey: 'monthly_cost_usd', comparison: 'at_most', targetValue: 50 });

    expect(res.status).toBe(404);
  });
});

describe('POST /api/admin/agents/:id/goals/:goalId/archive', () => {
  it('happy path: archives and returns the updated goal', async () => {
    mockArchiveGoal.mockResolvedValue({ id: 'goal-1', status: 'archived' });

    const res = await request(buildApp())
      .post('/api/admin/agents/agent-1/goals/goal-1/archive')
      .set('Authorization', `Bearer ${superAdminToken()}`);

    expect(res.status).toBe(200);
    expect(mockArchiveGoal).toHaveBeenCalledWith('goal-1');
  });

  it('boundary: a nonexistent goal 404s', async () => {
    mockArchiveGoal.mockRejectedValue(new GoalNotFoundError('does-not-exist'));

    const res = await request(buildApp())
      .post('/api/admin/agents/agent-1/goals/does-not-exist/archive')
      .set('Authorization', `Bearer ${superAdminToken()}`);

    expect(res.status).toBe(404);
  });
});
