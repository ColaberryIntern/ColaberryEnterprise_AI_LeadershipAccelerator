import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { getRoleCharter, upsertRoleCharter, AgentNotFoundError } from '../../services/agentRoleCharterService';
import agentRoleCharterRoutes from '../../routes/admin/agentRoleCharterRoutes';

jest.mock('../../services/agentRoleCharterService', () => {
  const actual = jest.requireActual('../../services/agentRoleCharterService');
  return {
    ...actual,
    getRoleCharter: jest.fn(),
    upsertRoleCharter: jest.fn(),
  };
});

const mockOrgMemberFindOne = jest.fn();
jest.mock('../../models/OrgMember', () => ({
  __esModule: true,
  default: { findOne: (...a: any[]) => mockOrgMemberFindOne(...a) },
}));

const mockIsAgentInHumanDownstream = jest.fn();
jest.mock('../../services/workforce/orgChartHierarchyService', () => ({
  isAgentInHumanDownstream: (...a: any[]) => mockIsAgentInHumanDownstream(...a),
}));

const mockGetRoleCharter = getRoleCharter as unknown as jest.Mock;
const mockUpsertRoleCharter = upsertRoleCharter as unknown as jest.Mock;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(agentRoleCharterRoutes);
  return app;
}

function superAdminToken() {
  return jwt.sign({ sub: 'admin-1', email: 'ali@colaberry.com', role: 'super_admin' }, env.jwtSecret);
}

function managerToken(email = 'manager@colaberry.com') {
  return jwt.sign({ sub: 'admin-2', email, role: 'admin' }, env.jwtSecret);
}

const validBody = {
  roleTitle: 'Student Retention Specialist',
  mission: 'Recover students showing dropout risk.',
  responsibilities: ['Monitor engagement signals'],
  kpis: ['Retention recovered'],
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/admin/agents/:id/charter', () => {
  it('happy path: 200s with the real charter for a super_admin', async () => {
    mockGetRoleCharter.mockResolvedValue({ agentId: 'agent-1', charter: { roleTitle: 'x', mission: 'y', responsibilities: [], kpis: [], updatedByEmail: 'a@b.com', updatedAt: new Date() } });

    const res = await request(buildApp()).get('/api/admin/agents/agent-1/charter').set('Authorization', `Bearer ${superAdminToken()}`);

    expect(res.status).toBe(200);
    expect(mockGetRoleCharter).toHaveBeenCalledWith('agent-1');
  });

  it('boundary: an agent with no charter yet returns 200 with charter: null (honest empty state, not 404)', async () => {
    mockGetRoleCharter.mockResolvedValue({ agentId: 'agent-1', charter: null });

    const res = await request(buildApp()).get('/api/admin/agents/agent-1/charter').set('Authorization', `Bearer ${superAdminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.charter).toBeNull();
  });

  it('boundary: a nonexistent agent 404s', async () => {
    mockGetRoleCharter.mockResolvedValue(null);

    const res = await request(buildApp()).get('/api/admin/agents/does-not-exist/charter').set('Authorization', `Bearer ${superAdminToken()}`);

    expect(res.status).toBe(404);
  });

  it('auth: an admin outside this agent\'s reporting chain is 403d and the service is never called', async () => {
    mockOrgMemberFindOne.mockResolvedValue({ id: 'org-member-1' });
    mockIsAgentInHumanDownstream.mockResolvedValue(false);

    const res = await request(buildApp()).get('/api/admin/agents/agent-1/charter').set('Authorization', `Bearer ${managerToken()}`);

    expect(res.status).toBe(403);
    expect(mockGetRoleCharter).not.toHaveBeenCalled();
  });

  it('failure: an unexpected service error 500s without leaking the raw message', async () => {
    mockGetRoleCharter.mockRejectedValue(new Error('db unavailable'));

    const res = await request(buildApp()).get('/api/admin/agents/agent-1/charter').set('Authorization', `Bearer ${superAdminToken()}`);

    expect(res.status).toBe(500);
    expect(res.body.error).not.toMatch(/db unavailable/);
  });
});

describe('PUT /api/admin/agents/:id/charter', () => {
  it('happy path: a manager in this agent\'s chain can write the charter', async () => {
    mockOrgMemberFindOne.mockResolvedValue({ id: 'org-member-1' });
    mockIsAgentInHumanDownstream.mockResolvedValue(true);
    mockUpsertRoleCharter.mockResolvedValue({ agentId: 'agent-1', charter: { ...validBody, updatedByEmail: 'manager@colaberry.com', updatedAt: new Date() } });

    const res = await request(buildApp())
      .put('/api/admin/agents/agent-1/charter')
      .set('Authorization', `Bearer ${managerToken()}`)
      .send(validBody);

    expect(res.status).toBe(200);
    expect(mockUpsertRoleCharter).toHaveBeenCalledWith('agent-1', validBody, 'manager@colaberry.com');
  });

  it('BREAK: an admin outside the chain is 403d and never reaches the service', async () => {
    mockOrgMemberFindOne.mockResolvedValue({ id: 'org-member-1' });
    mockIsAgentInHumanDownstream.mockResolvedValue(false);

    const res = await request(buildApp())
      .put('/api/admin/agents/agent-1/charter')
      .set('Authorization', `Bearer ${managerToken()}`)
      .send(validBody);

    expect(res.status).toBe(403);
    expect(mockUpsertRoleCharter).not.toHaveBeenCalled();
  });

  it('BREAK: malformed input (missing mission) 400s before the service is ever called', async () => {
    const res = await request(buildApp())
      .put('/api/admin/agents/agent-1/charter')
      .set('Authorization', `Bearer ${superAdminToken()}`)
      .send({ roleTitle: 'x', responsibilities: [], kpis: [] });

    expect(res.status).toBe(400);
    expect(mockUpsertRoleCharter).not.toHaveBeenCalled();
  });

  it('BREAK: oversized responsibilities array (>20) 400s', async () => {
    const res = await request(buildApp())
      .put('/api/admin/agents/agent-1/charter')
      .set('Authorization', `Bearer ${superAdminToken()}`)
      .send({ ...validBody, responsibilities: Array.from({ length: 21 }, (_, i) => `item ${i}`) });

    expect(res.status).toBe(400);
    expect(mockUpsertRoleCharter).not.toHaveBeenCalled();
  });

  it('boundary: a nonexistent agent 404s (service throws AgentNotFoundError)', async () => {
    mockUpsertRoleCharter.mockRejectedValue(new AgentNotFoundError('does-not-exist'));

    const res = await request(buildApp())
      .put('/api/admin/agents/does-not-exist/charter')
      .set('Authorization', `Bearer ${superAdminToken()}`)
      .send(validBody);

    expect(res.status).toBe(404);
  });

  it('never modifies system_prompt or any AiAgent column — only ever calls upsertRoleCharter with the charter fields', async () => {
    mockOrgMemberFindOne.mockResolvedValue({ id: 'org-member-1' });
    mockIsAgentInHumanDownstream.mockResolvedValue(true);
    mockUpsertRoleCharter.mockResolvedValue({ agentId: 'agent-1', charter: { ...validBody, updatedByEmail: 'manager@colaberry.com', updatedAt: new Date() } });

    await request(buildApp()).put('/api/admin/agents/agent-1/charter').set('Authorization', `Bearer ${managerToken()}`).send(validBody);

    const [, calledInput] = mockUpsertRoleCharter.mock.calls[0];
    expect(Object.keys(calledInput).sort()).toEqual(['kpis', 'mission', 'responsibilities', 'roleTitle']);
  });
});
