/**
 * requireAgentManagerOrDomainBuilder — the read path for the person assigned to build an agent.
 *
 * The sibling file `agentManagerAuthMiddleware.test.ts` pins the manager gate's four-way
 * distinction and is deliberately left alone: this change must not move any of it. What is
 * tested here is the fifth case the manager gate does not have, and the two refusals that keep
 * it from becoming a write.
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

const mockIsBuilder = jest.fn();
jest.mock('../../services/agentDomain/domainBuilderAgentAccess', () => ({
  isVerifiedDomainBuilderOfAgent: (...a: any[]) => mockIsBuilder(...a),
}));

import {
  requireAgentManagerOrAdmin,
  requireAgentManagerOrDomainBuilder,
} from '../agentManagerAuthMiddleware';

const CHAIN_REFUSAL = 'This agent is not in your reporting chain.';
const NO_ORG_MEMBER_REFUSAL = 'No linked org member record for this admin — cannot resolve a management relationship to this agent.';

function mockReqRes(method = 'GET', params: Record<string, string> = { id: 'agent-1' }) {
  const req: any = {
    method,
    headers: { authorization: 'Bearer good-token' },
    params,
    ip: '198.51.100.7',
  };
  const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();
  return { req, res, next };
}

const flush = () => new Promise((r) => setImmediate(r));

/** The real situation: a builder, with an org_members row, managing nothing. */
function aBuilderWhoManagesNothing() {
  mockVerify.mockReturnValue({ sub: 'u1', email: 'mihretnetsereab@gmail.com', role: 'admin' });
  mockOrgMemberFindOne.mockResolvedValue({ id: 'org-member-mihret' });
  mockIsAgentInHumanDownstream.mockResolvedValue(false);
  mockIsBuilder.mockResolvedValue(true);
}

beforeEach(() => { jest.clearAllMocks(); });

describe('the builder read path', () => {
  it('a verified builder GETs their own agent and is tagged as a BUILDER, not a manager', async () => {
    aBuilderWhoManagesNothing();
    const { req, res, next } = mockReqRes('GET');

    await requireAgentManagerOrDomainBuilder()(req, res, next);
    await flush();

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    // The two identities stay distinguishable, so a handler cannot mistake one for the other.
    expect(req.agentDomainBuilderEmail).toBe('mihretnetsereab@gmail.com');
    expect(req.agentManagerOrgMemberId).toBeUndefined();
  });

  it('resolves the builder from the VERIFIED token email and the route param, never a body', async () => {
    aBuilderWhoManagesNothing();
    const { req, res, next } = mockReqRes('GET');
    req.body = { email: 'someone-else@x.com', agentId: 'another-agent' };

    await requireAgentManagerOrDomainBuilder()(req, res, next);
    await flush();

    expect(mockIsBuilder).toHaveBeenCalledWith('mihretnetsereab@gmail.com', 'agent-1');
  });

  it('a builder with NO org_members row still passes — building does not require one', async () => {
    // intended_builder resolves through community_members, so the absence of an org_members row
    // is not evidence of anything. Before this change the lookup refused first and the builder
    // path never ran.
    mockVerify.mockReturnValue({ sub: 'u1', email: 'builder@x.com', role: 'admin' });
    mockOrgMemberFindOne.mockResolvedValue(null);
    mockIsBuilder.mockResolvedValue(true);
    const { req, res, next } = mockReqRes('GET');

    await requireAgentManagerOrDomainBuilder()(req, res, next);
    await flush();

    expect(next).toHaveBeenCalledTimes(1);
    expect(mockIsAgentInHumanDownstream).not.toHaveBeenCalled();
  });

  it('the manager path still wins first, and never consults the builder resolver', async () => {
    mockVerify.mockReturnValue({ sub: 'u1', email: 'manager@x.com', role: 'admin' });
    mockOrgMemberFindOne.mockResolvedValue({ id: 'org-member-1' });
    mockIsAgentInHumanDownstream.mockResolvedValue(true);
    const { req, res, next } = mockReqRes('GET');

    await requireAgentManagerOrDomainBuilder()(req, res, next);
    await flush();

    expect(req.agentManagerOrgMemberId).toBe('org-member-1');
    expect(mockIsBuilder).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('a super admin short-circuits before either lookup', async () => {
    mockVerify.mockReturnValue({ sub: 'u1', email: 'ali@colaberry.com', role: 'super_admin' });
    const { req, res, next } = mockReqRes('GET');

    await requireAgentManagerOrDomainBuilder()(req, res, next);
    await flush();

    expect(mockOrgMemberFindOne).not.toHaveBeenCalled();
    expect(mockIsBuilder).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('READ ONLY — the guard that keeps this from becoming a write', () => {
  /**
   * Every route carrying this gate today is a router.get, and the roster test asserts that. This
   * is the SECOND, independent guard: if someone puts this gate on a write tomorrow, the builder
   * path grants nothing. Approving memory proposals, flipping behaviour switches and revoking
   * directives stay the accountable manager's decisions.
   */
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    'refuses the builder on %s even though the exact same caller passes on GET',
    async (method) => {
      aBuilderWhoManagesNothing();
      const { req, res, next } = mockReqRes(method);

      await requireAgentManagerOrDomainBuilder()(req, res, next);
      await flush();

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: CHAIN_REFUSAL });
      // Not merely refused at the end: the builder question is never even asked on a write.
      expect(mockIsBuilder).not.toHaveBeenCalled();
    },
  );

  it('CONTROL for the above: the identical caller DOES pass on GET', async () => {
    aBuilderWhoManagesNothing();
    const { req, res, next } = mockReqRes('GET');

    await requireAgentManagerOrDomainBuilder()(req, res, next);
    await flush();

    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('what is still refused', () => {
  it('an admin who is neither manager nor builder gets the unchanged chain refusal', async () => {
    mockVerify.mockReturnValue({ sub: 'u1', email: 'stranger@x.com', role: 'admin' });
    mockOrgMemberFindOne.mockResolvedValue({ id: 'org-member-9' });
    mockIsAgentInHumanDownstream.mockResolvedValue(false);
    mockIsBuilder.mockResolvedValue(false);
    const { req, res, next } = mockReqRes('GET');

    await requireAgentManagerOrDomainBuilder()(req, res, next);
    await flush();

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: CHAIN_REFUSAL });
    expect(next).not.toHaveBeenCalled();
  });

  it('no org member AND not a builder gets the original no-org-member refusal, word for word', async () => {
    // The message order is preserved deliberately: a manager who hits this sees exactly what they
    // saw before the builder path existed.
    mockVerify.mockReturnValue({ sub: 'u1', email: 'nobody@x.com', role: 'admin' });
    mockOrgMemberFindOne.mockResolvedValue(null);
    mockIsBuilder.mockResolvedValue(false);
    const { req, res, next } = mockReqRes('GET');

    await requireAgentManagerOrDomainBuilder()(req, res, next);
    await flush();

    expect(res.json).toHaveBeenCalledWith({ error: NO_ORG_MEMBER_REFUSAL });
  });

  it('a missing route param is a 400 before any identity work', async () => {
    mockVerify.mockReturnValue({ sub: 'u1', email: 'x@x.com', role: 'admin' });
    const { req, res, next } = mockReqRes('GET', {});

    await requireAgentManagerOrDomainBuilder()(req, res, next);
    await flush();

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockIsBuilder).not.toHaveBeenCalled();
  });

  /**
   * FAIL CLOSED, AND LOUD — and the reason this is a 403 rather than a 500.
   *
   * The builder lookup is a second database read bolted onto a path that had already decided to
   * refuse. Letting it reach the outer catch turned a clean 403 for an unrelated admin into a
   * 500, which is a NEW failure mode for people who are not builders and never were. The four
   * `agent*Controller` suites failed on exactly that and are what produced this contract:
   * a database problem may cost a builder their read access, but it must not change what anyone
   * else sees, and it must never pass anyone through.
   */
  it('a thrown builder lookup refuses as before and is LOGGED, never swallowed, never a pass', async () => {
    mockVerify.mockReturnValue({ sub: 'u1', email: 'builder@x.com', role: 'admin' });
    mockOrgMemberFindOne.mockResolvedValue({ id: 'om-1' });
    mockIsAgentInHumanDownstream.mockResolvedValue(false);
    mockIsBuilder.mockRejectedValue(new Error('database is on fire'));
    const { req, res, next } = mockReqRes('GET');

    await requireAgentManagerOrDomainBuilder()(req, res, next);
    await flush();

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: CHAIN_REFUSAL });
    expect(mockLogAuthFailure).toHaveBeenCalledWith(
      'agent_domain_builder_lookup_failed', expect.any(Error), 'admin', '198.51.100.7', req,
    );
  });

  it('a thrown MANAGER lookup is still a 500 — that one is not fail-closed, and must not become so', async () => {
    // The distinction matters: the manager walk failing means the gate cannot answer its primary
    // question, which is a server fault. The builder walk failing only means a secondary, additive
    // path is unavailable.
    mockVerify.mockReturnValue({ sub: 'u1', email: 'manager@x.com', role: 'admin' });
    mockOrgMemberFindOne.mockRejectedValue(new Error('database is on fire'));
    const { req, res, next } = mockReqRes('GET');

    await requireAgentManagerOrDomainBuilder()(req, res, next);
    await flush();

    expect(res.status).toHaveBeenCalledWith(500);
    expect(mockLogAuthFailure).toHaveBeenCalledWith(
      'agent_manager_auth_failed', expect.any(Error), 'admin', '198.51.100.7', req,
    );
  });
});

describe('the ORIGINAL gate is unchanged by all of this', () => {
  it('requireAgentManagerOrAdmin never consults the builder resolver, even on a GET', async () => {
    // The 28 routes still on the manager gate -- approve, reject, revoke, send, PATCH a
    // behaviour switch -- must behave exactly as before.
    aBuilderWhoManagesNothing();
    const { req, res, next } = mockReqRes('GET');

    await requireAgentManagerOrAdmin()(req, res, next);
    await flush();

    expect(mockIsBuilder).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: CHAIN_REFUSAL });
    expect(next).not.toHaveBeenCalled();
  });

  it('requireAgentManagerOrAdmin still refuses a caller with no org member, first', async () => {
    mockVerify.mockReturnValue({ sub: 'u1', email: 'nobody@x.com', role: 'admin' });
    mockOrgMemberFindOne.mockResolvedValue(null);
    mockIsBuilder.mockResolvedValue(true); // would pass if the builder path leaked into this gate
    const { req, res, next } = mockReqRes('GET');

    await requireAgentManagerOrAdmin()(req, res, next);
    await flush();

    expect(res.json).toHaveBeenCalledWith({ error: NO_ORG_MEMBER_REFUSAL });
    expect(mockIsBuilder).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});
