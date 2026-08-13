/**
 * authMiddleware — BC #10099862873 (P1, item 2): requireAdmin's JWT-verify
 * catch was previously `catch {}` — fully silent, zero observable signal on
 * an auth failure. This pins the new behavior: still 401s exactly as
 * before, but now also reports through logAuthFailure so failures are
 * queryable/alertable instead of invisible.
 */
const mockVerify = jest.fn();
jest.mock('jsonwebtoken', () => ({ verify: (...a: any[]) => mockVerify(...a) }));
jest.mock('../../config/env', () => ({ env: { jwtSecret: 'test-secret' } }));

const mockLogAuthFailure = jest.fn();
jest.mock('../authFailureLog', () => ({ logAuthFailure: (...a: any[]) => mockLogAuthFailure(...a) }));

import { requireAdmin } from '../authMiddleware';

function mockReqRes(authHeader?: string) {
  const req: any = { headers: { authorization: authHeader }, ip: '198.51.100.7' };
  const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();
  return { req, res, next };
}

describe('requireAdmin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('happy path: a valid admin token calls next() and attaches req.admin', () => {
    mockVerify.mockReturnValue({ sub: 'u1', email: 'a@x.com', role: 'admin' });
    const { req, res, next } = mockReqRes('Bearer good-token');

    requireAdmin(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.admin).toEqual({ sub: 'u1', email: 'a@x.com', role: 'admin' });
    expect(mockLogAuthFailure).not.toHaveBeenCalled();
  });

  it('boundary: a missing Authorization header 401s without calling jwt.verify', () => {
    const { req, res, next } = mockReqRes(undefined);

    requireAdmin(req, res, next);

    expect(mockVerify).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('failure path (regression): an invalid/expired token 401s AND now reports through logAuthFailure (previously silent)', () => {
    mockVerify.mockImplementation(() => { throw { name: 'TokenExpiredError', message: 'jwt expired' }; });
    const { req, res, next } = mockReqRes('Bearer expired-token');

    requireAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
    expect(mockLogAuthFailure).toHaveBeenCalledWith('admin_auth_failed', expect.objectContaining({ name: 'TokenExpiredError' }), 'admin', '198.51.100.7');
  });

  it('boundary: a valid token with an insufficient role 403s and does not call logAuthFailure', () => {
    mockVerify.mockReturnValue({ sub: 'u1', email: 'a@x.com', role: 'sales' });
    const { req, res, next } = mockReqRes('Bearer sales-token');

    requireAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
    expect(mockLogAuthFailure).not.toHaveBeenCalled();
  });
});
