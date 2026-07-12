/**
 * enrollmentService.markEnrollmentPaid unit tests
 *
 * Covers the PaySimple payment-confirmation path that the webhook controller
 * tests mock out entirely. This is the single most important new write in the
 * PaySimple feature: it persists the DB-unique idempotency key
 * (paysimple_payment_id) and increments seat counts. These tests exercise the
 * real branch logic against mocked models — no DB I/O.
 *
 * Cases: happy path (persists + increments), idempotent already-paid early
 * return (no re-write, no double-increment), and external_id-not-found (null).
 */

// Mock the model layer so no DB I/O occurs. Campaign.findOne -> null makes the
// fire-and-forget exitPaymentCampaign() a clean early return inside the service.
jest.mock('../../models', () => ({
  Enrollment: { findOne: jest.fn() },
  Cohort: { increment: jest.fn().mockResolvedValue([1]) },
  Lead: { findOne: jest.fn().mockResolvedValue(null) },
  Campaign: { findOne: jest.fn().mockResolvedValue(null) },
}));

import { markEnrollmentPaid } from '../../services/enrollmentService';
import { Cohort, Enrollment } from '../../models';

const findOneMock = Enrollment.findOne as jest.Mock;
const incrementMock = Cohort.increment as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('markEnrollmentPaid', () => {
  it('happy path: persists payment details, flips to paid, and increments seats', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const enrollment: any = {
      paysimple_external_id: 'CB-1-1700000000',
      payment_status: 'pending',
      cohort_id: 'cohort-123',
      email: 'Buyer@Example.com',
      save,
    };
    findOneMock.mockResolvedValue(enrollment);

    const result = await markEnrollmentPaid('CB-1-1700000000', {
      paymentId: 987654,
      amount: 2500,
    });

    expect(result).toBe(enrollment);
    expect(enrollment.payment_status).toBe('paid');
    // idempotency key is stored as a string
    expect(enrollment.paysimple_payment_id).toBe('987654');
    expect(enrollment.amount_paid).toBe(2500);
    expect(enrollment.enrolled_at).toBeInstanceOf(Date);
    expect(save).toHaveBeenCalledTimes(1);
    expect(incrementMock).toHaveBeenCalledWith('seats_taken', {
      by: 1,
      where: { id: 'cohort-123' },
    });
  });

  it('is idempotent: an already-paid enrollment returns early without re-writing or double-incrementing seats', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const enrollment: any = {
      paysimple_external_id: 'CB-2-1700000000',
      payment_status: 'paid',
      paysimple_payment_id: '111',
      cohort_id: 'cohort-123',
      email: 'paid@example.com',
      save,
    };
    findOneMock.mockResolvedValue(enrollment);

    const result = await markEnrollmentPaid('CB-2-1700000000', {
      paymentId: 222,
      amount: 9999,
    });

    expect(result).toBe(enrollment);
    // unchanged — the second webhook delivery must not overwrite the original payment
    expect(enrollment.paysimple_payment_id).toBe('111');
    expect(save).not.toHaveBeenCalled();
    expect(incrementMock).not.toHaveBeenCalled();
  });

  it('returns null when the external_id matches no enrollment, and does not touch seats', async () => {
    findOneMock.mockResolvedValue(null);

    const result = await markEnrollmentPaid('CB-missing-0', {
      paymentId: 1,
      amount: 100,
    });

    expect(result).toBeNull();
    expect(incrementMock).not.toHaveBeenCalled();
  });
});
