import express from 'express';
import request from 'supertest';

// Org Chart v3 (2026-08-19) — the auth-missing path for
// POST /api/admin/workforce/org-chart/members/:id/tasks, REAL requireAdmin
// (never mocked ANYWHERE in this file). Same split-file convention as
// workforceRoutes.orgChart.authMissing.test.ts, per CLAUDE.md's "test the
// auth path on every route" requirement.

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
// authMiddleware is NEVER mocked in this file — the real requireAdmin runs.

let app: express.Express;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  const mod = await import('../workforceRoutes');
  app.use(mod.default);
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/admin/workforce/org-chart/members/:id/tasks — auth-missing path (REAL requireAdmin)', () => {
  it('a request with no Authorization header gets 401, never reaches the service', async () => {
    const res = await request(app)
      .post('/api/admin/workforce/org-chart/members/human-1/tasks')
      .send({ agent_id: 'agent-1', title: 'Task', idempotency_key: 'key-1' });

    expect(res.status).toBe(401);
    expect(assignTaskToAgent).not.toHaveBeenCalled();
  });

  it('a request with a malformed bearer token gets 401', async () => {
    const res = await request(app)
      .post('/api/admin/workforce/org-chart/members/human-1/tasks')
      .set('Authorization', 'Bearer not-a-real-jwt')
      .send({ agent_id: 'agent-1', title: 'Task', idempotency_key: 'key-1' });

    expect(res.status).toBe(401);
    expect(assignTaskToAgent).not.toHaveBeenCalled();
  }, 20000);
});
