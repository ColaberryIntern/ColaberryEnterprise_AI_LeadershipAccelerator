import express from 'express';
import request from 'supertest';

// AI Workforce Reset, Phase C (2026-08-24) — the auth-missing path for
// POST /api/admin/workforce/agents/:id/reactivate, REAL requireAdmin (never
// mocked ANYWHERE in this file). Same split-file convention as
// workforceRoutes.resetAgents.authMissing.test.ts, per CLAUDE.md's "test the
// auth path on every route" requirement — this route can re-enable a
// deactivated agent, so an auth gap here would be a real production
// incident, not a nitpick.

const reactivateAgent = jest.fn();

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
jest.mock('../../../services/workforce/liveAgentsTimelineService', () => ({ listLiveAgentTimeline: jest.fn() }));
jest.mock('../../../services/workforce/agentResetService', () => ({ resetAgents: jest.fn() }));
jest.mock('../../../services/workforce/agentReactivationService', () => ({
  reactivateAgent: (...a: unknown[]) => reactivateAgent(...a),
  AUTONOMY_LEVELS: ['observe', 'suggest', 'act_audited', 'communicate'],
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

describe('POST /api/admin/workforce/agents/:id/reactivate — auth-missing path (REAL requireAdmin)', () => {
  it('a request with no Authorization header gets 401, never reaches the service', async () => {
    const res = await request(app)
      .post('/api/admin/workforce/agents/agent-1/reactivate')
      .send({ autonomy_level: 'observe' });

    expect(res.status).toBe(401);
    expect(reactivateAgent).not.toHaveBeenCalled();
  });

  it('a request with a malformed bearer token gets 401', async () => {
    const res = await request(app)
      .post('/api/admin/workforce/agents/agent-1/reactivate')
      .set('Authorization', 'Bearer not-a-real-jwt')
      .send({ autonomy_level: 'observe' });

    expect(res.status).toBe(401);
    expect(reactivateAgent).not.toHaveBeenCalled();
  }, 20000);
});
