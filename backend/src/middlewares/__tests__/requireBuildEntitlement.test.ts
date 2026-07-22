// Mock every I/O dependency so the middleware runs with no DB. `env` is mocked as
// a mutable object so each test can flip the flag before invoking the middleware.
jest.mock('../../config/env', () => ({ env: { buildPaidGateEnabled: false } }));
jest.mock('../../models', () => ({
  Enrollment: { findByPk: jest.fn() },
  Cohort: { findByPk: jest.fn() },
}));
jest.mock('../../services/access/staffAccess', () => ({ isStaffEnrollment: jest.fn() }));
jest.mock('../../services/subscriptionService', () => ({ activeCompEnrollmentIds: jest.fn() }));

import { isBuildEntitled, requireBuildEntitlement } from '../requireBuildEntitlement';
import { env } from '../../config/env';
import { Enrollment, Cohort } from '../../models';
import { isStaffEnrollment } from '../../services/access/staffAccess';
import { activeCompEnrollmentIds } from '../../services/subscriptionService';

const findEnrollment = Enrollment.findByPk as jest.Mock;
const findCohort = Cohort.findByPk as jest.Mock;
const staffOf = isStaffEnrollment as jest.Mock;
const compIdsOf = activeCompEnrollmentIds as jest.Mock;

function mockCtx(participant: any = { sub: 'e1', role: 'participant' }) {
  const req: any = { method: 'POST', headers: {}, participant };
  const res: any = {
    statusCode: 0,
    body: null as any,
    status(c: number) { this.statusCode = c; return this; },
    json(b: any) { this.body = b; return this; },
  };
  const next = jest.fn();
  return { req, res, next };
}

// Sensible "not entitled" defaults; individual tests override what they exercise.
function primeNotEntitled() {
  findEnrollment.mockResolvedValue({ id: 'e1', payment_status: 'pending', cohort_id: null });
  findCohort.mockResolvedValue(null);
  staffOf.mockResolvedValue(false);
  compIdsOf.mockResolvedValue(new Set<string>());
}

describe('isBuildEntitled (pure rule)', () => {
  it('paid enrollment → true', () => {
    expect(isBuildEntitled({ payment_status: 'paid' }, null, {})).toBe(true);
  });

  it('free Explorer / unpaid → false', () => {
    expect(isBuildEntitled({ payment_status: 'pending' }, null, {})).toBe(false);
    expect(isBuildEntitled({ payment_status: 'failed' }, { cohort_type: 'explorer' }, {})).toBe(false);
  });

  it('admin-comped (Free Access) → true even when unpaid', () => {
    expect(isBuildEntitled({ payment_status: 'pending' }, null, { hasActiveComp: true })).toBe(true);
  });

  it('staff / privileged role → true even when unpaid', () => {
    expect(isBuildEntitled({ payment_status: 'pending' }, null, { isStaff: true })).toBe(true);
  });

  it('sponsor seat (cohort_type=sponsor) → true even when unpaid', () => {
    expect(isBuildEntitled({ payment_status: 'pending' }, { cohort_type: 'sponsor' }, {})).toBe(true);
    // case-insensitive on cohort_type
    expect(isBuildEntitled({ payment_status: 'pending' }, { cohort_type: 'Sponsor' }, {})).toBe(true);
  });

  it('no enrollment resolved → false', () => {
    expect(isBuildEntitled(null, null, { isStaff: true })).toBe(false);
    expect(isBuildEntitled(undefined, { cohort_type: 'sponsor' }, {})).toBe(false);
  });

  it('accelerator cohort (paid program) → true even when billing is pending', () => {
    expect(isBuildEntitled({ payment_status: 'pending' }, { cohort_type: 'accelerator' }, {})).toBe(true);
    // case-insensitive on cohort_type
    expect(isBuildEntitled({ payment_status: 'pending' }, { cohort_type: 'Accelerator' }, {})).toBe(true);
    // a genuine free Explorer cohort still does NOT entitle
    expect(isBuildEntitled({ payment_status: 'pending' }, { cohort_type: 'explorer' }, {})).toBe(false);
  });
});

describe('requireBuildEntitlement (middleware)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (env as any).buildPaidGateEnabled = false;
  });

  it('flag OFF → always next(), never touches the DB', async () => {
    const { req, res, next } = mockCtx();
    await requireBuildEntitlement(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(0);
    expect(findEnrollment).not.toHaveBeenCalled();
  });

  it('flag ON + entitled (paid) → next(), no 402', async () => {
    (env as any).buildPaidGateEnabled = true;
    findEnrollment.mockResolvedValue({ id: 'e1', payment_status: 'paid', cohort_id: null });
    findCohort.mockResolvedValue(null);
    staffOf.mockResolvedValue(false);
    compIdsOf.mockResolvedValue(new Set<string>());

    const { req, res, next } = mockCtx();
    await requireBuildEntitlement(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(0);
  });

  it('flag ON + entitled via comp → next()', async () => {
    (env as any).buildPaidGateEnabled = true;
    findEnrollment.mockResolvedValue({ id: 'e1', payment_status: 'pending', cohort_id: null });
    findCohort.mockResolvedValue(null);
    staffOf.mockResolvedValue(false);
    compIdsOf.mockResolvedValue(new Set<string>(['e1']));

    const { req, res, next } = mockCtx();
    await requireBuildEntitlement(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(0);
  });

  it('flag ON + entitled via staff → next()', async () => {
    (env as any).buildPaidGateEnabled = true;
    findEnrollment.mockResolvedValue({ id: 'e1', payment_status: 'pending', cohort_id: null });
    findCohort.mockResolvedValue(null);
    staffOf.mockResolvedValue(true);
    compIdsOf.mockResolvedValue(new Set<string>());

    const { req, res, next } = mockCtx();
    await requireBuildEntitlement(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(0);
  });

  it('flag ON + entitled via sponsor seat → next()', async () => {
    (env as any).buildPaidGateEnabled = true;
    findEnrollment.mockResolvedValue({ id: 'e1', payment_status: 'pending', cohort_id: 'c-sponsor' });
    findCohort.mockResolvedValue({ id: 'c-sponsor', cohort_type: 'sponsor' });
    staffOf.mockResolvedValue(false);
    compIdsOf.mockResolvedValue(new Set<string>());

    const { req, res, next } = mockCtx();
    await requireBuildEntitlement(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(0);
  });

  it('flag ON + entitled via accelerator cohort (billing pending) → next()', async () => {
    (env as any).buildPaidGateEnabled = true;
    findEnrollment.mockResolvedValue({ id: 'e1', payment_status: 'pending', cohort_id: 'c-acc' });
    findCohort.mockResolvedValue({ id: 'c-acc', cohort_type: 'accelerator' });
    staffOf.mockResolvedValue(false);
    compIdsOf.mockResolvedValue(new Set<string>());

    const { req, res, next } = mockCtx();
    await requireBuildEntitlement(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(0);
  });

  it('flag ON + NOT entitled (free Explorer) → 402 with upgrade payload, no next()', async () => {
    (env as any).buildPaidGateEnabled = true;
    primeNotEntitled();

    const { req, res, next } = mockCtx();
    await requireBuildEntitlement(req, res, next);

    expect(res.statusCode).toBe(402);
    expect(res.body).toEqual({
      error: 'build_requires_paid',
      message: expect.any(String),
      upgrade: { reason: 'build_gated', cta: 'join_to_build' },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('flag ON + infra/DB error → fail OPEN (next) and logs a stable error_class', async () => {
    (env as any).buildPaidGateEnabled = true;
    findEnrollment.mockRejectedValue(new Error('db down'));
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { req, res, next } = mockCtx();
    await requireBuildEntitlement(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);       // never blocked a possibly-paying user
    expect(res.statusCode).toBe(0);              // no 402
    const logged = String(errSpy.mock.calls[0]?.[0] ?? '');
    expect(logged).toContain('EntitlementLookupError');
    expect(logged).toContain('fail_open');
    errSpy.mockRestore();
  });

  it('flag ON + enrollment row missing → fail OPEN (next), no 402', async () => {
    (env as any).buildPaidGateEnabled = true;
    findEnrollment.mockResolvedValue(null);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const { req, res, next } = mockCtx();
    await requireBuildEntitlement(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(0);
    warnSpy.mockRestore();
  });

  it('flag ON but no resolved participant → fail OPEN (next), never queries', async () => {
    (env as any).buildPaidGateEnabled = true;
    const { req, res, next } = mockCtx(undefined);
    await requireBuildEntitlement(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(findEnrollment).not.toHaveBeenCalled();
  });
});
