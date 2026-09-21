import express from 'express';
import request from 'supertest';

// Real-enforcement scoping, Phase 3 (2026-09-20) — PATCH
// /api/admin/workforce/agents/:id/abac-override, happy/failure path (requireAdmin
// mocked through). Same real-module-mount convention as
// workforceRoutes.reactivateAgent.test.ts. This test proves the route CAN set
// 'enforce' — it never does so against a real agent row outside this isolated,
// fully-mocked context (no real DB row, real or synthetic, is touched).

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

describe('PATCH /api/admin/workforce/agents/:id/abac-override — happy/failure path (requireAdmin mocked through)', () => {
  let app: express.Express;

  beforeAll(async () => {
    jest.doMock('../../../middlewares/authMiddleware', () => ({
      requireAdmin: (req: any, _res: any, next: any) => { req.admin = { sub: 'admin-1', email: 'ali@colaberry.com' }; next(); },
    }));
    app = express();
    app.use(express.json());
    const mod = await import('../workforceRoutes');
    app.use(mod.default);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("happy path: 200, real result returned, the real admin's email forwarded as the audit-trail actor", async () => {
    setAgentAbacOverride.mockResolvedValue({
      agentId: 'agent-1', agentName: 'TestAgent', found: true, updated: true, override: 'enforce', error: null,
    });

    const res = await request(app)
      .patch('/api/admin/workforce/agents/agent-1/abac-override')
      .send({ override: 'enforce' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      result: { agentId: 'agent-1', agentName: 'TestAgent', found: true, updated: true, override: 'enforce', error: null },
    });
    expect(setAgentAbacOverride).toHaveBeenCalledWith('agent-1', 'enforce', 'ali@colaberry.com');
  });

  it('override: null is accepted (a real "revert to global default" request), not rejected as missing', async () => {
    setAgentAbacOverride.mockResolvedValue({
      agentId: 'agent-1', agentName: 'TestAgent', found: true, updated: true, override: null, error: null,
    });

    const res = await request(app)
      .patch('/api/admin/workforce/agents/agent-1/abac-override')
      .send({ override: null });

    expect(res.status).toBe(200);
    expect(setAgentAbacOverride).toHaveBeenCalledWith('agent-1', null, 'ali@colaberry.com');
  });

  it('missing override field entirely: 400, service never called', async () => {
    const res = await request(app)
      .patch('/api/admin/workforce/agents/agent-1/abac-override')
      .send({});

    expect(res.status).toBe(400);
    expect(setAgentAbacOverride).not.toHaveBeenCalled();
  });

  it("override: 'off' is rejected — that value is global-only, never per-agent, per this phase's own design decision", async () => {
    const res = await request(app)
      .patch('/api/admin/workforce/agents/agent-1/abac-override')
      .send({ override: 'off' });

    expect(res.status).toBe(400);
    expect(setAgentAbacOverride).not.toHaveBeenCalled();
  });

  it('a garbage override value gets 400', async () => {
    const res = await request(app)
      .patch('/api/admin/workforce/agents/agent-1/abac-override')
      .send({ override: 'god_mode' });

    expect(res.status).toBe(400);
    expect(setAgentAbacOverride).not.toHaveBeenCalled();
  });
});
