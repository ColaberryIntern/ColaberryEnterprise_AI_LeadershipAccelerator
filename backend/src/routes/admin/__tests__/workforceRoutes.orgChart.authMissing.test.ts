import express from 'express';
import request from 'supertest';

// Org-chart hierarchy build (2026-08-19) — the auth-missing path, REAL
// requireAdmin (never mocked ANYWHERE in this file), per CLAUDE.md's
// "test the auth path on every route" requirement. Split into its own file
// from workforceRoutes.orgChart.test.ts deliberately: Jest gives each test
// FILE a fully separate module registry, which is what actually guarantees
// no leftover mock from another describe block/file can silently let a
// request through — see that file's own header comment for the concrete bug
// this split fixed.

const getOrgChart = jest.fn();

jest.mock('../../../services/workforce/orgChartService', () => ({
  getOrgChart: (...a: unknown[]) => getOrgChart(...a),
  // Same fix as workforceRoutes.orgChart.test.ts — handleUpdateOrgMemberTeam's
  // z.enum([...NAMED_DEPARTMENTS]) executes at controller module-load time.
  NAMED_DEPARTMENTS: ['Exec', 'Sales', 'Operations', 'Recruiting', 'Customer Support', 'Marketing'],
}));
// Org Chart v3 (2026-08-19) — see workforceRoutes.orgChart.test.ts's own
// comment on this same addition: workforceController.ts now also imports
// these two new service modules, mocked here to keep this suite isolated.
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

describe('GET /api/admin/workforce/org-chart — auth-missing path (REAL requireAdmin)', () => {
  it('a request with no Authorization header gets 401, never reaches the service', async () => {
    const res = await request(app).get('/api/admin/workforce/org-chart');

    expect(res.status).toBe(401);
    expect(getOrgChart).not.toHaveBeenCalled();
  });

  it('a request with a malformed bearer token gets 401', async () => {
    // Extended timeout (default 5000ms is too tight here, confirmed by a real
    // failure, not a guess): the invalid-token branch of the REAL requireAdmin
    // calls authFailureLog.ts's logAuthFailure(), which fire-and-forget
    // dynamic-`import()`s aiEventService.ts — the FIRST such import in this
    // test process synchronously evaluates that module's full transitive
    // graph (Sequelize models etc.), which alone can exceed 5s. Pre-existing
    // repo behavior (authMiddleware.ts, untouched by this build), not
    // something this test should mask by mocking it away — this test's job is
    // to prove the real 401 path, including this real cost.
    const res = await request(app).get('/api/admin/workforce/org-chart').set('Authorization', 'Bearer not-a-real-jwt');

    expect(res.status).toBe(401);
    expect(getOrgChart).not.toHaveBeenCalled();
  }, 20000);
});
