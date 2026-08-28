import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { getAgentDetail } from '../../services/reese/agentDetailService';
import agentDetailRoutes from '../../routes/admin/agentDetailRoutes';

jest.mock('../../services/reese/agentDetailService', () => ({ getAgentDetail: jest.fn() }));

const mockOrgMemberFindOne = jest.fn();
jest.mock('../../models/OrgMember', () => ({
  __esModule: true,
  default: { findOne: (...a: any[]) => mockOrgMemberFindOne(...a) },
}));

const mockIsAgentInHumanDownstream = jest.fn();
jest.mock('../../services/workforce/orgChartHierarchyService', () => ({
  isAgentInHumanDownstream: (...a: any[]) => mockIsAgentInHumanDownstream(...a),
}));

const mockGetAgentDetail = getAgentDetail as unknown as jest.Mock;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(agentDetailRoutes);
  return app;
}

// Bypasses requireAgentManagerOrAdmin's chain walk entirely — used by the
// happy/404/500 tests below, which are about the controller's own behavior,
// not the manager-authorization gate (that gets its own describe block, and
// its own full unit coverage in middlewares/__tests__/agentManagerAuthMiddleware.test.ts).
function superAdminToken() {
  return jwt.sign({ sub: 'admin-1', email: 'ali@colaberry.com', role: 'super_admin' }, env.jwtSecret);
}

function managerToken(email = 'manager@colaberry.com') {
  return jwt.sign({ sub: 'admin-2', email, role: 'admin' }, env.jwtSecret);
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
    const res = await request(app).get('/api/admin/agents/agent-1').set('Authorization', `Bearer ${superAdminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ agent: { agent_name: 'Reese' }, live_status: 'online' });
    expect(mockGetAgentDetail).toHaveBeenCalledWith('agent-1');
  });

  it('returns 404 (not a crash) when the agent id does not exist', async () => {
    mockGetAgentDetail.mockResolvedValue(null);

    const app = buildApp();
    const res = await request(app).get('/api/admin/agents/does-not-exist').set('Authorization', `Bearer ${superAdminToken()}`);

    expect(res.status).toBe(404);
  });

  it('returns 500 (not a raw stack trace) when the service throws', async () => {
    mockGetAgentDetail.mockRejectedValue(new Error('db unavailable'));

    const app = buildApp();
    const res = await request(app).get('/api/admin/agents/agent-1').set('Authorization', `Bearer ${superAdminToken()}`);

    expect(res.status).toBe(500);
    expect(res.body.error).not.toMatch(/db unavailable/); // no raw error leaked
  });
});

describe('GET /api/admin/agents/:id — manager-authorization gate (2026-08-27, Checkpoint B)', () => {
  it('200s for an admin whose org_member is upstream of this agent', async () => {
    mockOrgMemberFindOne.mockResolvedValue({ id: 'org-member-1' });
    mockIsAgentInHumanDownstream.mockResolvedValue(true);
    mockGetAgentDetail.mockResolvedValue({
      agent: { id: 'agent-1', agent_name: 'Reese', agent_type: 'ai_staff_mentor' },
      identity: { admin_user_id: 'admin-1', email: 'reese@colaberry.com', display_name: 'Reese', is_ai_operated: true },
      live_status: 'online',
      tickets: [],
    });

    const app = buildApp();
    const res = await request(app).get('/api/admin/agents/agent-1').set('Authorization', `Bearer ${managerToken()}`);

    expect(res.status).toBe(200);
    expect(mockIsAgentInHumanDownstream).toHaveBeenCalledWith('org-member-1', 'agent-1');
    expect(mockGetAgentDetail).toHaveBeenCalledWith('agent-1');
  });

  it('403s an admin whose org_member is NOT in this agent\'s chain, and never calls the service (an unrelated admin cannot see agent detail)', async () => {
    mockOrgMemberFindOne.mockResolvedValue({ id: 'org-member-2' });
    mockIsAgentInHumanDownstream.mockResolvedValue(false);

    const app = buildApp();
    const res = await request(app).get('/api/admin/agents/agent-1').set('Authorization', `Bearer ${managerToken()}`);

    expect(res.status).toBe(403);
    expect(mockGetAgentDetail).not.toHaveBeenCalled();
  });

  it('403s an admin with no linked org_member at all, and never calls the service', async () => {
    mockOrgMemberFindOne.mockResolvedValue(null);

    const app = buildApp();
    const res = await request(app).get('/api/admin/agents/agent-1').set('Authorization', `Bearer ${managerToken('unrelated-admin@colaberry.com')}`);

    expect(res.status).toBe(403);
    expect(mockGetAgentDetail).not.toHaveBeenCalled();
    expect(mockIsAgentInHumanDownstream).not.toHaveBeenCalled();
  });

  it('super_admin bypasses the chain walk entirely and reaches the service', async () => {
    mockGetAgentDetail.mockResolvedValue({
      agent: { id: 'agent-1', agent_name: 'Reese', agent_type: 'ai_staff_mentor' },
      identity: { admin_user_id: 'admin-1', email: 'reese@colaberry.com', display_name: 'Reese', is_ai_operated: true },
      live_status: 'online',
      tickets: [],
    });

    const app = buildApp();
    const res = await request(app).get('/api/admin/agents/agent-1').set('Authorization', `Bearer ${superAdminToken()}`);

    expect(res.status).toBe(200);
    expect(mockOrgMemberFindOne).not.toHaveBeenCalled();
    expect(mockIsAgentInHumanDownstream).not.toHaveBeenCalled();
  });
});
