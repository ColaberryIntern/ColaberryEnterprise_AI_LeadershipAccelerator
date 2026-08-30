import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import {
  createOneOnOne,
  listOneOnOnes,
  completeOneOnOne,
  AgentNotFoundError,
  OneOnOneNotFoundError,
  OneOnOneAlreadyCompletedError,
} from '../../services/agentOneOnOneService';
import agentOneOnOneRoutes from '../../routes/admin/agentOneOnOneRoutes';

jest.mock('../../services/agentOneOnOneService', () => {
  const actual = jest.requireActual('../../services/agentOneOnOneService');
  return { ...actual, createOneOnOne: jest.fn(), listOneOnOnes: jest.fn(), completeOneOnOne: jest.fn() };
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

const mockCreateOneOnOne = createOneOnOne as unknown as jest.Mock;
const mockListOneOnOnes = listOneOnOnes as unknown as jest.Mock;
const mockCompleteOneOnOne = completeOneOnOne as unknown as jest.Mock;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(agentOneOnOneRoutes);
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

describe('GET /api/admin/agents/:id/one-on-ones', () => {
  it('happy path: 200s with the real history', async () => {
    mockListOneOnOnes.mockResolvedValue([{ id: '1:1-1', status: 'scheduled' }]);

    const res = await request(buildApp()).get('/api/admin/agents/agent-1/one-on-ones').set('Authorization', `Bearer ${superAdminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.oneOnOnes).toHaveLength(1);
  });

  it('boundary: a nonexistent agent 404s', async () => {
    mockListOneOnOnes.mockResolvedValue(null);

    const res = await request(buildApp()).get('/api/admin/agents/does-not-exist/one-on-ones').set('Authorization', `Bearer ${superAdminToken()}`);

    expect(res.status).toBe(404);
  });

  it('auth: an admin outside this agent\'s reporting chain is 403d and the service is never called', async () => {
    mockOrgMemberFindOne.mockResolvedValue({ id: 'org-member-1' });
    mockIsAgentInHumanDownstream.mockResolvedValue(false);

    const res = await request(buildApp()).get('/api/admin/agents/agent-1/one-on-ones').set('Authorization', `Bearer ${managerToken()}`);

    expect(res.status).toBe(403);
    expect(mockListOneOnOnes).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/agents/:id/one-on-ones', () => {
  it('happy path: a manager in this agent\'s chain can schedule a 1:1', async () => {
    mockOrgMemberFindOne.mockResolvedValue({ id: 'org-member-1' });
    mockIsAgentInHumanDownstream.mockResolvedValue(true);
    mockCreateOneOnOne.mockResolvedValue({ id: '1:1-1', status: 'scheduled' });

    const res = await request(buildApp())
      .post('/api/admin/agents/agent-1/one-on-ones')
      .set('Authorization', `Bearer ${managerToken()}`)
      .send({ agenda: 'Discuss Q3 performance' });

    expect(res.status).toBe(201);
    expect(mockCreateOneOnOne).toHaveBeenCalledWith('agent-1', 'org-member-1', 'manager@colaberry.com', 'Discuss Q3 performance');
  });

  it('BREAK: an admin outside the chain is 403d and never reaches the service', async () => {
    mockOrgMemberFindOne.mockResolvedValue({ id: 'org-member-1' });
    mockIsAgentInHumanDownstream.mockResolvedValue(false);

    const res = await request(buildApp())
      .post('/api/admin/agents/agent-1/one-on-ones')
      .set('Authorization', `Bearer ${managerToken()}`)
      .send({ agenda: 'agenda' });

    expect(res.status).toBe(403);
    expect(mockCreateOneOnOne).not.toHaveBeenCalled();
  });

  it('BREAK: empty agenda 400s before the service is ever called', async () => {
    const res = await request(buildApp())
      .post('/api/admin/agents/agent-1/one-on-ones')
      .set('Authorization', `Bearer ${superAdminToken()}`)
      .send({ agenda: '' });

    expect(res.status).toBe(400);
    expect(mockCreateOneOnOne).not.toHaveBeenCalled();
  });

  it('boundary: a nonexistent agent 404s (service throws AgentNotFoundError)', async () => {
    mockCreateOneOnOne.mockRejectedValue(new AgentNotFoundError('does-not-exist'));

    const res = await request(buildApp())
      .post('/api/admin/agents/does-not-exist/one-on-ones')
      .set('Authorization', `Bearer ${superAdminToken()}`)
      .send({ agenda: 'agenda' });

    expect(res.status).toBe(404);
  });
});

describe('POST /api/admin/agents/:id/one-on-ones/:oneOnOneId/complete', () => {
  it('happy path: completes with real outcome notes', async () => {
    mockCompleteOneOnOne.mockResolvedValue({ id: '1:1-1', status: 'completed' });

    const res = await request(buildApp())
      .post('/api/admin/agents/agent-1/one-on-ones/1:1-1/complete')
      .set('Authorization', `Bearer ${superAdminToken()}`)
      .send({ outcomeNotes: 'Agreed to reduce reply latency by 20%.' });

    expect(res.status).toBe(200);
    expect(mockCompleteOneOnOne).toHaveBeenCalledWith('1:1-1', 'Agreed to reduce reply latency by 20%.');
  });

  it('BREAK: empty outcome notes 400s before the service is ever called', async () => {
    const res = await request(buildApp())
      .post('/api/admin/agents/agent-1/one-on-ones/1:1-1/complete')
      .set('Authorization', `Bearer ${superAdminToken()}`)
      .send({ outcomeNotes: '' });

    expect(res.status).toBe(400);
    expect(mockCompleteOneOnOne).not.toHaveBeenCalled();
  });

  it('BREAK (idempotency): completing an already-completed 1:1 400s, never silently overwrites', async () => {
    mockCompleteOneOnOne.mockRejectedValue(new OneOnOneAlreadyCompletedError('1:1-1'));

    const res = await request(buildApp())
      .post('/api/admin/agents/agent-1/one-on-ones/1:1-1/complete')
      .set('Authorization', `Bearer ${superAdminToken()}`)
      .send({ outcomeNotes: 'new notes' });

    expect(res.status).toBe(400);
  });

  it('boundary: a nonexistent 1:1 404s', async () => {
    mockCompleteOneOnOne.mockRejectedValue(new OneOnOneNotFoundError('does-not-exist'));

    const res = await request(buildApp())
      .post('/api/admin/agents/agent-1/one-on-ones/does-not-exist/complete')
      .set('Authorization', `Bearer ${superAdminToken()}`)
      .send({ outcomeNotes: 'notes' });

    expect(res.status).toBe(404);
  });
});
