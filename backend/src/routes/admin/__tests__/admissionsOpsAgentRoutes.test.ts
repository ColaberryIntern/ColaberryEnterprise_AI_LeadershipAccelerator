jest.mock('jsonwebtoken', () => ({ verify: jest.fn() }));
jest.mock('../../../config/env', () => require('../../../__tests__/testSupport/configMocks').envModuleMock({ jwtSecret: 'test-secret' }));
const mockHandle = jest.fn();
const mockDecide = jest.fn();
const mockCount = jest.fn();
jest.mock('../../../services/admissionsOps/intentService', () => ({
  handleIntent: (...a: unknown[]) => mockHandle(...a),
  decideApproval: (...a: unknown[]) => mockDecide(...a),
  countOpenApprovals: (...a: unknown[]) => mockCount(...a),
}));

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import router from '../admissionsOpsAgentRoutes';

/** AO2.3 the agent's door and the person's decision, through real Express routing (service mocked). */
const verify = jwt.verify as unknown as jest.Mock;
const app = express();
app.use(express.json());
app.use(router);
const OWNER = { role: 'admin', mgmt_role: 'owner', sub: 'u-ali', email: 'owner@example.test' };
const NO_SECTION = { role: 'admin', mgmt_role: 'lead_intake', mgmt_extra_sections: ['agents'] };
const as = (who: Record<string, unknown> | null) => { verify.mockReturnValue(who); return who ? { Authorization: 'Bearer t' } : {}; };
const INTENTS = '/api/admin/admissions-ops/agent/intents';
const RID = 'req-12345678';
const APPROVAL = '11111111-1111-4111-8111-111111111111';
let errSpy: jest.SpyInstance;
beforeEach(() => { jest.clearAllMocks(); errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined); });
afterEach(() => errSpy.mockRestore());

describe('AO2.3 POST /agent/intents', () => {
  it('records a person\'s dock navigation (200) and passes the caller through', async () => {
    mockHandle.mockResolvedValue({ request_id: RID, outcome: 'done', reason: null, approval_id: null, replayed: false });
    const res = await request(app).post(INTENTS).set(as(OWNER)).send({ request_id: RID, type: 'navigate', screen: 'today', action: 'tfcAudit.open' });
    expect(res.status).toBe(200);
    expect(mockHandle.mock.calls[0][1]).toMatchObject({ actor: 'person', onBehalfOf: 'owner@example.test', agentId: null });
  });

  it('an agent level-5 invoke answers 202 with the approval it created', async () => {
    mockHandle.mockResolvedValue({ request_id: RID, outcome: 'sent_to_approval', reason: 'level_5_needs_a_person', approval_id: APPROVAL, replayed: false });
    const res = await request(app).post(INTENTS).set({ ...as(OWNER), 'X-Ops-Actor': 'agent', 'X-Ops-Agent-Id': 'aura', 'X-Ops-Agent-Version': '0.1' })
      .send({ request_id: RID, type: 'invoke', screen: 'payments', action: 'payments.requestRefund', params: { ref: 'sample-1', reason: 'duplicate charge' } });
    expect(res.status).toBe(202);
    expect(res.body.approval_id).toBe(APPROVAL);
    expect(mockHandle.mock.calls[0][1]).toMatchObject({ actor: 'agent', agentId: 'aura', agentVersion: '0.1' });
  });

  it('a replayed request answers 200 with the first result', async () => {
    mockHandle.mockResolvedValue({ request_id: RID, outcome: 'sent_to_approval', reason: 'level_5_needs_a_person', approval_id: APPROVAL, replayed: true });
    const res = await request(app).post(INTENTS).set(as(OWNER)).send({ request_id: RID, type: 'invoke', screen: 'payments', action: 'payments.requestRefund', params: { ref: 'a', reason: 'b' } });
    expect(res.status).toBe(200);
    expect(res.body.replayed).toBe(true);
  });

  it.each([
    ['no request id', { type: 'navigate', screen: 'today' }],
    ['a bad request id', { request_id: 'x', type: 'navigate', screen: 'today' }],
    ['an unknown screen', { request_id: RID, type: 'navigate', screen: 'nowhere' }],
    ['an unknown type', { request_id: RID, type: 'execute', screen: 'today' }],
    ['an undeclared field', { request_id: RID, type: 'navigate', screen: 'today', sneaky: 1 }],
    ['an invoke with no action', { request_id: RID, type: 'invoke', screen: 'today' }],
    ['an unknown action', { request_id: RID, type: 'invoke', screen: 'payments', action: 'payments.approveRefund' }],
    ['an action from another screen', { request_id: RID, type: 'invoke', screen: 'today', action: 'payments.requestRefund', params: { ref: 'a', reason: 'b' } }],
    ['missing required params', { request_id: RID, type: 'invoke', screen: 'payments', action: 'payments.requestRefund', params: {} }],
    ['an undeclared param', { request_id: RID, type: 'invoke', screen: 'today', action: 'today.readQueue', params: { extra: 'x' } }],
  ])('400 for %s, and the service is never called', async (_name, body) => {
    const res = await request(app).post(INTENTS).set(as(OWNER)).send(body);
    expect(res.status).toBe(400);
    expect(mockHandle).not.toHaveBeenCalled();
  });

  it('403 without the section, 401 without a token', async () => {
    expect((await request(app).post(INTENTS).set(as(NO_SECTION)).send({ request_id: RID, type: 'navigate', screen: 'today' })).status).toBe(403);
    expect((await request(app).post(INTENTS).set(as(null)).send({ request_id: RID, type: 'navigate', screen: 'today' })).status).toBe(401);
  });

  it('a database failure is a 500 that says nothing was done, logged with its class', async () => {
    mockHandle.mockRejectedValue(Object.assign(new Error('connection reset'), { name: 'SequelizeConnectionError' }));
    const res = await request(app).post(INTENTS).set(as(OWNER)).send({ request_id: RID, type: 'navigate', screen: 'today' });
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Nothing was done/);
    expect(errSpy.mock.calls.map((c) => String(c[0])).join(' ')).toMatch(/admissions_ops_intent_failed.*SequelizeConnectionError/);
  });
});

describe('AO2.3 POST /approvals/:id/decide', () => {
  const PATH = `/api/admin/admissions-ops/approvals/${APPROVAL}/decide`;
  it('the agent is refused with 403', async () => {
    mockDecide.mockResolvedValue({ status: 'refused', reason: 'the_agent_cannot_decide' });
    const res = await request(app).post(PATH).set({ ...as(OWNER), 'X-Ops-Actor': 'agent' }).send({ decision: 'approve' });
    expect(res.status).toBe(403);
    expect(res.body.reason).toBe('the_agent_cannot_decide');
    expect(mockDecide.mock.calls[0][2]).toMatchObject({ actor: 'agent' });
  });
  it('a person decides; the result names the decider', async () => {
    mockDecide.mockResolvedValue({ status: 'decided', approval_id: APPROVAL, decision: 'approved', decided_by: 'owner@example.test', already: false });
    const res = await request(app).post(PATH).set(as(OWNER)).send({ decision: 'approve' });
    expect(res.status).toBe(200);
    expect(res.body.decided_by).toBe('owner@example.test');
  });
  it('400 for a bad id or decision, 404 for an unknown item', async () => {
    expect((await request(app).post('/api/admin/admissions-ops/approvals/not-a-uuid/decide').set(as(OWNER)).send({ decision: 'approve' })).status).toBe(400);
    expect((await request(app).post(PATH).set(as(OWNER)).send({ decision: 'send' })).status).toBe(400);
    mockDecide.mockResolvedValue({ status: 'not_found' });
    expect((await request(app).post(PATH).set(as(OWNER)).send({ decision: 'hold' })).status).toBe(404);
  });
});

describe('AO2.3 GET /approvals/count', () => {
  it('returns the open count; 403 without the section', async () => {
    mockCount.mockResolvedValue(0);
    expect((await request(app).get('/api/admin/admissions-ops/approvals/count').set(as(OWNER))).body).toEqual({ open: 0 });
    mockCount.mockResolvedValue(3);
    expect((await request(app).get('/api/admin/admissions-ops/approvals/count').set(as(OWNER))).body).toEqual({ open: 3 });
    expect((await request(app).get('/api/admin/admissions-ops/approvals/count').set(as(NO_SECTION))).status).toBe(403);
  });
});
