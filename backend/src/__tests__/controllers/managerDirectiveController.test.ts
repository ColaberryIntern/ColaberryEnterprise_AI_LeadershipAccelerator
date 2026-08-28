import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { listDirectives, createDirective, revokeDirective, AgentNotFoundError, DirectiveNotFoundError } from '../../services/managerDirectiveService';
import managerDirectiveRoutes from '../../routes/admin/managerDirectiveRoutes';

jest.mock('../../services/managerDirectiveService', () => {
  const actual = jest.requireActual('../../services/managerDirectiveService');
  return { ...actual, listDirectives: jest.fn(), createDirective: jest.fn(), revokeDirective: jest.fn() };
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

const mockListDirectives = listDirectives as unknown as jest.Mock;
const mockCreateDirective = createDirective as unknown as jest.Mock;
const mockRevokeDirective = revokeDirective as unknown as jest.Mock;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(managerDirectiveRoutes);
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

describe('GET /api/admin/agents/:id/directives', () => {
  it('happy path: 200s with the full directive history', async () => {
    mockListDirectives.mockResolvedValue([{ id: 'd1', status: 'active' }]);

    const res = await request(buildApp()).get('/api/admin/agents/agent-1/directives').set('Authorization', `Bearer ${superAdminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.directives).toHaveLength(1);
  });

  it('boundary: a nonexistent agent 404s', async () => {
    mockListDirectives.mockResolvedValue(null);

    const res = await request(buildApp()).get('/api/admin/agents/does-not-exist/directives').set('Authorization', `Bearer ${superAdminToken()}`);

    expect(res.status).toBe(404);
  });

  it('auth: an admin outside this agent\'s reporting chain is 403d and the service is never called', async () => {
    mockOrgMemberFindOne.mockResolvedValue({ id: 'org-member-1' });
    mockIsAgentInHumanDownstream.mockResolvedValue(false);

    const res = await request(buildApp()).get('/api/admin/agents/agent-1/directives').set('Authorization', `Bearer ${managerToken()}`);

    expect(res.status).toBe(403);
    expect(mockListDirectives).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/agents/:id/directives', () => {
  it('happy path: a manager in this agent\'s chain can create a directive, attributed to their resolved org member', async () => {
    mockOrgMemberFindOne.mockResolvedValue({ id: 'org-member-1' });
    mockIsAgentInHumanDownstream.mockResolvedValue(true);
    mockCreateDirective.mockResolvedValue({ id: 'd1', status: 'active' });

    const res = await request(buildApp())
      .post('/api/admin/agents/agent-1/directives')
      .set('Authorization', `Bearer ${managerToken()}`)
      .send({ directiveText: 'Always loop in the manager on financial tickets.' });

    expect(res.status).toBe(201);
    expect(mockCreateDirective).toHaveBeenCalledWith('agent-1', 'org-member-1', 'manager@colaberry.com', 'Always loop in the manager on financial tickets.');
  });

  it('happy path: a super_admin (no resolved org member) creates a directive with a null org member id, real email attribution', async () => {
    mockCreateDirective.mockResolvedValue({ id: 'd2', status: 'active' });

    const res = await request(buildApp())
      .post('/api/admin/agents/agent-1/directives')
      .set('Authorization', `Bearer ${superAdminToken()}`)
      .send({ directiveText: 'text' });

    expect(res.status).toBe(201);
    expect(mockCreateDirective).toHaveBeenCalledWith('agent-1', null, 'ali@colaberry.com', 'text');
  });

  it('BREAK: an admin outside the chain is 403d and never reaches the service', async () => {
    mockOrgMemberFindOne.mockResolvedValue({ id: 'org-member-1' });
    mockIsAgentInHumanDownstream.mockResolvedValue(false);

    const res = await request(buildApp())
      .post('/api/admin/agents/agent-1/directives')
      .set('Authorization', `Bearer ${managerToken()}`)
      .send({ directiveText: 'text' });

    expect(res.status).toBe(403);
    expect(mockCreateDirective).not.toHaveBeenCalled();
  });

  it('BREAK: empty directive text 400s before the service is ever called', async () => {
    const res = await request(buildApp())
      .post('/api/admin/agents/agent-1/directives')
      .set('Authorization', `Bearer ${superAdminToken()}`)
      .send({ directiveText: '' });

    expect(res.status).toBe(400);
    expect(mockCreateDirective).not.toHaveBeenCalled();
  });

  it('boundary: a nonexistent agent 404s (service throws AgentNotFoundError)', async () => {
    mockCreateDirective.mockRejectedValue(new AgentNotFoundError('does-not-exist'));

    const res = await request(buildApp())
      .post('/api/admin/agents/does-not-exist/directives')
      .set('Authorization', `Bearer ${superAdminToken()}`)
      .send({ directiveText: 'text' });

    expect(res.status).toBe(404);
  });
});

describe('POST /api/admin/agents/:id/directives/:directiveId/revoke', () => {
  it('happy path: revokes and returns the updated directive', async () => {
    mockRevokeDirective.mockResolvedValue({ id: 'd1', status: 'revoked' });

    const res = await request(buildApp())
      .post('/api/admin/agents/agent-1/directives/d1/revoke')
      .set('Authorization', `Bearer ${superAdminToken()}`);

    expect(res.status).toBe(200);
    expect(mockRevokeDirective).toHaveBeenCalledWith('d1', 'ali@colaberry.com');
  });

  it('BREAK: an admin outside the chain is 403d and never reaches the service', async () => {
    mockOrgMemberFindOne.mockResolvedValue({ id: 'org-member-1' });
    mockIsAgentInHumanDownstream.mockResolvedValue(false);

    const res = await request(buildApp())
      .post('/api/admin/agents/agent-1/directives/d1/revoke')
      .set('Authorization', `Bearer ${managerToken()}`);

    expect(res.status).toBe(403);
    expect(mockRevokeDirective).not.toHaveBeenCalled();
  });

  it('boundary: a nonexistent directive 404s (service throws DirectiveNotFoundError)', async () => {
    mockRevokeDirective.mockRejectedValue(new DirectiveNotFoundError('does-not-exist'));

    const res = await request(buildApp())
      .post('/api/admin/agents/agent-1/directives/does-not-exist/revoke')
      .set('Authorization', `Bearer ${superAdminToken()}`);

    expect(res.status).toBe(404);
  });
});
