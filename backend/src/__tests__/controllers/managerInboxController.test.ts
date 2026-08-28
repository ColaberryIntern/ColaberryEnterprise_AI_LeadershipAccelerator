import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { getManagerInboxItems } from '../../services/managerInboxService';
import managerInboxRoutes from '../../routes/admin/managerInboxRoutes';

jest.mock('../../services/managerInboxService', () => ({ getManagerInboxItems: jest.fn() }));

const mockOrgMemberFindOne = jest.fn();
jest.mock('../../models/OrgMember', () => ({
  __esModule: true,
  default: { findOne: (...a: any[]) => mockOrgMemberFindOne(...a) },
}));

const mockIsAgentInHumanDownstream = jest.fn();
jest.mock('../../services/workforce/orgChartHierarchyService', () => ({
  isAgentInHumanDownstream: (...a: any[]) => mockIsAgentInHumanDownstream(...a),
}));

const mockGetManagerInboxItems = getManagerInboxItems as unknown as jest.Mock;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(managerInboxRoutes);
  return app;
}

function superAdminToken() {
  return jwt.sign({ sub: 'admin-1', email: 'ali@colaberry.com', role: 'super_admin' }, env.jwtSecret);
}

function managerToken(email = 'manager@colaberry.com') {
  return jwt.sign({ sub: 'admin-2', email, role: 'admin' }, env.jwtSecret);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/admin/agents/:id/inbox', () => {
  it('happy path: 200s with the real pending items for a super_admin', async () => {
    mockGetManagerInboxItems.mockResolvedValue([{ id: 'p1', status: 'pending' }]);

    const res = await request(buildApp()).get('/api/admin/agents/agent-1/inbox').set('Authorization', `Bearer ${superAdminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
  });

  it('boundary: a real agent with an empty inbox returns 200 with items: [] (honest empty state, not 404)', async () => {
    mockGetManagerInboxItems.mockResolvedValue([]);

    const res = await request(buildApp()).get('/api/admin/agents/agent-1/inbox').set('Authorization', `Bearer ${superAdminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
  });

  it('boundary: a nonexistent agent 404s', async () => {
    mockGetManagerInboxItems.mockResolvedValue(null);

    const res = await request(buildApp()).get('/api/admin/agents/does-not-exist/inbox').set('Authorization', `Bearer ${superAdminToken()}`);

    expect(res.status).toBe(404);
  });

  it('happy path: a manager in this agent\'s chain sees their agent\'s inbox', async () => {
    mockOrgMemberFindOne.mockResolvedValue({ id: 'org-member-1' });
    mockIsAgentInHumanDownstream.mockResolvedValue(true);
    mockGetManagerInboxItems.mockResolvedValue([]);

    const res = await request(buildApp()).get('/api/admin/agents/agent-1/inbox').set('Authorization', `Bearer ${managerToken()}`);

    expect(res.status).toBe(200);
  });

  it('auth: an admin outside this agent\'s reporting chain is 403d and the service is never called', async () => {
    mockOrgMemberFindOne.mockResolvedValue({ id: 'org-member-1' });
    mockIsAgentInHumanDownstream.mockResolvedValue(false);

    const res = await request(buildApp()).get('/api/admin/agents/agent-1/inbox').set('Authorization', `Bearer ${managerToken()}`);

    expect(res.status).toBe(403);
    expect(mockGetManagerInboxItems).not.toHaveBeenCalled();
  });

  it('failure: an unexpected service error 500s without leaking the raw message', async () => {
    mockGetManagerInboxItems.mockRejectedValue(new Error('db unavailable'));

    const res = await request(buildApp()).get('/api/admin/agents/agent-1/inbox').set('Authorization', `Bearer ${superAdminToken()}`);

    expect(res.status).toBe(500);
    expect(res.body.error).not.toMatch(/db unavailable/);
  });
});
