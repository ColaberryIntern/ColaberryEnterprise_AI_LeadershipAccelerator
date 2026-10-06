/**
 * requireGovProjectAccess — the gov delivery-project guard. The security property is composition ORDER:
 * resolve actor (by email) -> tenant guard FIRST (audited, 404 cross-tenant) -> delivery permission SECOND
 * (404 non-member, 403 member-missing-permission). Fail closed to 404 on any resolution/unexpected failure;
 * a repeated :projectId param is refused. All dependencies are mocked (no DB in CI).
 */
jest.mock('../../modules/identity/platformIdentityService', () => ({ normalizeEmail: (e: any) => String(e || '').trim().toLowerCase() }));
const piFindOne = jest.fn();
jest.mock('../../models/PlatformIdentity', () => ({ __esModule: true, default: { findOne: (...a: any[]) => piFindOne(...a) } }));
const buildDeliveryContext = jest.fn();
const requireDeliveryPermission = jest.fn();
jest.mock('../../modules/delivery/deliveryAuthorization', () => ({
  buildDeliveryContext: (...a: any[]) => buildDeliveryContext(...a),
  requireDeliveryPermission: (...a: any[]) => requireDeliveryPermission(...a),
}));
const buildRequestContext = jest.fn();
jest.mock('../../modules/tenancy/tenantAuthorization', () => ({ buildRequestContext: (...a: any[]) => buildRequestContext(...a) }));
const requireTenantAccessAudited = jest.fn();
jest.mock('../../modules/tenancy/tenantAccessGuards', () => ({ requireTenantAccessAudited: (...a: any[]) => requireTenantAccessAudited(...a) }));
jest.mock('../authFailureLog', () => ({ logAuthFailure: jest.fn() }));

import { requireGovProjectAccess } from '../govProjectAccess';

function mockRes(): any {
  const r: any = { statusCode: 0, body: null };
  r.status = jest.fn((c: number) => { r.statusCode = c; return r; });
  r.json = jest.fn((b: any) => { r.body = b; return r; });
  return r;
}
const run = async (req: any) => {
  const res = mockRes(); const next = jest.fn();
  await requireGovProjectAccess('story.read')(req, res, next);
  return { res, next };
};
const okReq = (over: any = {}) => ({ params: { projectId: 'proj-A' }, admin: { email: 'op@colaberry.com' }, ip: '1.1.1.1', ...over });

beforeEach(() => {
  jest.clearAllMocks();
  piFindOne.mockResolvedValue({ id: 'pid-1' });
  buildDeliveryContext.mockResolvedValue({ platformIdentityId: 'pid-1', deliveryProjectId: 'proj-A', projectTenantId: 'ten-1', roles: ['associate_builder'], isClientOnly: false });
  buildRequestContext.mockResolvedValue({ platformIdentityId: 'pid-1' });
  requireTenantAccessAudited.mockResolvedValue(undefined); // tenant allowed
  requireDeliveryPermission.mockReturnValue(undefined);     // permission held
});

describe('requireGovProjectAccess', () => {
  it('allows a member who holds the permission: calls next() and attaches the delivery context', async () => {
    const req = okReq();
    const { res, next } = await run(req);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(req.deliveryContext).toMatchObject({ deliveryProjectId: 'proj-A', roles: ['associate_builder'] });
  });

  it('refuses a repeated/missing :projectId param with 400, before any auth work', async () => {
    const { res, next } = await run(okReq({ params: { projectId: ['a', 'b'] } }));
    expect(res.statusCode).toBe(400);
    expect(next).not.toHaveBeenCalled();
    expect(piFindOne).not.toHaveBeenCalled();
  });

  it('401 when no identity can be resolved from the token email', async () => {
    piFindOne.mockResolvedValue(null);
    const { res, next } = await run(okReq());
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('404 for a NON-MEMBER (enumeration defense — never 403)', async () => {
    requireDeliveryPermission.mockImplementation(() => { throw { status: 404, reason: 'not_a_project_member' }; });
    const { res, next } = await run(okReq());
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
    expect(next).not.toHaveBeenCalled();
  });

  it('403 for a MEMBER who lacks the permission', async () => {
    requireDeliveryPermission.mockImplementation(() => { throw { status: 403, reason: 'missing_permission' }; });
    const { res, next } = await run(okReq());
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('TENANT FIRST: a cross-tenant caller is 404 and the delivery permission is NEVER consulted', async () => {
    requireTenantAccessAudited.mockRejectedValue({ status: 404, reason: 'cross_tenant_denied' });
    const { res, next } = await run(okReq());
    expect(res.statusCode).toBe(404);
    expect(requireDeliveryPermission).not.toHaveBeenCalled(); // ordering is the security property
    expect(next).not.toHaveBeenCalled();
  });

  it('fails CLOSED to 404 when identity resolution throws', async () => {
    piFindOne.mockRejectedValue(new Error('db down'));
    const { res, next } = await run(okReq());
    expect(res.statusCode).toBe(404);
    expect(next).not.toHaveBeenCalled();
  });

  it('resolves a STUDENT actor from req.participant.email the same way', async () => {
    const req = okReq({ admin: undefined, participant: { email: 'Student@Colaberry.com' } });
    await run(req);
    expect(piFindOne).toHaveBeenCalledWith({ where: { primary_email: 'student@colaberry.com' } }); // normalized
  });
});
