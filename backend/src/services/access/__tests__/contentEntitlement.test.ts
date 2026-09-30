// Mock every I/O dependency so the resolver runs with no DB. `env` is a mutable
// object so each test can flip the paywall flag before invoking isFreePreviewTier.
jest.mock('../../../config/env', () => ({ env: { contentPaidGateEnabled: false, contentPageGateEnabled: false } }));
jest.mock('../../../models', () => ({
  Enrollment: { findByPk: jest.fn() },
  Cohort: { findByPk: jest.fn() },
}));
jest.mock('../staffAccess', () => ({ isStaffEnrollment: jest.fn() }));
jest.mock('../../subscriptionService', () => ({ activeCompEnrollmentIds: jest.fn() }));

import { hasFullCurriculumAccess, isFreePreviewTier, resolveContentPageAccess } from '../contentEntitlement';
import { env } from '../../../config/env';
import { Enrollment, Cohort } from '../../../models';
import { isStaffEnrollment } from '../staffAccess';
import { activeCompEnrollmentIds } from '../../subscriptionService';

const findEnrollment = Enrollment.findByPk as jest.Mock;
const findCohort = Cohort.findByPk as jest.Mock;
const staffOf = isStaffEnrollment as jest.Mock;
const compIdsOf = activeCompEnrollmentIds as jest.Mock;

describe('hasFullCurriculumAccess (pure paywall rule)', () => {
  it('paid enrollment → true', () => {
    expect(hasFullCurriculumAccess({ payment_status: 'paid' }, null, {})).toBe(true);
  });

  it('unpaid guest / explorer → false', () => {
    expect(hasFullCurriculumAccess({ payment_status: 'pending' }, null, {})).toBe(false);
    expect(hasFullCurriculumAccess({ payment_status: 'failed' }, { cohort_type: 'explorer' }, {})).toBe(false);
  });

  it('admin-comped (Free Access) → true even when unpaid', () => {
    expect(hasFullCurriculumAccess({ payment_status: 'pending' }, null, { hasActiveComp: true })).toBe(true);
  });

  it('staff → true even when unpaid', () => {
    expect(hasFullCurriculumAccess({ payment_status: 'pending' }, null, { isStaff: true })).toBe(true);
  });

  it('business/owner workspace cohort → true even when unpaid', () => {
    expect(hasFullCurriculumAccess({ payment_status: 'pending' }, { cohort_type: 'business' }, {})).toBe(true);
    // case-insensitive on cohort_type
    expect(hasFullCurriculumAccess({ payment_status: 'pending' }, { cohort_type: 'Business' }, {})).toBe(true);
  });

  // THE key difference vs isBuildEntitled: accelerator-cohort membership alone is
  // NOT full curriculum access. An enrolled-but-unpaid member (July 2026, billing
  // pending) stays on the free preview until they pay. That is the paywall.
  it('accelerator cohort + billing pending → false (must still pay)', () => {
    expect(hasFullCurriculumAccess({ payment_status: 'pending' }, { cohort_type: 'accelerator' }, {})).toBe(false);
  });

  it('no enrollment resolved → false', () => {
    expect(hasFullCurriculumAccess(null, { cohort_type: 'business' }, { isStaff: true })).toBe(false);
    expect(hasFullCurriculumAccess(undefined, null, {})).toBe(false);
  });
});

describe('isFreePreviewTier (async resolver)', () => {
  const OLD_ENV = process.env.EXPLORER_WEEK0_ONLY;
  beforeEach(() => {
    jest.clearAllMocks();
    (env as any).contentPaidGateEnabled = false;
    delete process.env.EXPLORER_WEEK0_ONLY; // default: explorer gate ON
  });
  afterAll(() => {
    if (OLD_ENV === undefined) delete process.env.EXPLORER_WEEK0_ONLY;
    else process.env.EXPLORER_WEEK0_ONLY = OLD_ENV;
  });

  // ── Flag OFF: legacy explorer-only behavior, byte-for-byte ──────────────────
  it('flag OFF + explorer → gated (true), never checks payment/cohort', async () => {
    findEnrollment.mockResolvedValue({ id: 'e1', payment_status: 'pending', enrollment_type: 'explorer', cohort_id: null });
    expect(await isFreePreviewTier('e1')).toBe(true);
    expect(findCohort).not.toHaveBeenCalled();
    expect(staffOf).not.toHaveBeenCalled();
  });

  it('flag OFF + standard (non-explorer) → NOT gated (false), even if unpaid', async () => {
    findEnrollment.mockResolvedValue({ id: 'e1', payment_status: 'pending', enrollment_type: 'standard', cohort_id: null });
    expect(await isFreePreviewTier('e1')).toBe(false);
  });

  it('flag OFF + EXPLORER_WEEK0_ONLY=false → explorer NOT gated (legacy lift)', async () => {
    process.env.EXPLORER_WEEK0_ONLY = 'false';
    findEnrollment.mockResolvedValue({ id: 'e1', payment_status: 'pending', enrollment_type: 'explorer', cohort_id: null });
    expect(await isFreePreviewTier('e1')).toBe(false);
  });

  // ── Flag ON: payment-keyed paywall ─────────────────────────────────────────
  it('flag ON + paid → NOT gated (false)', async () => {
    (env as any).contentPaidGateEnabled = true;
    findEnrollment.mockResolvedValue({ id: 'e1', payment_status: 'paid', enrollment_type: 'standard', cohort_id: null });
    findCohort.mockResolvedValue(null);
    staffOf.mockResolvedValue(false);
    compIdsOf.mockResolvedValue(new Set<string>());
    expect(await isFreePreviewTier('e1')).toBe(false);
  });

  it('flag ON + unpaid guest → GATED (true)', async () => {
    (env as any).contentPaidGateEnabled = true;
    findEnrollment.mockResolvedValue({ id: 'e1', payment_status: 'pending', enrollment_type: 'standard', cohort_id: null });
    findCohort.mockResolvedValue(null);
    staffOf.mockResolvedValue(false);
    compIdsOf.mockResolvedValue(new Set<string>());
    expect(await isFreePreviewTier('e1')).toBe(true);
  });

  it('flag ON + enrolled-but-unpaid member (accelerator cohort) → GATED (true)', async () => {
    (env as any).contentPaidGateEnabled = true;
    findEnrollment.mockResolvedValue({ id: 'e1', payment_status: 'pending', enrollment_type: 'standard', cohort_id: 'c-jul' });
    findCohort.mockResolvedValue({ id: 'c-jul', cohort_type: 'accelerator' });
    staffOf.mockResolvedValue(false);
    compIdsOf.mockResolvedValue(new Set<string>());
    expect(await isFreePreviewTier('e1')).toBe(true);
  });

  it('flag ON + comp → NOT gated (false)', async () => {
    (env as any).contentPaidGateEnabled = true;
    findEnrollment.mockResolvedValue({ id: 'e1', payment_status: 'pending', enrollment_type: 'standard', cohort_id: null });
    findCohort.mockResolvedValue(null);
    staffOf.mockResolvedValue(false);
    compIdsOf.mockResolvedValue(new Set<string>(['e1']));
    expect(await isFreePreviewTier('e1')).toBe(false);
  });

  it('flag ON + business workspace cohort → NOT gated (false)', async () => {
    (env as any).contentPaidGateEnabled = true;
    findEnrollment.mockResolvedValue({ id: 'e1', payment_status: 'pending', enrollment_type: 'standard', cohort_id: 'c-biz' });
    findCohort.mockResolvedValue({ id: 'c-biz', cohort_type: 'business' });
    staffOf.mockResolvedValue(false);
    compIdsOf.mockResolvedValue(new Set<string>());
    expect(await isFreePreviewTier('e1')).toBe(false);
  });

  it('missing enrollment → NOT gated (false)', async () => {
    (env as any).contentPaidGateEnabled = true;
    findEnrollment.mockResolvedValue(null);
    expect(await isFreePreviewTier('nope')).toBe(false);
  });

  it('infra/DB error → fail OPEN (false), never wrongly gates a paying member', async () => {
    (env as any).contentPaidGateEnabled = true;
    findEnrollment.mockRejectedValue(new Error('db down'));
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await isFreePreviewTier('e1')).toBe(false);
    warnSpy.mockRestore();
  });
});

describe('resolveContentPageAccess (page-level paywall resolver)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (env as any).contentPageGateEnabled = false;
  });

  it('flag OFF → { isStaff: false, hasFullAccess: true }, no I/O (dark-ship)', async () => {
    expect(await resolveContentPageAccess('e1')).toEqual({ isStaff: false, hasFullAccess: true });
    expect(findEnrollment).not.toHaveBeenCalled();
  });

  it('flag ON + paid → hasFullAccess true', async () => {
    (env as any).contentPageGateEnabled = true;
    findEnrollment.mockResolvedValue({ id: 'e1', payment_status: 'paid', cohort_id: null });
    findCohort.mockResolvedValue(null);
    staffOf.mockResolvedValue(false);
    compIdsOf.mockResolvedValue(new Set<string>());
    expect(await resolveContentPageAccess('e1')).toEqual({ isStaff: false, hasFullAccess: true });
  });

  it('flag ON + unpaid, non-staff → hasFullAccess false', async () => {
    (env as any).contentPageGateEnabled = true;
    findEnrollment.mockResolvedValue({ id: 'e1', payment_status: 'pending', cohort_id: null });
    findCohort.mockResolvedValue(null);
    staffOf.mockResolvedValue(false);
    compIdsOf.mockResolvedValue(new Set<string>());
    expect(await resolveContentPageAccess('e1')).toEqual({ isStaff: false, hasFullAccess: false });
  });

  it('flag ON + staff → isStaff true, hasFullAccess true even when unpaid', async () => {
    (env as any).contentPageGateEnabled = true;
    findEnrollment.mockResolvedValue({ id: 'e1', payment_status: 'pending', cohort_id: null });
    findCohort.mockResolvedValue(null);
    staffOf.mockResolvedValue(true);
    compIdsOf.mockResolvedValue(new Set<string>());
    expect(await resolveContentPageAccess('e1')).toEqual({ isStaff: true, hasFullAccess: true });
  });

  it('flag ON + missing enrollment → fail open (hasFullAccess true)', async () => {
    (env as any).contentPageGateEnabled = true;
    findEnrollment.mockResolvedValue(null);
    expect(await resolveContentPageAccess('nope')).toEqual({ isStaff: false, hasFullAccess: true });
  });

  it('flag ON + infra/DB error → fail OPEN (hasFullAccess true)', async () => {
    (env as any).contentPageGateEnabled = true;
    findEnrollment.mockRejectedValue(new Error('db down'));
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await resolveContentPageAccess('e1')).toEqual({ isStaff: false, hasFullAccess: true });
    warnSpy.mockRestore();
  });
});
