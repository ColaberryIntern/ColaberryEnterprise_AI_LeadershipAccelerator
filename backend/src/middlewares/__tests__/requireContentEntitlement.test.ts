// Mock every I/O dependency so the middleware runs with no DB. `env` is mocked as
// a mutable object so each test can flip the flag before invoking the middleware.
// Unlike requireBuildEntitlement (which does its own enrollment/cohort lookup),
// this middleware delegates the actual resolution to
// contentEntitlement.resolveContentPageAccess — so that's what's mocked here,
// not Enrollment/Cohort/staffAccess directly.
jest.mock('../../config/env', () => ({ env: { contentPageGateEnabled: false } }));
jest.mock('../../services/access/contentEntitlement', () => ({ resolveContentPageAccess: jest.fn() }));

import { requireContentEntitlement } from '../requireContentEntitlement';
import { env } from '../../config/env';
import { resolveContentPageAccess } from '../../services/access/contentEntitlement';

const resolveAccess = resolveContentPageAccess as jest.Mock;

// `participant: null` explicitly simulates "no resolved participant" — a default
// parameter would NOT fire here since callers pass null, not undefined (passing
// undefined explicitly DOES trigger a default parameter in JS, which would
// silently defeat that test case).
function mockCtx(participant: any = { sub: 'e1', role: 'participant' }) {
  const req: any = { method: 'GET', headers: {}, participant: participant ?? undefined };
  const res: any = {
    statusCode: 0,
    body: null as any,
    status(c: number) { this.statusCode = c; return this; },
    json(b: any) { this.body = b; return this; },
  };
  const next = jest.fn();
  return { req, res, next };
}

describe('requireContentEntitlement (middleware factory)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (env as any).contentPageGateEnabled = false;
  });

  it('flag OFF → always next(), never resolves entitlement', async () => {
    const { req, res, next } = mockCtx();
    await requireContentEntitlement('classroom')(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(0);
    expect(resolveAccess).not.toHaveBeenCalled();
  });

  it('flag ON + hasFullAccess → next(), no 402', async () => {
    (env as any).contentPageGateEnabled = true;
    resolveAccess.mockResolvedValue({ isStaff: false, hasFullAccess: true });
    const { req, res, next } = mockCtx();
    await requireContentEntitlement('classroom')(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(0);
  });

  it('flag ON + isStaff (even without hasFullAccess) → next(), no 402', async () => {
    (env as any).contentPageGateEnabled = true;
    resolveAccess.mockResolvedValue({ isStaff: true, hasFullAccess: false });
    const { req, res, next } = mockCtx();
    await requireContentEntitlement('projects')(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(0);
  });

  it('flag ON + NOT entitled → 402 with the feature-tagged upgrade payload, no next()', async () => {
    (env as any).contentPageGateEnabled = true;
    resolveAccess.mockResolvedValue({ isStaff: false, hasFullAccess: false });
    const { req, res, next } = mockCtx();
    await requireContentEntitlement('classroom')(req, res, next);
    expect(res.statusCode).toBe(402);
    expect(res.body).toEqual({
      error: 'content_requires_paid',
      message: expect.any(String),
      upgrade: { reason: 'content_gated', cta: 'unlock_content', feature: 'classroom' },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('402 payload tags the feature the caller specified (projects)', async () => {
    (env as any).contentPageGateEnabled = true;
    resolveAccess.mockResolvedValue({ isStaff: false, hasFullAccess: false });
    const { req, res, next } = mockCtx();
    await requireContentEntitlement('projects')(req, res, next);
    expect(res.body.upgrade.feature).toBe('projects');
    expect(next).not.toHaveBeenCalled();
  });

  it('flag ON + resolver throws → fail OPEN (next) and logs a stable error_class', async () => {
    (env as any).contentPageGateEnabled = true;
    resolveAccess.mockRejectedValue(new Error('db down'));
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { req, res, next } = mockCtx();
    await requireContentEntitlement('classroom')(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);   // never blocked a possibly-paying user
    expect(res.statusCode).toBe(0);          // no 402
    const logged = String(errSpy.mock.calls[0]?.[0] ?? '');
    expect(logged).toContain('EntitlementLookupError');
    expect(logged).toContain('fail_open');
    errSpy.mockRestore();
  });

  it('flag ON but no resolved participant → fail OPEN (next), never resolves', async () => {
    (env as any).contentPageGateEnabled = true;
    const { req, res, next } = mockCtx(null);
    await requireContentEntitlement('classroom')(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(resolveAccess).not.toHaveBeenCalled();
  });
});
