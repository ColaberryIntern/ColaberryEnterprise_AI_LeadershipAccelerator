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

// C125: a read-only viewer may mint the "Open on your phone" code, and nothing else.
describe('requireParticipant — the one write a read-only viewer may make', () => {
  beforeEach(() => jest.clearAllMocks());
  const at = (method: string, originalUrl: string, payload: any = RO) => {
    const ctx = mockCtx(method, payload);
    ctx.req.originalUrl = originalUrl;
    requireParticipant(ctx.req, ctx.res, ctx.next);
    return ctx;
  };

  it('POST /api/portal/handoff passes for a read-only token (query string and trailing slash too)', () => {
    for (const url of ['/api/portal/handoff', '/api/portal/handoff?x=1', '/api/portal/handoff/']) {
      const { res, next } = at('POST', url);
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.statusCode).toBe(0);
    }
  });

  it('every other write, look-alike path or method stays blocked', () => {
    const blocked: Array<[string, string]> = [
      ['POST', '/api/portal/posts'],
      ['POST', '/api/portal/handoff/exchange'],
      ['POST', '/api/portal/handoffx'],
      ['POST', '/api/portal/handoff/../posts'],
      ['PUT', '/api/portal/handoff'],
      ['DELETE', '/api/portal/handoff'],
      ['POST', '/API/PORTAL/HANDOFF'],
    ];
    for (const [m, url] of blocked) {
      const { res, next } = at(m, url);
      expect({ m, url, status: res.statusCode }).toEqual({ m, url, status: 403 });
      expect(next).not.toHaveBeenCalled();
    }
  });

  it('a normal token is unaffected by the allow-list', () => {
    const { next } = at('POST', '/api/portal/posts', NORMAL);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
