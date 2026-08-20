import express from 'express';
import request from 'supertest';

// Org Chart v4 (2026-08-20) — the auth-missing path, REAL requireAdmin
// (never mocked anywhere in this file), per CLAUDE.md's "test the auth path
// on every route" requirement. Split into its own file from
// workforceRoutes.timeline.test.ts for the exact same reason
// workforceRoutes.orgChart.authMissing.test.ts is split from its happy-path
// counterpart — see that file's own header comment.

const listLiveAgentTimeline = jest.fn();

jest.mock('../../../services/workforce/orgChartService', () => ({
  getOrgChart: jest.fn(),
  NAMED_DEPARTMENTS: ['Exec', 'Sales', 'Operations', 'Recruiting', 'Customer Support', 'Marketing'],
}));
jest.mock('../../../services/workforce/orgChartHierarchyService', () => ({ updateOrgMemberTeam: jest.fn() }));
jest.mock('../../../services/workforce/orgChartTaskAssignmentService', () => ({ assignTaskToAgent: jest.fn() }));
jest.mock('../../../services/workforce/workforceService', () => ({
  roster: jest.fn(), office: jest.fn(), briefing: jest.fn(), runDailyMeeting: jest.fn(),
  listMeetings: jest.fn(), listTasks: jest.fn(), createTask: jest.fn(), updateTask: jest.fn(),
  listMessages: jest.fn(), review: jest.fn(), analytics: jest.fn(),
}));
jest.mock('../../../services/workforce/liveAgentsService', () => ({
  listLiveAgents: jest.fn(), listLiveAgentActivity: jest.fn(),
}));
jest.mock('../../../services/workforce/liveAgentsTimelineService', () => ({
  listLiveAgentTimeline: (...a: unknown[]) => listLiveAgentTimeline(...a),
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

describe('GET /api/admin/workforce/live-agents/timeline — auth-missing path (REAL requireAdmin)', () => {
  it('a request with no Authorization header gets 401, never reaches the service', async () => {
    const res = await request(app).get('/api/admin/workforce/live-agents/timeline');

    expect(res.status).toBe(401);
    expect(listLiveAgentTimeline).not.toHaveBeenCalled();
  });

  it('a request with a malformed bearer token gets 401', async () => {
    const res = await request(app).get('/api/admin/workforce/live-agents/timeline').set('Authorization', 'Bearer not-a-real-jwt');

    expect(res.status).toBe(401);
    expect(listLiveAgentTimeline).not.toHaveBeenCalled();
  }, 20000);
});
