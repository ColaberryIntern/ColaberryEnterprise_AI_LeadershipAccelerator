import express from 'express';
import request from 'supertest';

// Org-chart hierarchy build (2026-08-19) — real-module mount test (same
// established convention as ticketRoutes.createdAfter.test.ts): the REAL
// workforceRoutes.ts + workforceController.ts are mounted, with every service
// they import mocked beneath them, so this suite proves the actual route
// wiring (path, method, auth guard) rather than a hand-rolled stand-in.

const getOrgChart = jest.fn();

jest.mock('../../../services/workforce/orgChartService', () => ({ getOrgChart: (...a: unknown[]) => getOrgChart(...a) }));
jest.mock('../../../services/workforce/workforceService', () => ({
  roster: jest.fn(), office: jest.fn(), briefing: jest.fn(), runDailyMeeting: jest.fn(),
  listMeetings: jest.fn(), listTasks: jest.fn(), createTask: jest.fn(), updateTask: jest.fn(),
  listMessages: jest.fn(), review: jest.fn(), analytics: jest.fn(),
}));
jest.mock('../../../services/workforce/liveAgentsService', () => ({
  listLiveAgents: jest.fn(), listLiveAgentActivity: jest.fn(),
}));

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
