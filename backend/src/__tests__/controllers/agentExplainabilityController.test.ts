import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { getAgentExplainability } from '../../services/agentExplainabilityService';
import agentExplainabilityRoutes from '../../routes/admin/agentExplainabilityRoutes';

jest.mock('../../services/agentExplainabilityService', () => ({
  getAgentExplainability: jest.fn(),
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

const mockGetAgentExplainability = getAgentExplainability as unknown as jest.Mock;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(agentExplainabilityRoutes);
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

describe('GET /api/admin/agents/:id/explainability', () => {
  it('happy path: 200s with the real evidence bundle', async () => {
    mockGetAgentExplainability.mockResolvedValue({ agentId: 'agent-1', agentName: 'CoryBrain', events: [], proposedActions: [] });

    const res = await request(buildApp()).get('/api/admin/agents/agent-1/explainability').set('Authorization', `Bearer ${superAdminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.agentName).toBe('CoryBrain');
  });

  it('boundary: a nonexistent agent 404s', async () => {
    mockGetAgentExplainability.mockResolvedValue(null);

    const res = await request(buildApp())
      .get('/api/admin/agents/does-not-exist/explainability')
      .set('Authorization', `Bearer ${superAdminToken()}`);

    expect(res.status).toBe(404);
  });

  it("auth: an admin outside this agent's reporting chain is 403d and the service is never called", async () => {
    mockOrgMemberFindOne.mockResolvedValue({ id: 'org-member-1' });
    mockIsAgentInHumanDownstream.mockResolvedValue(false);

    const res = await request(buildApp()).get('/api/admin/agents/agent-1/explainability').set('Authorization', `Bearer ${managerToken()}`);

    expect(res.status).toBe(403);
    expect(mockGetAgentExplainability).not.toHaveBeenCalled();
  });

  it('a manager in this agent\'s chain can read it', async () => {
    mockOrgMemberFindOne.mockResolvedValue({ id: 'org-member-1' });
    mockIsAgentInHumanDownstream.mockResolvedValue(true);
    mockGetAgentExplainability.mockResolvedValue({ agentId: 'agent-1', agentName: 'CoryBrain', events: [], proposedActions: [] });

    const res = await request(buildApp()).get('/api/admin/agents/agent-1/explainability').set('Authorization', `Bearer ${managerToken()}`);

    expect(res.status).toBe(200);
  });
});
