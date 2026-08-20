import express from 'express';
import request from 'supertest';

// Org Chart v4 (2026-08-20) — real-module mount test (same established
// convention as workforceRoutes.orgChart.test.ts) for the new
// GET /api/admin/workforce/live-agents/timeline route.

const getOrgChart = jest.fn();
const listLiveAgentTimeline = jest.fn();

jest.mock('../../../services/workforce/orgChartService', () => ({
  getOrgChart: (...a: unknown[]) => getOrgChart(...a),
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

const SAMPLE_TIMELINE = [
  { id: 'activity-1', ticket_id: 'ticket-1', ticket_number: 42, ticket_title: 'Some ticket', kind: 'created', action: 'created', from_value: null, to_value: 'backlog', actor_display_name: 'Cory Engine — Autonomous Operations', occurred_at: '2026-08-20T12:00:00.000Z' },
];

describe('GET /api/admin/workforce/live-agents/timeline — happy/failure/boundary (requireAdmin mocked through)', () => {
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

  it('happy path: 200, real service result returned as { timeline: [...] }', async () => {
    listLiveAgentTimeline.mockResolvedValue(SAMPLE_TIMELINE);

    const res = await request(app).get('/api/admin/workforce/live-agents/timeline');

    expect(res.status).toBe(200);
    expect(res.body.timeline).toEqual(SAMPLE_TIMELINE);
    expect(listLiveAgentTimeline).toHaveBeenCalledWith(undefined);
  });

  it('happy path: a valid ?limit= is parsed to a real number and passed through', async () => {
    listLiveAgentTimeline.mockResolvedValue([]);

    await request(app).get('/api/admin/workforce/live-agents/timeline?limit=10');

    expect(listLiveAgentTimeline).toHaveBeenCalledWith(10);
  });

  it('failure path: service throws -> 500 with a generic, non-leaking error body', async () => {
    listLiveAgentTimeline.mockRejectedValue(new Error('internal DB detail nobody outside should see'));

    const res = await request(app).get('/api/admin/workforce/live-agents/timeline');

    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('internal DB detail');
  });

  it('boundary: ?limit=9999 (over the 200 max) is rejected with 400 via Zod, never reaches the service', async () => {
    const res = await request(app).get('/api/admin/workforce/live-agents/timeline?limit=9999');

    expect(res.status).toBe(400);
    expect(listLiveAgentTimeline).not.toHaveBeenCalled();
  });

  it('boundary: ?limit=abc (non-numeric) is rejected with 400 via Zod', async () => {
    const res = await request(app).get('/api/admin/workforce/live-agents/timeline?limit=abc');

    expect(res.status).toBe(400);
    expect(listLiveAgentTimeline).not.toHaveBeenCalled();
  });

  it('boundary: ?limit=0 or a negative value is rejected with 400 (must be positive)', async () => {
    const res = await request(app).get('/api/admin/workforce/live-agents/timeline?limit=0');
    expect(res.status).toBe(400);
  });
});
