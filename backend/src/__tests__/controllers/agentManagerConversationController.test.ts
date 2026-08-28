import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { getConversationHistory, sendManagerMessage, AgentNotFoundError } from '../../services/agentManagerConversationService';
import agentManagerConversationRoutes from '../../routes/admin/agentManagerConversationRoutes';

jest.mock('../../services/agentManagerConversationService', () => {
  const actual = jest.requireActual('../../services/agentManagerConversationService');
  return { ...actual, getConversationHistory: jest.fn(), sendManagerMessage: jest.fn() };
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

const mockGetConversationHistory = getConversationHistory as unknown as jest.Mock;
const mockSendManagerMessage = sendManagerMessage as unknown as jest.Mock;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(agentManagerConversationRoutes);
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

describe('GET /api/admin/agents/:id/conversation', () => {
  it('happy path: 200s with the real conversation history', async () => {
    mockGetConversationHistory.mockResolvedValue({ conversationId: 'conv-1', agentId: 'agent-1', messages: [] });

    const res = await request(buildApp()).get('/api/admin/agents/agent-1/conversation').set('Authorization', `Bearer ${superAdminToken()}`);

    expect(res.status).toBe(200);
    expect(mockGetConversationHistory).toHaveBeenCalledWith('agent-1', 'ali@colaberry.com');
  });

  it('boundary: a nonexistent agent 404s', async () => {
    mockGetConversationHistory.mockResolvedValue(null);

    const res = await request(buildApp()).get('/api/admin/agents/does-not-exist/conversation').set('Authorization', `Bearer ${superAdminToken()}`);

    expect(res.status).toBe(404);
  });

  it('auth: an admin outside this agent\'s reporting chain is 403d and the service is never called', async () => {
    mockOrgMemberFindOne.mockResolvedValue({ id: 'org-member-1' });
    mockIsAgentInHumanDownstream.mockResolvedValue(false);

    const res = await request(buildApp()).get('/api/admin/agents/agent-1/conversation').set('Authorization', `Bearer ${managerToken()}`);

    expect(res.status).toBe(403);
    expect(mockGetConversationHistory).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/agents/:id/conversation/messages', () => {
  it('happy path: a manager in this agent\'s chain can send a message and gets the real reply back', async () => {
    mockOrgMemberFindOne.mockResolvedValue({ id: 'org-member-1' });
    mockIsAgentInHumanDownstream.mockResolvedValue(true);
    mockSendManagerMessage.mockResolvedValue({ conversationId: 'conv-1', agentId: 'agent-1', messages: [{ role: 'agent', content: 'reply' }] });

    const res = await request(buildApp())
      .post('/api/admin/agents/agent-1/conversation/messages')
      .set('Authorization', `Bearer ${managerToken()}`)
      .send({ message: 'How are you doing?' });

    expect(res.status).toBe(201);
    expect(mockSendManagerMessage).toHaveBeenCalledWith('agent-1', 'manager@colaberry.com', 'org-member-1', 'How are you doing?');
  });

  it('BREAK: an admin outside the chain is 403d and never reaches the service (never triggers a real LLM call)', async () => {
    mockOrgMemberFindOne.mockResolvedValue({ id: 'org-member-1' });
    mockIsAgentInHumanDownstream.mockResolvedValue(false);

    const res = await request(buildApp())
      .post('/api/admin/agents/agent-1/conversation/messages')
      .set('Authorization', `Bearer ${managerToken()}`)
      .send({ message: 'hi' });

    expect(res.status).toBe(403);
    expect(mockSendManagerMessage).not.toHaveBeenCalled();
  });

  it('BREAK: empty message 400s before the service (and the LLM) is ever called', async () => {
    const res = await request(buildApp())
      .post('/api/admin/agents/agent-1/conversation/messages')
      .set('Authorization', `Bearer ${superAdminToken()}`)
      .send({ message: '' });

    expect(res.status).toBe(400);
    expect(mockSendManagerMessage).not.toHaveBeenCalled();
  });

  it('BREAK: an oversized message (>4000 chars) 400s', async () => {
    const res = await request(buildApp())
      .post('/api/admin/agents/agent-1/conversation/messages')
      .set('Authorization', `Bearer ${superAdminToken()}`)
      .send({ message: 'x'.repeat(4001) });

    expect(res.status).toBe(400);
    expect(mockSendManagerMessage).not.toHaveBeenCalled();
  });

  it('boundary: a nonexistent agent 404s (service throws AgentNotFoundError)', async () => {
    mockSendManagerMessage.mockRejectedValue(new AgentNotFoundError('does-not-exist'));

    const res = await request(buildApp())
      .post('/api/admin/agents/does-not-exist/conversation/messages')
      .set('Authorization', `Bearer ${superAdminToken()}`)
      .send({ message: 'hi' });

    expect(res.status).toBe(404);
  });

  it('failure: an unexpected error (e.g. the LLM call itself failing) 500s without leaking the raw message', async () => {
    mockSendManagerMessage.mockRejectedValue(new Error('OpenAI API error: rate limited'));

    const res = await request(buildApp())
      .post('/api/admin/agents/agent-1/conversation/messages')
      .set('Authorization', `Bearer ${superAdminToken()}`)
      .send({ message: 'hi' });

    expect(res.status).toBe(500);
    expect(res.body.error).not.toMatch(/rate limited/);
  });
});
