/**
 * contentEntitlement — covers the pure hasFullCurriculumAccess predicate's new
 * access_starts_at override (postponed-cohort-move gate), plus the two live call
 * sites that consume it: isFreePreviewTier (Today feed, CONTENT_PAID_GATE_ENABLED)
 * and resolveContentPageAccess (Classroom/Projects, CONTENT_PAGE_GATE_ENABLED —
 * deliberately independent flags, see contentEntitlement.ts).
 */

const mockEnrollmentFindByPk = jest.fn();
const mockCohortFindByPk = jest.fn();
const mockIsStaffEnrollment = jest.fn();
const mockActiveCompEnrollmentIds = jest.fn();

jest.mock('../../../models', () => ({
  Enrollment: { findByPk: mockEnrollmentFindByPk },
  Cohort: { findByPk: mockCohortFindByPk },
}));
jest.mock('../../../services/access/staffAccess', () => ({
  isStaffEnrollment: mockIsStaffEnrollment,
}));
jest.mock('../../../services/subscriptionService', () => ({
  activeCompEnrollmentIds: mockActiveCompEnrollmentIds,
}));

const mockEnv = { contentPaidGateEnabled: false, contentPageGateEnabled: false };
jest.mock('../../../config/env', () => ({ env: mockEnv }));

import {
  hasFullCurriculumAccess,
  isFreePreviewTier,
  resolveContentPageAccess,
} from '../../../services/access/contentEntitlement';

describe('hasFullCurriculumAccess — pure predicate', () => {
  it('grants access to a paid enrollment with no access_starts_at set (regression — unchanged default behavior)', () => {
    expect(hasFullCurriculumAccess({ payment_status: 'paid', access_starts_at: null }, null)).toBe(true);
  });

  it('denies access to a paid enrollment whose access_starts_at is in the future', () => {
    const now = new Date('2026-08-01T00:00:00Z');
    const result = hasFullCurriculumAccess(
      { payment_status: 'paid', access_starts_at: '2026-11-12' },
      null,
      null,
      now
    );
    expect(result).toBe(false);
  });

  it('grants access once access_starts_at has passed (gate lifted)', () => {
    const now = new Date('2026-11-12T15:00:00Z');
    const result = hasFullCurriculumAccess(
      { payment_status: 'paid', access_starts_at: '2026-11-12' },
      null,
      null,
      now
    );
    expect(result).toBe(true);
  });

  it('grants access exactly ON the start date, not just strictly after', () => {
    const now = new Date('2026-11-12T00:00:01Z');
    const result = hasFullCurriculumAccess(
      { payment_status: 'paid', access_starts_at: '2026-11-12' },
      null,
      null,
      now
    );
    expect(result).toBe(true);
  });

  it('a future access_starts_at overrides staff/comp/business too, not just paid', () => {
    const now = new Date('2026-08-01T00:00:00Z');
    expect(
      hasFullCurriculumAccess(
        { payment_status: 'pending', access_starts_at: '2026-11-12' },
        { cohort_type: 'business' },
        { isStaff: true, hasActiveComp: true },
        now
      )
    ).toBe(false);
  });

  it('unpaid/explorer enrollment with no access_starts_at is unaffected (existing free-tier behavior unchanged)', () => {
    expect(hasFullCurriculumAccess({ payment_status: 'pending', access_starts_at: null }, null)).toBe(false);
  });
});

describe('isFreePreviewTier — Today feed gate (CONTENT_PAID_GATE_ENABLED)', () => {
  beforeEach(() => {
    mockEnrollmentFindByPk.mockReset();
    mockCohortFindByPk.mockReset();
    mockIsStaffEnrollment.mockReset().mockResolvedValue(false);
    mockActiveCompEnrollmentIds.mockReset().mockResolvedValue(new Set());
    mockEnv.contentPaidGateEnabled = true;
    mockEnv.contentPageGateEnabled = false;
  });

  it('gates a paid enrollment with a future access_starts_at to the free preview tier', async () => {
    mockEnrollmentFindByPk.mockResolvedValue({
      id: 'e1',
      payment_status: 'paid',
      enrollment_type: 'standard',
      cohort_id: 'c1',
      access_starts_at: '2099-01-01',
    });
    mockCohortFindByPk.mockResolvedValue({ id: 'c1', cohort_type: 'accelerator' });

    const gated = await isFreePreviewTier('e1');
    expect(gated).toBe(true);
  });

  it('does not gate a paid enrollment once access_starts_at has passed', async () => {
    mockEnrollmentFindByPk.mockResolvedValue({
      id: 'e1',
      payment_status: 'paid',
      enrollment_type: 'standard',
      cohort_id: 'c1',
      access_starts_at: '2020-01-01',
    });
    mockCohortFindByPk.mockResolvedValue({ id: 'c1', cohort_type: 'accelerator' });

    const gated = await isFreePreviewTier('e1');
    expect(gated).toBe(false);
  });

  it('still preserves legacy explorer-only gating when the flag is off, regardless of access_starts_at', async () => {
    mockEnv.contentPaidGateEnabled = false;
    mockEnrollmentFindByPk.mockResolvedValue({
      id: 'e2',
      payment_status: 'paid',
      enrollment_type: 'explorer',
      access_starts_at: '2020-01-01',
    });

    const gated = await isFreePreviewTier('e2');
    expect(gated).toBe(true); // legacy path: explorer => gated, independent of access_starts_at
    expect(mockCohortFindByPk).not.toHaveBeenCalled(); // legacy branch short-circuits before any full-access lookup
  });
});

describe('resolveContentPageAccess — Classroom/Projects gate (CONTENT_PAGE_GATE_ENABLED, independent flag)', () => {
  beforeEach(() => {
    mockEnrollmentFindByPk.mockReset();
    mockCohortFindByPk.mockReset();
    mockIsStaffEnrollment.mockReset().mockResolvedValue(false);
    mockActiveCompEnrollmentIds.mockReset().mockResolvedValue(new Set());
    mockEnv.contentPaidGateEnabled = true;
    mockEnv.contentPageGateEnabled = false;
  });

  it('KNOWN/DISCLOSED LIMITATION: short-circuits to full access when its own flag is off, even with a future access_starts_at — this run does not flip CONTENT_PAGE_GATE_ENABLED (platform-wide, out of scope)', async () => {
    mockEnrollmentFindByPk.mockResolvedValue({
      id: 'e1',
      payment_status: 'paid',
      cohort_id: 'c1',
      access_starts_at: '2099-01-01',
    });

    const result = await resolveContentPageAccess('e1');
    expect(result.hasFullAccess).toBe(true);
    // The flag-off branch returns before ever querying the DB — confirms the
    // short-circuit, not just its output.
    expect(mockEnrollmentFindByPk).not.toHaveBeenCalled();
  });

  it('once the flag IS on, inherits the same access_starts_at gate as isFreePreviewTier (shared predicate)', async () => {
    mockEnv.contentPageGateEnabled = true;
    mockEnrollmentFindByPk.mockResolvedValue({
      id: 'e1',
      payment_status: 'paid',
      cohort_id: 'c1',
      access_starts_at: '2099-01-01',
    });
    mockCohortFindByPk.mockResolvedValue({ id: 'c1', cohort_type: 'accelerator' });

    const result = await resolveContentPageAccess('e1');
    expect(result.hasFullAccess).toBe(false);
  });
});
