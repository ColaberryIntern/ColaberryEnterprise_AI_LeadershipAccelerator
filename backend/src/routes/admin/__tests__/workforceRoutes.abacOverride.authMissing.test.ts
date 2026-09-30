import express from 'express';
import request from 'supertest';

// Real-enforcement scoping, Phase 3 (2026-09-20) — the auth-missing path for
// PATCH /api/admin/workforce/agents/:id/abac-override, REAL requireAdmin (never
// mocked ANYWHERE in this file). Same split-file convention as
// workforceRoutes.reactivateAgent.authMissing.test.ts, per CLAUDE.md's "test the
// auth path on every route" requirement — this route can put a real agent into
// enforce mode, so an auth gap here would be a real production incident.

const reactivateAgent = jest.fn();
const setAgentAbacOverride = jest.fn();

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
jest.mock('../../../services/workforce/agentAbacOverrideService', () => ({
  setAgentAbacOverride: (...a: unknown[]) => setAgentAbacOverride(...a),
  ABAC_OVERRIDE_VALUES: ['shadow', 'enforce'],
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

describe('PATCH /api/admin/workforce/agents/:id/abac-override — auth-missing path (REAL requireAdmin)', () => {
  it('a request with no Authorization header gets 401, never reaches the service — this route can put a real agent into enforce mode', async () => {
    const res = await request(app)
      .patch('/api/admin/workforce/agents/agent-1/abac-override')
      .send({ override: 'enforce' });

    expect(res.status).toBe(401);
    expect(setAgentAbacOverride).not.toHaveBeenCalled();
  });

  it('a request with a malformed bearer token gets 401', async () => {
    const res = await request(app)
      .patch('/api/admin/workforce/agents/agent-1/abac-override')
      .set('Authorization', 'Bearer not-a-real-jwt')
      .send({ override: 'enforce' });

    expect(res.status).toBe(401);
    expect(setAgentAbacOverride).not.toHaveBeenCalled();
  }, 20000);
});
