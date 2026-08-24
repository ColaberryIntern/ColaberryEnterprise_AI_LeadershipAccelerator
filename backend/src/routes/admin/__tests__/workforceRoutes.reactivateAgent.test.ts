import express from 'express';
import request from 'supertest';

// AI Workforce Reset, Phase C (2026-08-24) — POST
// /api/admin/workforce/agents/:id/reactivate, happy/failure path (requireAdmin
// mocked through). Same real-module-mount convention as
// workforceRoutes.resetAgents.test.ts.

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

describe('POST /api/admin/workforce/agents/:id/reactivate — happy/failure path (requireAdmin mocked through)', () => {
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

  it('happy path: 200, real result returned, real autonomy_level forwarded to the service', async () => {
    reactivateAgent.mockResolvedValue({
      agentId: 'agent-1', agentName: 'ExecutiveStrategyArchitect', found: true, reactivated: true, autonomyLevel: 'observe', error: null,
    });

    const res = await request(app)
      .post('/api/admin/workforce/agents/agent-1/reactivate')
      .send({ autonomy_level: 'observe' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      result: { agentId: 'agent-1', agentName: 'ExecutiveStrategyArchitect', found: true, reactivated: true, autonomyLevel: 'observe', error: null },
    });
    expect(reactivateAgent).toHaveBeenCalledWith('agent-1', 'observe');
  });

  it('missing autonomy_level: 400, service never called — reactivation is never a silent flip', async () => {
    const res = await request(app)
      .post('/api/admin/workforce/agents/agent-1/reactivate')
      .send({});

    expect(res.status).toBe(400);
    expect(reactivateAgent).not.toHaveBeenCalled();
  });

  it('an invalid autonomy_level value (not one of the real 4) gets 400', async () => {
    const res = await request(app)
      .post('/api/admin/workforce/agents/agent-1/reactivate')
      .send({ autonomy_level: 'god_mode' });

    expect(res.status).toBe(400);
    expect(reactivateAgent).not.toHaveBeenCalled();
  });
});
