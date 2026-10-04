import express from 'express';
import request from 'supertest';

// Org-chart hierarchy build (2026-08-19) — real-module mount test (same
// established convention as ticketRoutes.createdAfter.test.ts): the REAL
// workforceRoutes.ts + workforceController.ts are mounted, with every service
// they import mocked beneath them, so this suite proves the actual route
// wiring (path, method, auth guard) rather than a hand-rolled stand-in.

const getOrgChart = jest.fn();

jest.mock('../../../services/workforce/orgChartService', () => ({
  getOrgChart: (...a: unknown[]) => getOrgChart(...a),
  // Required because handleUpdateOrgMemberTeam's Zod schema
  // (z.enum([...NAMED_DEPARTMENTS])) executes at controller module-load
  // time — without this, spreading `undefined` throws immediately and
  // crashthe whole suite (real regression caught by task
  // verification: workforceController.ts now imports NAMED_DEPARTMENTS too).
  NAMED_DEPARTMENTS: ['Exec', 'Sales', 'Operations', 'Recruiting', 'Customer Support', 'Marketing'],
}));
// Org Chart v3 (2026-08-19) — workforceController.ts now also imports these
// two new service modules (the PATCH team route and POST assign-task
// route, neither exercised by this GET-only suite) — mocked here purely so
// mounting the real workforceRoutes.ts/workforceController.ts module graph
// never pulls in real Sequelize models transitively.
// Track B (2026-09-22) — resolveDownstreamForAdminEmail/scopeOrgChartToHuman/
// emptyOrgChartResponse mocked directly (not jest.requireActual()), same
// established convention as updateOrgMemberTeam above: this suite proves the
// ROUTE's wiring (which function gets called with what, and whose return
// value ends up in the response), not the scoping logic itself — that's
// already unit-tested in full isolation in orgChartHierarchyService.test.ts.
// A requireActual() here would also pull in the real OrgMember/AiAgent/
// Organization/AdminUser/Enrollment/Ticket model chain transitively (the
// exact trap orgChartHierarchyService.test.ts's own header comment warns
// about), which this GET-route-wiring suite has no reason to take on.
const resolveDownstreamForAdminEmail = jest.fn();
const scopeOrgChartToHuman = jest.fn();
const emptyOrgChartResponse = jest.fn();
jest.mock('../../../services/workforce/orgChartHierarchyService', () => ({
  updateOrgMemberTeam: jest.fn(),
  resolveDownstreamForAdminEmail: (...a: unknown[]) => resolveDownstreamForAdminEmail(...a),
  scopeOrgChartToHuman: (...a: unknown[]) => scopeOrgChartToHuman(...a),
  emptyOrgChartResponse: (...a: unknown[]) => emptyOrgChartResponse(...a),
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

const SAMPLE_CHART = {
  organization: { id: 'org-colaberry', name: 'Colaberry' },
  humans: [],
  leadership: [],
  staff: [],
  unresolved: [],
  generated_at: new Date('2026-08-19T00:00:00Z'),
};

describe('GET /api/admin/workforce/org-chart — happy/failure path (requireAdmin mocked through)', () => {
  let app: express.Express;

  beforeAll(async () => {
    jest.doMock('../../../middlewares/authMiddleware', () => ({
      // Track B (2026-09-22) — req.admin.email now genuinely read by
      // handleOrgChart's scope=mine path; a test that wants a specific
      // caller identity sends it via the x-test-admin-email header (test-only
      // plumbing, no such header exists on the real requireAdmin).
      requireAdmin: (req: any, _res: any, next: any) => {
        req.admin = { email: req.headers['x-test-admin-email'] || 'unscoped-caller@colaberry.com', sub: 'admin-x', role: 'admin' };
        next();
      },
    }));
    app = express();
    app.use(express.json());
    const mod = await import('../workforceRoutes');
    app.use(mod.default);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('happy path: 200, real service result returned as JSON', async () => {
    getOrgChart.mockResolvedValue(SAMPLE_CHART);

    const res = await request(app).get('/api/admin/workforce/org-chart');

    expect(res.status).toBe(200);
    expect(res.body.organization).toEqual({ id: 'org-colaberry', name: 'Colaberry' });
    expect(getOrgChart).toHaveBeenCalledTimes(1);
  });

  it('failure path: service throws -> 500 with a generic, non-leaking error body (no stack trace, no internal message)', async () => {
    getOrgChart.mockRejectedValue(new Error('Colaberry Organization row not found — internal detail nobody outside should see'));

    const res = await request(app).get('/api/admin/workforce/org-chart');

    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('internal detail');
    expect(res.text).not.toMatch(/at\s+\S+\s+\(.*:\d+:\d+\)/); // no stack trace leaked
  });

  // Track B (2026-09-22) — the "My team" scoping toggle.
  it('no scope param: unscoped chart returned unchanged, resolveDownstreamForAdminEmail never called', async () => {
    getOrgChart.mockResolvedValue(SAMPLE_CHART);

    const res = await request(app).get('/api/admin/workforce/org-chart');

    expect(res.status).toBe(200);
    expect(resolveDownstreamForAdminEmail).not.toHaveBeenCalled();
  });

  it('scope=mine, a real match: resolves the caller by their own email, scopes the chart, returns the scoped result', async () => {
    getOrgChart.mockResolvedValue(SAMPLE_CHART);
    const human = { id: 'human-taiwo' };
    const downstream = { leadership: [{ id: 'lead-1' }], staff: [] };
    resolveDownstreamForAdminEmail.mockResolvedValue({ human, downstream });
    const scoped = { ...SAMPLE_CHART, humans: [{ id: 'human-taiwo' }] };
    scopeOrgChartToHuman.mockReturnValue(scoped);

    const res = await request(app)
      .get('/api/admin/workforce/org-chart?scope=mine')
      .set('x-test-admin-email', 'taiwo@colaberry.com');

    expect(resolveDownstreamForAdminEmail).toHaveBeenCalledWith('taiwo@colaberry.com');
    expect(scopeOrgChartToHuman).toHaveBeenCalledWith(SAMPLE_CHART, human, downstream);
    expect(res.status).toBe(200);
    expect(res.body.humans).toEqual([{ id: 'human-taiwo' }]);
  });

  it('scope=mine, no org_members match: returns the honest empty response, not an error', async () => {
    getOrgChart.mockResolvedValue(SAMPLE_CHART);
    resolveDownstreamForAdminEmail.mockResolvedValue(null);
    emptyOrgChartResponse.mockReturnValue({ ...SAMPLE_CHART });

    const res = await request(app)
      .get('/api/admin/workforce/org-chart?scope=mine')
      .set('x-test-admin-email', 'nobody@colaberry.com');

    expect(emptyOrgChartResponse).toHaveBeenCalledWith(SAMPLE_CHART);
    expect(scopeOrgChartToHuman).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it('a bad scope value returns a real 400, matching this route family\'s existing fail() shape', async () => {
    getOrgChart.mockResolvedValue(SAMPLE_CHART);

    const res = await request(app).get('/api/admin/workforce/org-chart?scope=everyone');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid input');
    expect(getOrgChart).not.toHaveBeenCalled();
  });
});

// The auth-missing path (REAL requireAdmin, not mocked) lives in its own
// file, workforceRoutes.orgChart.authMissing.test.ts — NOT a second describe
// block here. A real bug this suite caught: `jest.resetModules()` +
// `jest.unmock()` do not reliably undo the describe block above's imperative
// `jest.doMock('.../authMiddleware', ...)` within the SAME test file (both
// auth tests kept getting the fake pass-through requireAdmin, either 500 —
// service called with no header — or a hung/timed-out request). Jest test
// FILES get fully separate module registries by default, so a distinct file
// with zero authMiddleware mocking anywhere in it is the reliable way to
// exercise the real middleware, per CLAUDE.md's "test the auth path on every
// route" requirement.
