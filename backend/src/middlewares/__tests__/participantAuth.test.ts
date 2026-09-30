jest.mock('jsonwebtoken', () => ({ verify: jest.fn() }));
jest.mock('../../config/env', () => ({ env: { jwtSecret: 'test-secret' } }));

import jwt from 'jsonwebtoken';
import { requireParticipant } from '../participantAuth';

const verify = jwt.verify as unknown as jest.Mock;

function mockCtx(method: string, payload: any, withAuth = true) {
  const req: any = { method, headers: withAuth ? { authorization: 'Bearer tok' } : {} };
  const res: any = {
    statusCode: 0,
    body: null as any,
    status(c: number) { this.statusCode = c; return this; },
    json(b: any) { this.body = b; return this; },
  };
  const next = jest.fn();
  verify.mockReturnValue(payload);
  return { req, res, next };
}

const RO = { sub: 'e1', email: 'a@b.com', cohort_id: 'c1', role: 'participant', read_only: true };
const NORMAL = { sub: 'e1', email: 'a@b.com', cohort_id: 'c1', role: 'participant' };

describe('requireParticipant — read-only "view as" enforcement', () => {
  beforeEach(() => jest.clearAllMocks());

  it('read-only token blocks POST with 403 and never calls next', () => {
    const { req, res, next } = mockCtx('POST', RO);
    requireParticipant(req, res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('read-only token blocks every mutating method (PUT/PATCH/DELETE)', () => {
    for (const m of ['PUT', 'PATCH', 'DELETE']) {
      const { req, res, next } = mockCtx(m, RO);
      requireParticipant(req, res, next);
      expect(res.statusCode).toBe(403);
      expect(next).not.toHaveBeenCalled();
    }
  });

  it('read-only token ALLOWS GET (viewing) and exposes read_only on req.participant', () => {
    const { req, res, next } = mockCtx('GET', RO);
    requireParticipant(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.participant.read_only).toBe(true);
    expect(res.statusCode).toBe(0); // never errored
  });

  it('a NORMAL participant token can still write (POST passes)', () => {
    const { req, res, next } = mockCtx('POST', NORMAL);
    requireParticipant(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(0);
  });

  it('missing Authorization header → 401', () => {
    const { req, res, next } = mockCtx('GET', NORMAL, false);
    requireParticipant(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('a non-participant role → 403', () => {
    const { req, res, next } = mockCtx('GET', { ...NORMAL, role: 'admin' });
    requireParticipant(req, res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });
});
