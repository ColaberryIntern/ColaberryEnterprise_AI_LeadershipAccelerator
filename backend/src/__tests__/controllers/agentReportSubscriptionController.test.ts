import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import {
  createReportSubscription,
  listReportSubscriptions,
  updateReportSubscription,
  AgentNotFoundError,
  ReportSubscriptionNotFoundError,
} from '../../services/agentReportSubscriptionService';
import agentReportSubscriptionRoutes from '../../routes/admin/agentReportSubscriptionRoutes';

jest.mock('../../services/agentReportSubscriptionService', () => {
  const actual = jest.requireActual('../../services/agentReportSubscriptionService');
  return { ...actual, createReportSubscription: jest.fn(), listReportSubscriptions: jest.fn(), updateReportSubscription: jest.fn() };
});

const mockOrgMemberFindOne = jest.fn();
jest.mock('../../models/OrgMember', () => ({
  __esModule: true,
  default: { findOne: (...a: any[]) => mockOrgMemberFindOne(...a), findByPk: jest.fn() },
}));

const mockIsAgentInHumanDownstream = jest.fn();
jest.mock('../../services/workforce/orgChartHierarchyService', () => ({
  isAgentInHumanDownstream: (...a: any[]) => mockIsAgentInHumanDownstream(...a),
}));

const mockCreateReportSubscription = createReportSubscription as unknown as jest.Mock;
const mockListReportSubscriptions = listReportSubscriptions as unknown as jest.Mock;
const mockUpdateReportSubscription = updateReportSubscription as unknown as jest.Mock;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(agentReportSubscriptionRoutes);
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

describe('GET /api/admin/agents/:id/report-subscriptions', () => {
  it('happy path: 200s with the real subscriptions', async () => {
    mockListReportSubscriptions.mockResolvedValue([{ id: 'sub-1', enabled: true }]);

    const res = await request(buildApp())
      .get('/api/admin/agents/agent-1/report-subscriptions')
      .set('Authorization', `Bearer ${superAdminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.subscriptions).toHaveLength(1);
  });

  it('boundary: a nonexistent agent 404s', async () => {
    mockListReportSubscriptions.mockResolvedValue(null);

    const res = await request(buildApp())
      .get('/api/admin/agents/does-not-exist/report-subscriptions')
      .set('Authorization', `Bearer ${superAdminToken()}`);

    expect(res.status).toBe(404);
  });

  it("auth: an admin outside this agent's reporting chain is 403d and the service is never called", async () => {
    mockOrgMemberFindOne.mockResolvedValue({ id: 'org-member-1' });
    mockIsAgentInHumanDownstream.mockResolvedValue(false);

    const res = await request(buildApp())
      .get('/api/admin/agents/agent-1/report-subscriptions')
      .set('Authorization', `Bearer ${managerToken()}`);

    expect(res.status).toBe(403);
    expect(mockListReportSubscriptions).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/agents/:id/report-subscriptions', () => {
  it('happy path: a manager in this agent\'s chain can create a subscription', async () => {
    mockOrgMemberFindOne.mockResolvedValue({ id: 'org-member-1' });
    mockIsAgentInHumanDownstream.mockResolvedValue(true);
    mockCreateReportSubscription.mockResolvedValue({ id: 'sub-1', enabled: true });

    const res = await request(buildApp())
      .post('/api/admin/agents/agent-1/report-subscriptions')
      .set('Authorization', `Bearer ${managerToken()}`)
      .send({ contentScope: ['cost', 'tickets'], cadence: 'daily', deliveryHourLocal: 8 });

    expect(res.status).toBe(201);
    expect(mockCreateReportSubscription).toHaveBeenCalledWith(
      'agent-1',
      'org-member-1',
      'manager@colaberry.com',
      ['cost', 'tickets'],
      'daily',
      8,
      undefined
    );
  });

  it('BREAK: an empty contentScope 400s before the service is ever called', async () => {
    const res = await request(buildApp())
      .post('/api/admin/agents/agent-1/report-subscriptions')
      .set('Authorization', `Bearer ${superAdminToken()}`)
      .send({ contentScope: [], cadence: 'daily', deliveryHourLocal: 8 });

    expect(res.status).toBe(400);
    expect(mockCreateReportSubscription).not.toHaveBeenCalled();
  });

  it('BREAK: an invalid contentScope value outside the closed enum 400s', async () => {
    const res = await request(buildApp())
      .post('/api/admin/agents/agent-1/report-subscriptions')
      .set('Authorization', `Bearer ${superAdminToken()}`)
      .send({ contentScope: ['made_up_section'], cadence: 'daily', deliveryHourLocal: 8 });

    expect(res.status).toBe(400);
    expect(mockCreateReportSubscription).not.toHaveBeenCalled();
  });

  it('BREAK: a deliveryHourLocal outside 0-23 400s', async () => {
    const res = await request(buildApp())
      .post('/api/admin/agents/agent-1/report-subscriptions')
      .set('Authorization', `Bearer ${superAdminToken()}`)
      .send({ contentScope: ['cost'], cadence: 'daily', deliveryHourLocal: 24 });

    expect(res.status).toBe(400);
    expect(mockCreateReportSubscription).not.toHaveBeenCalled();
  });

  it('BREAK: an admin outside the chain is 403d and never reaches the service', async () => {
    mockOrgMemberFindOne.mockResolvedValue({ id: 'org-member-1' });
    mockIsAgentInHumanDownstream.mockResolvedValue(false);

    const res = await request(buildApp())
      .post('/api/admin/agents/agent-1/report-subscriptions')
      .set('Authorization', `Bearer ${managerToken()}`)
      .send({ contentScope: ['cost'], cadence: 'daily', deliveryHourLocal: 8 });

    expect(res.status).toBe(403);
    expect(mockCreateReportSubscription).not.toHaveBeenCalled();
  });

  it('boundary: a nonexistent agent 404s (service throws AgentNotFoundError)', async () => {
    mockCreateReportSubscription.mockRejectedValue(new AgentNotFoundError('does-not-exist'));

    const res = await request(buildApp())
      .post('/api/admin/agents/does-not-exist/report-subscriptions')
      .set('Authorization', `Bearer ${superAdminToken()}`)
      .send({ contentScope: ['cost'], cadence: 'daily', deliveryHourLocal: 8 });

    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/admin/agents/:id/report-subscriptions/:subscriptionId', () => {
  it('happy path: disables a subscription', async () => {
    mockUpdateReportSubscription.mockResolvedValue({ id: 'sub-1', enabled: false });

    const res = await request(buildApp())
      .patch('/api/admin/agents/agent-1/report-subscriptions/sub-1')
      .set('Authorization', `Bearer ${superAdminToken()}`)
      .send({ enabled: false });

    expect(res.status).toBe(200);
    expect(mockUpdateReportSubscription).toHaveBeenCalledWith('sub-1', { enabled: false });
  });

  it('boundary: a nonexistent subscription 404s', async () => {
    mockUpdateReportSubscription.mockRejectedValue(new ReportSubscriptionNotFoundError('does-not-exist'));

    const res = await request(buildApp())
      .patch('/api/admin/agents/agent-1/report-subscriptions/does-not-exist')
      .set('Authorization', `Bearer ${superAdminToken()}`)
      .send({ enabled: false });

    expect(res.status).toBe(404);
  });
});
