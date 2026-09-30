import express from 'express';
import request from 'supertest';

// AI Workforce Reset (2026-08-24) — POST /api/admin/workforce/agents/reset,
// happy/failure path (requireAdmin mocked through). Same real-module-mount
// convention as workforceRoutes.orgChartAssignTask.test.ts.

const resetAgents = jest.fn();

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
jest.mock('../../../services/workforce/agentResetService', () => ({
  resetAgents: (...a: unknown[]) => resetAgents(...a),
}));
// AI Workforce Reset, Phase C — workforceController.ts now also imports this
// sibling service; mocked here so this file never loads its real AiAgent
// import chain, matching every other service mock in this suite.
jest.mock('../../../services/workforce/agentReactivationService', () => ({
  reactivateAgent: jest.fn(),
  AUTONOMY_LEVELS: ['observe', 'suggest', 'act_audited', 'communicate'],
}));

describe('POST /api/admin/workforce/agents/reset — happy/failure path (requireAdmin mocked through)', () => {
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

  it('happy path: 200, real results returned, actor identity taken from the authenticated admin (never the request body)', async () => {
    resetAgents.mockResolvedValue([
      { agentId: 'agent-1', agentName: 'ExecutiveStrategyArchitect', found: true, deactivated: true, ticketsCancelled: 12, error: null },
    ]);

    const res = await request(app)
      .post('/api/admin/workforce/agents/reset')
      .send({ agent_ids: ['agent-1'] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      results: [{ agentId: 'agent-1', agentName: 'ExecutiveStrategyArchitect', found: true, deactivated: true, ticketsCancelled: 12, error: null }],
    });
    expect(resetAgents).toHaveBeenCalledWith(['agent-1'], 'ali@colaberry.com');
  });

  it('missing agent_ids: 400, service never called', async () => {
    const res = await request(app)
      .post('/api/admin/workforce/agents/reset')
      .send({});

    expect(res.status).toBe(400);
    expect(resetAgents).not.toHaveBeenCalled();
  });

  it('empty agent_ids array: 400 — no "reset everything" footgun, the list must be explicit and non-empty', async () => {
    const res = await request(app)
      .post('/api/admin/workforce/agents/reset')
      .send({ agent_ids: [] });

    expect(res.status).toBe(400);
    expect(resetAgents).not.toHaveBeenCalled();
  });
});
