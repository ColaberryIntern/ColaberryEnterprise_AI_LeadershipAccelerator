import express from 'express';
import request from 'supertest';

// Org Chart v3 (2026-08-19) — POST /api/admin/workforce/org-chart/members/:id/tasks,
// happy/failure path (requireAdmin mocked through). Same real-module-mount
// convention as workforceRoutes.orgChart.test.ts.

const assignTaskToAgent = jest.fn();

jest.mock('../../../services/workforce/orgChartService', () => ({
  getOrgChart: jest.fn(),
  NAMED_DEPARTMENTS: ['Exec', 'Sales', 'Operations', 'Recruiting', 'Customer Support', 'Marketing'],
}));
jest.mock('../../../services/workforce/orgChartHierarchyService', () => ({ updateOrgMemberTeam: jest.fn() }));
jest.mock('../../../services/workforce/orgChartTaskAssignmentService', () => ({
  assignTaskToAgent: (...a: unknown[]) => assignTaskToAgent(...a),
}));
jest.mock('../../../services/workforce/workforceService', () => ({
  roster: jest.fn(), office: jest.fn(), briefing: jest.fn(), runDailyMeeting: jest.fn(),
  listMeetings: jest.fn(), listTasks: jest.fn(), createTask: jest.fn(), updateTask: jest.fn(),
  listMessages: jest.fn(), review: jest.fn(), analytics: jest.fn(),
}));
jest.mock('../../../services/workforce/liveAgentsService', () => ({
  listLiveAgents: jest.fn(), listLiveAgentActivity: jest.fn(),
}));
// Org Chart v4 (2026-08-20) — see workforceRoutes.orgChart.authMissing.test.ts's
// identical addition/comment.
jest.mock('../../../services/workforce/liveAgentsTimelineService', () => ({ listLiveAgentTimeline: jest.fn() }));

describe('POST /api/admin/workforce/org-chart/members/:id/tasks — happy/failure path (requireAdmin mocked through)', () => {
  let app: express.Express;

  beforeAll(async () => {
    jest.doMock('../../../middlewares/authMiddleware', () => ({
      requireAdmin: (_req: any, _res: any, next: any) => next(),
    }));
    app = express();
    app.use(express.json());
    const mod = await import('../workforceRoutes');
    app.use(mod.default);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const VALID_BODY = { agent_id: 'agent-1', title: 'Investigate lead spike', description: 'See dashboard', idempotency_key: 'key-abc' };

  it('happy path: 201, created ticket returned as JSON', async () => {
    assignTaskToAgent.mockResolvedValue({ id: 'ticket-1', title: 'Investigate lead spike' });

    const res = await request(app)
      .post('/api/admin/workforce/org-chart/members/human-1/tasks')
      .send(VALID_BODY);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 'ticket-1', title: 'Investigate lead spike' });
    expect(assignTaskToAgent).toHaveBeenCalledWith({
      orgMemberId: 'human-1', agentId: 'agent-1', title: 'Investigate lead spike',
      description: 'See dashboard', idempotencyKey: 'key-abc',
    });
  });

  it('missing agent_id: 400, service never called', async () => {
    const res = await request(app)
      .post('/api/admin/workforce/org-chart/members/human-1/tasks')
      .send({ title: 'Task', idempotency_key: 'key-abc' });

    expect(res.status).toBe(400);
    expect(assignTaskToAgent).not.toHaveBeenCalled();
  });

  it('missing idempotency_key: 400, service never called (non-negotiable per CLAUDE.md)', async () => {
    const res = await request(app)
      .post('/api/admin/workforce/org-chart/members/human-1/tasks')
      .send({ agent_id: 'agent-1', title: 'Task' });

    expect(res.status).toBe(400);
    expect(assignTaskToAgent).not.toHaveBeenCalled();
  });

  it('cross-hierarchy: service throws AgentNotInHierarchyError (status 403) -> route returns 403', async () => {
    const err: any = new Error('Agent not in hierarchy.');
    err.status = 403;
    assignTaskToAgent.mockRejectedValue(err);

    const res = await request(app)
      .post('/api/admin/workforce/org-chart/members/human-1/tasks')
      .send(VALID_BODY);

    expect(res.status).toBe(403);
  });

  // Real bug, caught live 2026-08-25: a deactivated agent that was genuinely
  // in the hierarchy (not the cross-hierarchy case above) was still
  // assignable — same 403 posture as AgentNotInHierarchyError, generic
  // `.status` handling in the controller's fail() needs no route-specific code.
  it('deactivated agent: service throws AgentDeactivatedError (status 403) -> route returns 403', async () => {
    const err: any = new Error('Agent "FinanceIntelligenceArchitect" (agent-1) is currently deactivated and cannot be assigned a task.');
    err.status = 403;
    assignTaskToAgent.mockRejectedValue(err);

    const res = await request(app)
      .post('/api/admin/workforce/org-chart/members/human-1/tasks')
      .send(VALID_BODY);

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('deactivated');
  });
});
