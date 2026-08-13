import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { env } from '../../../config/env';
import workforceRoutes from '../../../routes/admin/workforceRoutes';
import { listLiveAgents, listLiveAgentActivity } from '../../../services/workforce/liveAgentsService';

// Reese Phase 4 (Workforce integration, T006) — the 2 new live-agents routes added
// to workforceRoutes.ts. Follows the same express+supertest+jwt mount-test pattern
// already established by evidenceRoutes.test.ts (backend/src/__tests__/routes/
// admin/evidenceRoutes.test.ts). Confirms requireAdmin is applied per-route (this
// router's real, existing convention — verified by direct read; it does NOT use
// router.use(requireAdmin) the way ticketRoutes.ts does).
jest.mock('../../../services/workforce/liveAgentsService', () => ({
  listLiveAgents: jest.fn(),
  listLiveAgentActivity: jest.fn(),
}));
// workforceController.ts also imports the full workforceService surface for the
// pre-existing routes — stub it so this suite exercises only the new routes.
jest.mock('../../../services/workforce/workforceService', () => ({
  roster: jest.fn(), office: jest.fn(), briefing: jest.fn(), runDailyMeeting: jest.fn(),
  listMeetings: jest.fn(), listTasks: jest.fn(), createTask: jest.fn(), updateTask: jest.fn(),
  listMessages: jest.fn(), review: jest.fn(), analytics: jest.fn(),
}));

const mockListLiveAgents = listLiveAgents as unknown as jest.Mock;
const mockListLiveAgentActivity = listLiveAgentActivity as unknown as jest.Mock;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(workforceRoutes);
  return app;
}

function adminToken() {
  return jwt.sign({ sub: 'admin-1', email: 'ali@colaberry.com', role: 'admin' }, env.jwtSecret);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/admin/workforce/live-agents', () => {
  it('401s an unauthenticated request and never calls the service', async () => {
    const res = await request(buildApp()).get('/api/admin/workforce/live-agents');
    expect(res.status).toBe(401);
    expect(mockListLiveAgents).not.toHaveBeenCalled();
  });

  it('returns 200 with the real agent list for an authenticated admin', async () => {
    mockListLiveAgents.mockResolvedValue([{ id: 'agent-reese', agent_name: 'Reese', live_status: 'online', ticket_count: 3 }]);
    const res = await request(buildApp())
      .get('/api/admin/workforce/live-agents')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.agents).toHaveLength(1);
    expect(res.body.agents[0].agent_name).toBe('Reese');
  });
});

describe('GET /api/admin/workforce/live-agents/activity', () => {
  it('401s an unauthenticated request and never calls the service', async () => {
    const res = await request(buildApp()).get('/api/admin/workforce/live-agents/activity');
    expect(res.status).toBe(401);
    expect(mockListLiveAgentActivity).not.toHaveBeenCalled();
  });

  it('returns 200 with real activity events for an authenticated admin', async () => {
    mockListLiveAgentActivity.mockResolvedValue([{ agent_id: 'agent-reese', agent_name: 'Reese', ticket_id: 't1', type: 'reese_autonomous_outreach' }]);
    const res = await request(buildApp())
      .get('/api/admin/workforce/live-agents/activity')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.activity).toHaveLength(1);
  });

  it('passes a numeric ?limit= through to the service', async () => {
    mockListLiveAgentActivity.mockResolvedValue([]);
    await request(buildApp())
      .get('/api/admin/workforce/live-agents/activity?limit=5')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(mockListLiveAgentActivity).toHaveBeenCalledWith(5);
  });
});
