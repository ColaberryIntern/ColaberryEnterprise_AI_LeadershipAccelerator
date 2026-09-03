import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { getManagerInboxItems, approveManagerInboxItem, rejectManagerInboxItem } from '../../services/managerInboxService';
import managerInboxRoutes from '../../routes/admin/managerInboxRoutes';

jest.mock('../../services/managerInboxService', () => ({
  getManagerInboxItems: jest.fn(),
  approveManagerInboxItem: jest.fn(),
  rejectManagerInboxItem: jest.fn(),
}));

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
const mockApproveManagerInboxItem = approveManagerInboxItem as unknown as jest.Mock;
const mockRejectManagerInboxItem = rejectManagerInboxItem as unknown as jest.Mock;

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

describe('POST /api/admin/agents/:id/inbox/:proposalId/approve', () => {
  it('happy path: 200s with the real applied flag for a super_admin', async () => {
    mockApproveManagerInboxItem.mockResolvedValue({ outcome: 'approved', applied: true, item: { id: 'p1', status: 'approved' } });

    const res = await request(buildApp()).post('/api/admin/agents/agent-1/inbox/p1/approve').set('Authorization', `Bearer ${superAdminToken()}`).send({ notes: 'ok' });

    expect(res.status).toBe(200);
    expect(res.body.applied).toBe(true);
    expect(mockApproveManagerInboxItem).toHaveBeenCalledWith('agent-1', 'p1', 'ali@colaberry.com', 'ok');
  });

  it('boundary: a proposal that does not belong to this agent 404s, same as a missing one', async () => {
    mockApproveManagerInboxItem.mockResolvedValue({ outcome: 'not_found' });

    const res = await request(buildApp()).post('/api/admin/agents/agent-1/inbox/other-agents-proposal/approve').set('Authorization', `Bearer ${superAdminToken()}`).send({});

    expect(res.status).toBe(404);
  });

  it('boundary: an already-decided proposal 400s with its real current status', async () => {
    mockApproveManagerInboxItem.mockResolvedValue({ outcome: 'not_pending', item: { status: 'rejected' } });

    const res = await request(buildApp()).post('/api/admin/agents/agent-1/inbox/p1/approve').set('Authorization', `Bearer ${superAdminToken()}`).send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/rejected/);
  });

  it('auth: an admin outside this agent\'s reporting chain is 403d and the service is never called', async () => {
    mockOrgMemberFindOne.mockResolvedValue({ id: 'org-member-1' });
    mockIsAgentInHumanDownstream.mockResolvedValue(false);

    const res = await request(buildApp()).post('/api/admin/agents/agent-1/inbox/p1/approve').set('Authorization', `Bearer ${managerToken()}`).send({});

    expect(res.status).toBe(403);
    expect(mockApproveManagerInboxItem).not.toHaveBeenCalled();
  });

  it('failure: an unexpected service error 500s without leaking the raw message', async () => {
    mockApproveManagerInboxItem.mockRejectedValue(new Error('db unavailable'));

    const res = await request(buildApp()).post('/api/admin/agents/agent-1/inbox/p1/approve').set('Authorization', `Bearer ${superAdminToken()}`).send({});

    expect(res.status).toBe(500);
    expect(res.body.error).not.toMatch(/db unavailable/);
  });
});

describe('POST /api/admin/agents/:id/inbox/:proposalId/reject', () => {
  it('happy path: 200s for a super_admin', async () => {
    mockRejectManagerInboxItem.mockResolvedValue({ outcome: 'rejected', item: { id: 'p1', status: 'rejected' } });

    const res = await request(buildApp()).post('/api/admin/agents/agent-1/inbox/p1/reject').set('Authorization', `Bearer ${superAdminToken()}`).send({ notes: 'no' });

    expect(res.status).toBe(200);
    expect(mockRejectManagerInboxItem).toHaveBeenCalledWith('agent-1', 'p1', 'ali@colaberry.com', 'no');
  });

  it('boundary: a proposal that does not belong to this agent 404s', async () => {
    mockRejectManagerInboxItem.mockResolvedValue({ outcome: 'not_found' });

    const res = await request(buildApp()).post('/api/admin/agents/agent-1/inbox/other-agents-proposal/reject').set('Authorization', `Bearer ${superAdminToken()}`).send({});

    expect(res.status).toBe(404);
  });

  it('auth: an admin outside this agent\'s reporting chain is 403d and the service is never called', async () => {
    mockOrgMemberFindOne.mockResolvedValue({ id: 'org-member-1' });
    mockIsAgentInHumanDownstream.mockResolvedValue(false);

    const res = await request(buildApp()).post('/api/admin/agents/agent-1/inbox/p1/reject').set('Authorization', `Bearer ${managerToken()}`).send({});

    expect(res.status).toBe(403);
    expect(mockRejectManagerInboxItem).not.toHaveBeenCalled();
  });
});
