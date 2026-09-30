import express from 'express';
import request from 'supertest';

// Org Chart v3 (2026-08-19) — the auth-missing path for
// PATCH /api/admin/workforce/org-chart/members/:id/team, REAL requireAdmin
// (never mocked ANYWHERE in this file). Split into its own file from
// workforceRoutes.orgChartMemberTeam.test.ts deliberately — same reason
// documented in workforceRoutes.orgChart.authMissing.test.ts: Jest gives
// each test FILE a fully separate module registry, the only reliable way to
// guarantee no leftover `jest.doMock` from another file can let a request
// through, per CLAUDE.md's "test the auth path on every route" requirement.

const updateOrgMemberTeam = jest.fn();

jest.mock('../../../services/workforce/orgChartService', () => ({
  getOrgChart: jest.fn(),
  NAMED_DEPARTMENTS: ['Exec', 'Sales', 'Operations', 'Recruiting', 'Customer Support', 'Marketing'],
}));
jest.mock('../../../services/workforce/orgChartHierarchyService', () => ({
  updateOrgMemberTeam: (...a: unknown[]) => updateOrgMemberTeam(...a),
}));
jest.mock('../../../services/workforce/orgChartTaskAssignmentService', () => ({ assignTaskToAgent: jest.fn() }));
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

describe('PATCH /api/admin/workforce/org-chart/members/:id/team — auth-missing path (REAL requireAdmin)', () => {
  it('a request with no Authorization header gets 401, never reaches the service', async () => {
    const res = await request(app)
      .patch('/api/admin/workforce/org-chart/members/member-1/team')
      .send({ team: 'Customer Support' });

    expect(res.status).toBe(401);
    expect(updateOrgMemberTeam).not.toHaveBeenCalled();
  });

  it('a request with a malformed bearer token gets 401', async () => {
    const res = await request(app)
      .patch('/api/admin/workforce/org-chart/members/member-1/team')
      .set('Authorization', 'Bearer not-a-real-jwt')
      .send({ team: 'Customer Support' });

    expect(res.status).toBe(401);
    expect(updateOrgMemberTeam).not.toHaveBeenCalled();
  }, 20000);
});
