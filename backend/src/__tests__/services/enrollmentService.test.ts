/**
 * markEnrollmentPaid — confirmed self-serve payment must grant portal access.
 * Regression for the "paid but locked out" bug: requestMagicLink (participantService)
 * gates strictly on portal_enabled, not payment_status, so a webhook that only flips
 * payment_status leaves a paying student stuck on "pending admin approval" forever.
 */

jest.spyOn(console, 'error').mockImplementation(() => undefined);
jest.spyOn(console, 'log').mockImplementation(() => undefined);

jest.mock('../../models', () => ({
  __esModule: true,
  Enrollment: { findOne: jest.fn(), findAll: jest.fn() },
  Cohort: { increment: jest.fn() },
  Lead: { findOne: jest.fn() },
  Campaign: { findOne: jest.fn() },
}));

import { Enrollment, Cohort, Campaign } from '../../models';
import { markEnrollmentPaid } from '../../services/enrollmentService';

const enrFindOne = Enrollment.findOne as jest.Mock;
const enrFindAll = Enrollment.findAll as jest.Mock;
const cohortIncrement = Cohort.increment as jest.Mock;
const campaignFindOne = Campaign.findOne as jest.Mock;

function pendingEnrollment(over: any = {}) {
  return {
    id: 'enr-1',
    email: 'student@example.com',
    payment_status: 'pending',
    portal_enabled: false,
    cohort_id: 'cohort-1',
    save: jest.fn().mockResolvedValue(undefined),
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  cohortIncrement.mockResolvedValue(undefined);
  campaignFindOne.mockResolvedValue(null); // no readiness campaign configured -> exitPaymentCampaign no-ops
  enrFindAll.mockResolvedValue([]); // no stray Explorer rows -> retireRedundantExplorerAccounts no-ops
});

describe('markEnrollmentPaid', () => {
  it('grants portal access on confirmed payment, not just payment_status', async () => {
    const enrollment = pendingEnrollment();
    enrFindOne.mockResolvedValue(enrollment);

    const result = await markEnrollmentPaid('CB-123-456');

    expect(result?.payment_status).toBe('paid');
    expect(result?.portal_enabled).toBe(true);
    expect(enrollment.save).toHaveBeenCalledTimes(1);
    expect(cohortIncrement).toHaveBeenCalledWith(
      'seats_taken',
      expect.objectContaining({ by: 1, where: { id: 'cohort-1' } }),
    );
  });

  it('is idempotent — re-processing an already-paid enrollment does not double-increment seats', async () => {
    const enrollment = pendingEnrollment({ payment_status: 'paid', portal_enabled: true });
    enrFindOne.mockResolvedValue(enrollment);

    const result = await markEnrollmentPaid('CB-123-456');

    expect(result).toBe(enrollment);
    expect(enrollment.save).not.toHaveBeenCalled();
    expect(cohortIncrement).not.toHaveBeenCalled();
  });

  it('returns null when no enrollment matches the external id', async () => {
    enrFindOne.mockResolvedValue(null);

    const result = await markEnrollmentPaid('CB-UNKNOWN-999');

    expect(result).toBeNull();
    expect(cohortIncrement).not.toHaveBeenCalled();
  });
});
