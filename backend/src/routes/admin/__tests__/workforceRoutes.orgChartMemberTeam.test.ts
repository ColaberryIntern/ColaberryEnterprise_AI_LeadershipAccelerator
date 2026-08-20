import express from 'express';
import request from 'supertest';

// Org Chart v3 (2026-08-19) — PATCH /api/admin/workforce/org-chart/members/:id/team,
// happy/failure path (requireAdmin mocked through). Same real-module-mount
// convention as workforceRoutes.orgChart.test.ts: the REAL workforceRoutes.ts +
// workforceController.ts are mounted, every service they import mocked
// beneath them.

const getOrgChart = jest.fn();
const updateOrgMemberTeam = jest.fn();

jest.mock('../../../services/workforce/orgChartService', () => ({
  getOrgChart: (...a: unknown[]) => getOrgChart(...a),
  NAMED_DEPARTMENTS: ['Exec', 'Sales', 'Operations', 'Recruiting', 'Customer Support', 'Marketing'],
}));
jest.mock('../../../services/workforce/orgChartHierarchyService', () => ({
  updateOrgMemberTeam: (...a: unknown[]) => updateOrgMemberTeam(...a),
}));
// workforceController.ts also imports orgChartTaskAssignmentService.ts (the
// POST .../tasks route this file doesn't exercise) — mocked here purely so
// loading the real workforceRoutes.ts/workforceController.ts module graph
// doesn't pull in real Sequelize models transitively.
jest.mock('../../../services/workforce/orgChartTaskAssignmentService', () => ({ assignTaskToAgent: jest.fn() }));
jest.mock('../../../services/workforce/workforceService', () => ({
  roster: jest.fn(), office: jest.fn(), briefing: jest.fn(), runDailyMeeting: jest.fn(),
  listMeetings: jest.fn(), listTasks: jest.fn(), createTask: jest.fn(), updateTask: jest.fn(),
  listMessages: jest.fn(), review: jest.fn(), analytics: jest.fn(),
}));
jest.mock('../../../services/workforce/liveAgentsService', () => ({
  listLiveAgents: jest.fn(), listLiveAgentActivity: jest.fn(),
}));

describe('PATCH /api/admin/workforce/org-chart/members/:id/team — happy/failure path (requireAdmin mocked through)', () => {
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

  it('happy path: 200, updated member returned as JSON', async () => {
    updateOrgMemberTeam.mockResolvedValue({ id: 'member-1', team: 'Customer Support' });

    const res = await request(app)
      .patch('/api/admin/workforce/org-chart/members/member-1/team')
      .send({ team: 'Customer Support' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 'member-1', team: 'Customer Support' });
    expect(updateOrgMemberTeam).toHaveBeenCalledWith('member-1', 'Customer Support');
  });

  it('happy path: null clears the department', async () => {
    updateOrgMemberTeam.mockResolvedValue({ id: 'member-1', team: null });

    const res = await request(app)
      .patch('/api/admin/workforce/org-chart/members/member-1/team')
      .send({ team: null });

    expect(res.status).toBe(200);
    expect(updateOrgMemberTeam).toHaveBeenCalledWith('member-1', null);
  });

  it('invalid department value: 400, service never called (Zod rejects at the boundary)', async () => {
    const res = await request(app)
      .patch('/api/admin/workforce/org-chart/members/member-1/team')
      .send({ team: 'Not A Real Department' });

    expect(res.status).toBe(400);
    expect(updateOrgMemberTeam).not.toHaveBeenCalled();
  });

  it('unknown member id: service throws OrgMemberNotFoundError (status 404) -> route returns 404', async () => {
    const err: any = new Error('No org_members row found for id "missing-id".');
    err.status = 404;
    updateOrgMemberTeam.mockRejectedValue(err);

    const res = await request(app)
      .patch('/api/admin/workforce/org-chart/members/missing-id/team')
      .send({ team: 'Sales' });

    expect(res.status).toBe(404);
  });
});
