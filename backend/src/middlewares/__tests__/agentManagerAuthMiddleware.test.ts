/**
 * requireAgentManagerOrAdmin — the AI Workforce Management manager-authorization
 * gate (Checkpoint B). Pins the 4-way distinction the mission requires: a direct
 * manager passes, a platform superadmin passes, an admin with no linked org
 * member is blocked, and an admin whose org member exists but doesn't manage
 * this agent is blocked. Identity is resolved server-side from the JWT's email —
 * never from a client-supplied param — so these tests also guard against
 * regressing into the exact gap found in the existing (unrelated)
 * orgChartTaskAssignmentService.ts precedent, which trusts a client-supplied id.
 */
const mockVerify = jest.fn();
jest.mock('jsonwebtoken', () => ({ verify: (...a: any[]) => mockVerify(...a) }));
jest.mock('../../config/env', () => ({ env: { jwtSecret: 'test-secret' } }));

const mockLogAuthFailure = jest.fn();
jest.mock('../authFailureLog', () => ({ logAuthFailure: (...a: any[]) => mockLogAuthFailure(...a) }));

const mockOrgMemberFindOne = jest.fn();
jest.mock('../../models/OrgMember', () => ({
  __esModule: true,
  default: { findOne: (...a: any[]) => mockOrgMemberFindOne(...a) },
}));

const mockIsAgentInHumanDownstream = jest.fn();
jest.mock('../../services/workforce/orgChartHierarchyService', () => ({
  isAgentInHumanDownstream: (...a: any[]) => mockIsAgentInHumanDownstream(...a),
}));

import { requireAgentManagerOrAdmin } from '../agentManagerAuthMiddleware';

function mockReqRes(authHeader: string | undefined, params: Record<string, string> = { id: 'agent-1' }) {
  const req: any = { headers: { authorization: authHeader }, params, ip: '198.51.100.7' };
  const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();
  return { req, res, next };
}

describe('requireAgentManagerOrAdmin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('happy path: a direct manager (their org member is upstream of this agent) calls next() and tags req.agentManagerOrgMemberId', async () => {
    mockVerify.mockReturnValue({ sub: 'u1', email: 'manager@x.com', role: 'admin' });
    mockOrgMemberFindOne.mockResolvedValue({ id: 'org-member-1' });
    mockIsAgentInHumanDownstream.mockResolvedValue(true);
    const { req, res, next } = mockReqRes('Bearer good-token');

    const middleware = requireAgentManagerOrAdmin();
    await middleware(req, res, next);
    await flushMicrotasks();

    expect(mockOrgMemberFindOne).toHaveBeenCalledWith({ where: { email: 'manager@x.com' } });
    expect(mockIsAgentInHumanDownstream).toHaveBeenCalledWith('org-member-1', 'agent-1');
    expect(req.agentManagerOrgMemberId).toBe('org-member-1');
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('happy path: a platform superadmin bypasses the chain walk entirely', async () => {
    mockVerify.mockReturnValue({ sub: 'u1', email: 'ali@colaberry.com', role: 'super_admin' });
    const { req, res, next } = mockReqRes('Bearer good-token');

    const middleware = requireAgentManagerOrAdmin();
    await middleware(req, res, next);
    await flushMicrotasks();

    expect(mockOrgMemberFindOne).not.toHaveBeenCalled();
    expect(mockIsAgentInHumanDownstream).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('BREAK: an admin with no linked org member record is blocked (403), not silently let through', async () => {
    mockVerify.mockReturnValue({ sub: 'u1', email: 'unrelated-admin@x.com', role: 'admin' });
    mockOrgMemberFindOne.mockResolvedValue(null);
    const { req, res, next } = mockReqRes('Bearer good-token');

    const middleware = requireAgentManagerOrAdmin();
    await middleware(req, res, next);
    await flushMicrotasks();

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
    expect(mockIsAgentInHumanDownstream).not.toHaveBeenCalled();
  });

  it('BREAK: an admin whose org member exists but does not manage THIS agent is blocked (cross-manager leak guard)', async () => {
    mockVerify.mockReturnValue({ sub: 'u1', email: 'other-manager@x.com', role: 'admin' });
    mockOrgMemberFindOne.mockResolvedValue({ id: 'org-member-2' });
    mockIsAgentInHumanDownstream.mockResolvedValue(false);
    const { req, res, next } = mockReqRes('Bearer good-token');

    const middleware = requireAgentManagerOrAdmin();
    await middleware(req, res, next);
    await flushMicrotasks();

    expect(mockIsAgentInHumanDownstream).toHaveBeenCalledWith('org-member-2', 'agent-1');
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('boundary: missing agent id route param 400s before any DB lookup', async () => {
    mockVerify.mockReturnValue({ sub: 'u1', email: 'manager@x.com', role: 'admin' });
    const { req, res, next } = mockReqRes('Bearer good-token', {});

    const middleware = requireAgentManagerOrAdmin();
    await middleware(req, res, next);
    await flushMicrotasks();

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockOrgMemberFindOne).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('failure path (regression, matches requireAdmin behavior): a missing/invalid token 401s and never reaches the chain-walk logic', async () => {
    const { req, res, next } = mockReqRes(undefined);

    const middleware = requireAgentManagerOrAdmin();
    await middleware(req, res, next);
    await flushMicrotasks();

    expect(mockVerify).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
    expect(mockOrgMemberFindOne).not.toHaveBeenCalled();
  });

  it('BREAK: a non-admin role (e.g. sales) still gets requireAdmin\'s existing 403, unchanged', async () => {
    mockVerify.mockReturnValue({ sub: 'u1', email: 'rep@x.com', role: 'sales' });
    const { req, res, next } = mockReqRes('Bearer good-token');

    const middleware = requireAgentManagerOrAdmin();
    await middleware(req, res, next);
    await flushMicrotasks();

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
    expect(mockOrgMemberFindOne).not.toHaveBeenCalled();
  });

  it('BREAK: a DB failure during resolution fails closed (500), logs through logAuthFailure, and never calls next()', async () => {
    mockVerify.mockReturnValue({ sub: 'u1', email: 'manager@x.com', role: 'admin' });
    mockOrgMemberFindOne.mockRejectedValue(new Error('connection reset'));
    const { req, res, next } = mockReqRes('Bearer good-token');

    const middleware = requireAgentManagerOrAdmin();
    await middleware(req, res, next);
    await flushMicrotasks();

    expect(res.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
    expect(mockLogAuthFailure).toHaveBeenCalledWith('agent_manager_auth_failed', expect.any(Error), 'admin', '198.51.100.7', req);
  });

  it('custom param name: honors a non-default route param (e.g. :agentId)', async () => {
    mockVerify.mockReturnValue({ sub: 'u1', email: 'manager@x.com', role: 'admin' });
    mockOrgMemberFindOne.mockResolvedValue({ id: 'org-member-1' });
    mockIsAgentInHumanDownstream.mockResolvedValue(true);
    const { req, res, next } = mockReqRes('Bearer good-token', { agentId: 'agent-7' });

    const middleware = requireAgentManagerOrAdmin('agentId');
    await middleware(req, res, next);
    await flushMicrotasks();

    expect(mockIsAgentInHumanDownstream).toHaveBeenCalledWith('org-member-1', 'agent-7');
    expect(next).toHaveBeenCalledTimes(1);
  });
});

/** Lets the middleware's internal async resolveAndCheck() settle before assertions. */
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
