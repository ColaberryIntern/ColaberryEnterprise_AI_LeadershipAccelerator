import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import {
  proposeMemory,
  listMemoryProposals,
  approveMemoryProposal,
  rejectMemoryProposal,
  AgentNotFoundError,
  MemoryProposalNotFoundError,
} from '../../services/agentMemoryProposalService';
import agentMemoryProposalRoutes from '../../routes/admin/agentMemoryProposalRoutes';

jest.mock('../../services/agentMemoryProposalService', () => {
  const actual = jest.requireActual('../../services/agentMemoryProposalService');
  return {
    ...actual,
    proposeMemory: jest.fn(),
    listMemoryProposals: jest.fn(),
    approveMemoryProposal: jest.fn(),
    rejectMemoryProposal: jest.fn(),
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

const mockProposeMemory = proposeMemory as unknown as jest.Mock;
const mockListMemoryProposals = listMemoryProposals as unknown as jest.Mock;
const mockApproveMemoryProposal = approveMemoryProposal as unknown as jest.Mock;
const mockRejectMemoryProposal = rejectMemoryProposal as unknown as jest.Mock;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(agentMemoryProposalRoutes);
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

describe('GET /api/admin/agents/:id/memory-proposals', () => {
  it('happy path: 200s with the real proposals', async () => {
    mockListMemoryProposals.mockResolvedValue([{ id: 'mem-1', status: 'pending' }]);

    const res = await request(buildApp()).get('/api/admin/agents/agent-1/memory-proposals').set('Authorization', `Bearer ${superAdminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.proposals).toHaveLength(1);
  });

  it('boundary: a nonexistent agent 404s', async () => {
    mockListMemoryProposals.mockResolvedValue(null);

    const res = await request(buildApp())
      .get('/api/admin/agents/does-not-exist/memory-proposals')
      .set('Authorization', `Bearer ${superAdminToken()}`);

    expect(res.status).toBe(404);
  });

  it("auth: an admin outside this agent's reporting chain is 403d and the service is never called", async () => {
    mockOrgMemberFindOne.mockResolvedValue({ id: 'org-member-1' });
    mockIsAgentInHumanDownstream.mockResolvedValue(false);

    const res = await request(buildApp()).get('/api/admin/agents/agent-1/memory-proposals').set('Authorization', `Bearer ${managerToken()}`);

    expect(res.status).toBe(403);
    expect(mockListMemoryProposals).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/agents/:id/memory-proposals', () => {
  it('happy path: a manager in this agent\'s chain can propose a memory', async () => {
    mockOrgMemberFindOne.mockResolvedValue({ id: 'org-member-1' });
    mockIsAgentInHumanDownstream.mockResolvedValue(true);
    mockProposeMemory.mockResolvedValue({ id: 'mem-1', status: 'pending' });

    const res = await request(buildApp())
      .post('/api/admin/agents/agent-1/memory-proposals')
      .set('Authorization', `Bearer ${managerToken()}`)
      .send({ content: 'Prefers async follow-ups.', evidence: 'Said so directly in a ticket.' });

    expect(res.status).toBe(201);
    expect(mockProposeMemory).toHaveBeenCalledWith('agent-1', 'manager@colaberry.com', 'Prefers async follow-ups.', 'Said so directly in a ticket.');
  });

  it('BREAK: empty content 400s before the service is ever called', async () => {
    const res = await request(buildApp())
      .post('/api/admin/agents/agent-1/memory-proposals')
      .set('Authorization', `Bearer ${superAdminToken()}`)
      .send({ content: '' });

    expect(res.status).toBe(400);
    expect(mockProposeMemory).not.toHaveBeenCalled();
  });

  it('BREAK: an admin outside the chain is 403d and never reaches the service', async () => {
    mockOrgMemberFindOne.mockResolvedValue({ id: 'org-member-1' });
    mockIsAgentInHumanDownstream.mockResolvedValue(false);

    const res = await request(buildApp())
      .post('/api/admin/agents/agent-1/memory-proposals')
      .set('Authorization', `Bearer ${managerToken()}`)
      .send({ content: 'X' });

    expect(res.status).toBe(403);
    expect(mockProposeMemory).not.toHaveBeenCalled();
  });

  it('boundary: a nonexistent agent 404s (service throws AgentNotFoundError)', async () => {
    mockProposeMemory.mockRejectedValue(new AgentNotFoundError('does-not-exist'));

    const res = await request(buildApp())
      .post('/api/admin/agents/does-not-exist/memory-proposals')
      .set('Authorization', `Bearer ${superAdminToken()}`)
      .send({ content: 'X' });

    expect(res.status).toBe(404);
  });
});

describe('POST /api/admin/agents/:id/memory-proposals/:proposalId/approve', () => {
  it('happy path: approves and returns the updated proposal', async () => {
    mockApproveMemoryProposal.mockResolvedValue({ id: 'mem-1', status: 'approved' });

    const res = await request(buildApp())
      .post('/api/admin/agents/agent-1/memory-proposals/mem-1/approve')
      .set('Authorization', `Bearer ${superAdminToken()}`)
      .send({});

    expect(res.status).toBe(200);
    expect(mockApproveMemoryProposal).toHaveBeenCalledWith('mem-1', 'ali@colaberry.com', undefined);
  });

  it('boundary: a nonexistent proposal 404s', async () => {
    mockApproveMemoryProposal.mockRejectedValue(new MemoryProposalNotFoundError('does-not-exist'));

    const res = await request(buildApp())
      .post('/api/admin/agents/agent-1/memory-proposals/does-not-exist/approve')
      .set('Authorization', `Bearer ${superAdminToken()}`)
      .send({});

    expect(res.status).toBe(404);
  });
});

describe('POST /api/admin/agents/:id/memory-proposals/:proposalId/reject', () => {
  it('happy path: rejects and returns the updated proposal', async () => {
    mockRejectMemoryProposal.mockResolvedValue({ id: 'mem-1', status: 'rejected' });

    const res = await request(buildApp())
      .post('/api/admin/agents/agent-1/memory-proposals/mem-1/reject')
      .set('Authorization', `Bearer ${superAdminToken()}`)
      .send({ reviewNotes: 'Not verifiable.' });

    expect(res.status).toBe(200);
    expect(mockRejectMemoryProposal).toHaveBeenCalledWith('mem-1', 'ali@colaberry.com', 'Not verifiable.');
  });
});
