/**
 * paymentReconciliationService — the scheduled backstop for the PaySimple
 * side-channel reconciliation gap (2026-07-30). Deliberately conservative:
 * only a prior customer_id link, or an exact email match on a fully
 * settled/posted payment, gets auto-applied. Everything else is flagged,
 * never written, mirroring how the ambiguous/not-yet-settled cases were
 * actually handled by hand the night this was built.
 */

jest.spyOn(console, 'error').mockImplementation(() => undefined);
jest.spyOn(console, 'warn').mockImplementation(() => undefined);

const mockListRecentPayments = jest.fn();
const mockGetCustomerById = jest.fn();
jest.mock('../../services/paysimpleService', () => ({
  listRecentPayments: (...a: any[]) => mockListRecentPayments(...a),
  getCustomerById: (...a: any[]) => mockGetCustomerById(...a),
}));

const mockEnrFindOne = jest.fn();
const mockEnrFindAll = jest.fn();
const mockEnrFindByPk = jest.fn();
const mockCohortIncrement = jest.fn();
jest.mock('../../models', () => ({
  __esModule: true,
  Enrollment: {
    findOne: (...a: any[]) => mockEnrFindOne(...a),
    findAll: (...a: any[]) => mockEnrFindAll(...a),
    findByPk: (...a: any[]) => mockEnrFindByPk(...a),
  },
  Cohort: {
    increment: (...a: any[]) => mockCohortIncrement(...a),
  },
}));

import { findMatchingEnrollment, reconcilePayment, runPaymentReconciliationSweep } from '../../services/paymentReconciliationService';

function payment(overrides: Partial<any> = {}) {
  return {
    Id: 999, CustomerId: 111, Amount: 199, Status: 'Settled',
    PaymentDate: '2026-07-27T22:24:12Z', ...overrides,
  };
}
function customer(overrides: Partial<any> = {}) {
  return { Id: 111, FirstName: 'Test', LastName: 'Student', Email: 'test@example.com', ...overrides };
}
function enrollment(overrides: Partial<any> = {}) {
  return {
    id: 'enr-1', full_name: 'Test Student', email: 'test@example.com',
    enrollment_type: 'standard', payment_status: 'pending', cohort_id: 'cohort-1',
    update: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/**
 * `Enrollment.findOne` serves two different questions inside
 * findMatchingEnrollment: "has this exact payment id already been recorded
 * anywhere?" (checked first) and "is a customer_id already linked?" (checked
 * second). A single `mockResolvedValue` can't distinguish them, so tests
 * route on the `where` clause instead. Defaults to "payment not used yet,
 * no customer_id link" -- the common case -- overridable per test.
 */
function setupFindOne({ alreadyUsedBy = null as any, byCustomerId = null as any } = {}) {
  mockEnrFindOne.mockImplementation(({ where }: any) => {
    if (where.paysimple_payment_id) return Promise.resolve(alreadyUsedBy);
    if (where.paysimple_customer_id) return Promise.resolve(byCustomerId);
    return Promise.resolve(null);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCohortIncrement.mockResolvedValue(undefined);
  setupFindOne();
});

describe('findMatchingEnrollment', () => {
  it('matches by an already-linked paysimple_customer_id first', async () => {
    const enr = enrollment();
    setupFindOne({ byCustomerId: enr });

    const result = await findMatchingEnrollment(customer(), 111, 999);

    expect(result).toEqual({ kind: 'match', enrollment: enr, matchType: 'customer_id' });
    expect(mockEnrFindAll).not.toHaveBeenCalled();
  });

  it('falls back to an exact email match when no customer_id link exists', async () => {
    const enr = enrollment();
    mockEnrFindAll.mockResolvedValue([enr]);

    const result = await findMatchingEnrollment(customer(), 111, 999);

    expect(result).toEqual({ kind: 'match', enrollment: enr, matchType: 'email' });
  });

  it('prefers a non-explorer candidate when the email matches more than one open enrollment', async () => {
    const explorerDup = enrollment({ id: 'explorer-dup', enrollment_type: 'explorer' });
    const real = enrollment({ id: 'real', enrollment_type: 'standard' });
    mockEnrFindAll.mockResolvedValue([explorerDup, real]);

    const result = await findMatchingEnrollment(customer(), 111, 999);

    expect(result).toEqual({ kind: 'match', enrollment: real, matchType: 'email' });
  });

  it('reports ambiguous when email matches more than one open standard enrollment', async () => {
    const a = enrollment({ id: 'a' });
    const b = enrollment({ id: 'b' });
    mockEnrFindAll.mockResolvedValue([a, b]);

    const result = await findMatchingEnrollment(customer(), 111, 999);

    expect(result.kind).toBe('ambiguous');
  });

  it('reports none when nothing matches', async () => {
    mockEnrFindAll.mockResolvedValue([]);

    const result = await findMatchingEnrollment(customer(), 111, 999);

    expect(result).toEqual({ kind: 'none' });
  });

  it('reports none for a customer with no email and no customer_id link', async () => {
    const result = await findMatchingEnrollment(customer({ Email: '' }), 111, 999);

    expect(result).toEqual({ kind: 'none' });
    expect(mockEnrFindAll).not.toHaveBeenCalled();
  });

  it('reports none when this exact payment id is already recorded on ANY enrollment, even a different one than an email match would find', async () => {
    // Regression: a student's real seat gets paid under their main email;
    // their still-unpaid Explorer duplicate happens to share that email. A
    // later run must not treat the duplicate as a fresh, legitimate match
    // for the same payment.
    const alreadyReconciledElsewhere = enrollment({ id: 'the-real-paid-row', payment_status: 'paid' });
    setupFindOne({ alreadyUsedBy: alreadyReconciledElsewhere });

    const result = await findMatchingEnrollment(customer(), 111, 999);

    expect(result).toEqual({ kind: 'none' });
    expect(mockEnrFindAll).not.toHaveBeenCalled();
  });
});

describe('reconcilePayment (idempotency)', () => {
  it('marks the enrollment paid and increments seats once', async () => {
    const enr = enrollment();
    mockEnrFindByPk.mockResolvedValue(enr);

    const applied = await reconcilePayment('enr-1', payment(), 111);

    expect(applied).toBe(true);
    expect(enr.update).toHaveBeenCalledWith(expect.objectContaining({
      payment_status: 'paid', portal_enabled: true, amount_paid: 199, paysimple_payment_id: '999', paysimple_customer_id: '111',
    }));
    expect(mockCohortIncrement).toHaveBeenCalledTimes(1);
  });

  it('is a no-op on a second run against an already-paid enrollment (no double increment)', async () => {
    const enr = enrollment({ payment_status: 'paid' });
    mockEnrFindByPk.mockResolvedValue(enr);

    const applied = await reconcilePayment('enr-1', payment(), 111);

    expect(applied).toBe(false);
    expect(enr.update).not.toHaveBeenCalled();
    expect(mockCohortIncrement).not.toHaveBeenCalled();
  });

  it('is a no-op when the enrollment no longer exists', async () => {
    mockEnrFindByPk.mockResolvedValue(null);

    const applied = await reconcilePayment('gone', payment(), 111);

    expect(applied).toBe(false);
    expect(mockCohortIncrement).not.toHaveBeenCalled();
  });
});

describe('runPaymentReconciliationSweep', () => {
  it('auto-reconciles a high-confidence settled email match', async () => {
    mockListRecentPayments.mockResolvedValue([payment()]);
    mockGetCustomerById.mockResolvedValue(customer());
    const enr = enrollment();
    mockEnrFindAll.mockResolvedValue([enr]);
    mockEnrFindByPk.mockResolvedValue(enr);

    const result = await runPaymentReconciliationSweep();

    expect(result.autoReconciled).toHaveLength(1);
    expect(result.autoReconciled[0].matchType).toBe('email');
    expect(result.flagged).toHaveLength(0);
  });

  it('flags rather than applies an Authorized (not yet settled) payment with no prior customer_id link', async () => {
    mockListRecentPayments.mockResolvedValue([payment({ Status: 'Authorized' })]);
    mockGetCustomerById.mockResolvedValue(customer());
    mockEnrFindAll.mockResolvedValue([enrollment()]);

    const result = await runPaymentReconciliationSweep();

    expect(result.autoReconciled).toHaveLength(0);
    expect(result.flagged).toHaveLength(1);
    expect(result.flagged[0].status).toBe('Authorized');
    expect(mockCohortIncrement).not.toHaveBeenCalled();
  });

  it('auto-reconciles an Authorized payment when the customer_id was already linked (higher trust)', async () => {
    mockListRecentPayments.mockResolvedValue([payment({ Status: 'Authorized' })]);
    mockGetCustomerById.mockResolvedValue(customer());
    const enr = enrollment();
    setupFindOne({ byCustomerId: enr });
    mockEnrFindByPk.mockResolvedValue(enr);

    const result = await runPaymentReconciliationSweep();

    expect(result.autoReconciled).toHaveLength(1);
    expect(result.autoReconciled[0].matchType).toBe('customer_id');
  });

  it('flags ambiguous email matches without writing anything', async () => {
    mockListRecentPayments.mockResolvedValue([payment()]);
    mockGetCustomerById.mockResolvedValue(customer());
    mockEnrFindAll.mockResolvedValue([enrollment({ id: 'a' }), enrollment({ id: 'b' })]);

    const result = await runPaymentReconciliationSweep();

    expect(result.autoReconciled).toHaveLength(0);
    expect(result.flagged).toHaveLength(1);
    expect(mockCohortIncrement).not.toHaveBeenCalled();
  });

  it('skips a payment with no matching enrollment at all, without erroring', async () => {
    mockListRecentPayments.mockResolvedValue([payment()]);
    mockGetCustomerById.mockResolvedValue(customer());
    mockEnrFindAll.mockResolvedValue([]);

    const result = await runPaymentReconciliationSweep();

    expect(result.autoReconciled).toHaveLength(0);
    expect(result.flagged).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('skips a payment already reconciled onto a different enrollment than an email match would find (no duplicate seat)', async () => {
    mockListRecentPayments.mockResolvedValue([payment()]);
    mockGetCustomerById.mockResolvedValue(customer());
    setupFindOne({ alreadyUsedBy: enrollment({ id: 'the-real-row', payment_status: 'paid' }) });
    // Would otherwise "find" this still-unpaid duplicate via the email lookup.
    mockEnrFindAll.mockResolvedValue([enrollment({ id: 'stray-duplicate' })]);

    const result = await runPaymentReconciliationSweep();

    expect(result.autoReconciled).toHaveLength(0);
    expect(result.flagged).toHaveLength(0);
    expect(mockCohortIncrement).not.toHaveBeenCalled();
    expect(mockEnrFindAll).not.toHaveBeenCalled();
  });

  it('ignores Failed/Voided payments entirely', async () => {
    mockListRecentPayments.mockResolvedValue([payment({ Status: 'Failed' }), payment({ Id: 2, Status: 'Voided' })]);

    const result = await runPaymentReconciliationSweep();

    expect(result.scanned).toBe(0);
    expect(mockGetCustomerById).not.toHaveBeenCalled();
  });

  it('never treats a sub-$199 payment (e.g. the $50 Open House seat-hold deposit) as a completed payment', async () => {
    mockListRecentPayments.mockResolvedValue([payment({ Amount: 50 }), payment({ Id: 2, Amount: 149 })]);

    const result = await runPaymentReconciliationSweep();

    expect(result.scanned).toBe(0);
    expect(result.autoReconciled).toHaveLength(0);
    expect(result.flagged).toHaveLength(0);
    expect(mockGetCustomerById).not.toHaveBeenCalled();
  });

  it('does not crash and reports an error when PaySimple itself is unreachable', async () => {
    mockListRecentPayments.mockRejectedValue(new Error('PaySimple API error 503: upstream unavailable'));

    const result = await runPaymentReconciliationSweep();

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toMatch(/upstream unavailable/);
    expect(result.autoReconciled).toHaveLength(0);
  });

  it('records a per-payment error and continues processing the rest of the batch', async () => {
    mockListRecentPayments.mockResolvedValue([payment({ Id: 1 }), payment({ Id: 2, CustomerId: 222 })]);
    mockGetCustomerById
      .mockRejectedValueOnce(new Error('customer lookup failed'))
      .mockResolvedValueOnce(customer());
    const enr = enrollment();
    mockEnrFindAll.mockResolvedValue([enr]);
    mockEnrFindByPk.mockResolvedValue(enr);

    const result = await runPaymentReconciliationSweep();

    expect(result.errors).toHaveLength(1);
    expect(result.autoReconciled).toHaveLength(1);
  });

  it('dry run reports what it would do without writing anything', async () => {
    mockListRecentPayments.mockResolvedValue([payment()]);
    mockGetCustomerById.mockResolvedValue(customer());
    const enr = enrollment();
    mockEnrFindAll.mockResolvedValue([enr]);

    const result = await runPaymentReconciliationSweep({ dryRun: true });

    expect(result.autoReconciled).toHaveLength(1);
    expect(enr.update).not.toHaveBeenCalled();
    expect(mockCohortIncrement).not.toHaveBeenCalled();
  });
});
