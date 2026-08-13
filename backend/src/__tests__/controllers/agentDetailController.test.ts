import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { getAgentDetail } from '../../services/reese/agentDetailService';
import agentDetailRoutes from '../../routes/admin/agentDetailRoutes';

jest.mock('../../services/reese/agentDetailService', () => ({ getAgentDetail: jest.fn() }));

const mockGetAgentDetail = getAgentDetail as unknown as jest.Mock;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(agentDetailRoutes);
  return app;
}

function adminToken() {
  return jwt.sign({ sub: 'admin-1', email: 'ali@colaberry.com', role: 'admin' }, env.jwtSecret);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/admin/agents/:id — auth path', () => {
  it('401s an unauthenticated request', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/admin/agents/agent-1');
    expect(res.status).toBe(401);
    expect(mockGetAgentDetail).not.toHaveBeenCalled();
  });
});

describe('GET /api/admin/agents/:id — happy/failure/boundary paths', () => {
  it('returns 200 with the agent detail payload for an authenticated admin', async () => {
    mockGetAgentDetail.mockResolvedValue({
      agent: { id: 'agent-1', agent_name: 'Reese', agent_type: 'ai_staff_mentor' },
      identity: { admin_user_id: 'admin-1', email: 'reese@colaberry.com', display_name: 'Reese', is_ai_operated: true },
      live_status: 'online',
      tickets: [],
    });

    const app = buildApp();
    const res = await request(app).get('/api/admin/agents/agent-1').set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ agent: { agent_name: 'Reese' }, live_status: 'online' });
    expect(mockGetAgentDetail).toHaveBeenCalledWith('agent-1');
  });

  it('returns 404 (not a crash) when the agent id does not exist', async () => {
    mockGetAgentDetail.mockResolvedValue(null);

    const app = buildApp();
    const res = await request(app).get('/api/admin/agents/does-not-exist').set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(404);
  });

  it('returns 500 (not a raw stack trace) when the service throws', async () => {
    mockGetAgentDetail.mockRejectedValue(new Error('db unavailable'));

    const app = buildApp();
    const res = await request(app).get('/api/admin/agents/agent-1').set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(500);
    expect(res.body.error).not.toMatch(/db unavailable/); // no raw error leaked
  });
});
