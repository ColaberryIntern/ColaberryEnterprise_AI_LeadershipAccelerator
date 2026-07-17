import { issueRefund, lookupPayment } from '../refundService';
import { Refund, Enrollment } from '../../models';
import { getPayment, getCustomerById, isVoidable, voidPayment, refundPayment } from '../paysimpleService';
import { voidCreditBySourceEvent } from '../accountCreditService';
import { env } from '../../config/env';

jest.mock('../../config/env', () => ({ env: { paysimpleApiUser: 'u', paysimpleApiKey: 'k' } }));
jest.mock('../../models', () => ({
  Refund: { findAll: jest.fn(), create: jest.fn() },
  Enrollment: { findOne: jest.fn() },
}));
jest.mock('../paysimpleService', () => ({
  getPayment: jest.fn(), getCustomerById: jest.fn(), isVoidable: jest.fn(),
  voidPayment: jest.fn(), refundPayment: jest.fn(),
}));
jest.mock('../accountCreditService', () => ({ voidCreditBySourceEvent: jest.fn() }));

const PAYMENT = { Id: 154860344, Status: 'Posted', Amount: 199, CustomerId: 7, CustomerFirstName: 'Shefat', CustomerLastName: 'Rahman', CanVoidUntil: null };

describe('refundService.issueRefund', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (env as any).paysimpleApiUser = 'u';
    (env as any).paysimpleApiKey = 'k';
    (getPayment as jest.Mock).mockResolvedValue(PAYMENT);
    (getCustomerById as jest.Mock).mockResolvedValue({ Email: 'shefatrahman03@gmail.com' });
    (isVoidable as jest.Mock).mockReturnValue(false); // past the void window → refund
    (Enrollment.findOne as jest.Mock).mockResolvedValue({ id: 'enr-1' });
    (Refund.findAll as jest.Mock).mockResolvedValue([]); // no prior refunds
    (Refund.create as jest.Mock).mockImplementation(async (attrs) => ({ ...attrs, id: 'r1', update: jest.fn() }));
    (refundPayment as jest.Mock).mockResolvedValue({ Id: 999 });
    (voidPayment as jest.Mock).mockResolvedValue({ Id: 888 });
    (voidCreditBySourceEvent as jest.Mock).mockResolvedValue({ voidedCents: 0, alreadyAppliedCents: 0 });
  });

  it('rejects when PaySimple creds are missing', async () => {
    (env as any).paysimpleApiKey = '';
    expect(await issueRefund({ paymentId: '1' })).toEqual({ ok: false, reason: 'billing_unconfigured' });
  });

  it('404s when the payment is not found', async () => {
    (getPayment as jest.Mock).mockRejectedValue(new Error('404'));
    expect(await issueRefund({ paymentId: '1' })).toMatchObject({ ok: false, reason: 'payment_not_found' });
  });

  it('rejects an already-reversed payment', async () => {
    (getPayment as jest.Mock).mockResolvedValue({ ...PAYMENT, Status: 'Refunded' });
    expect(await issueRefund({ paymentId: '1' })).toMatchObject({ ok: false, reason: 'already_reversed' });
  });

  it('full refund: records pending→succeeded, calls refundPayment with no amount, voids the credit', async () => {
    (voidCreditBySourceEvent as jest.Mock).mockResolvedValue({ voidedCents: 5000, alreadyAppliedCents: 0 });
    const r = await issueRefund({ paymentId: '154860344', reason: 'customer request', issuedBy: 'ali@colaberry.com' });
    expect(r.ok).toBe(true);
    // pending row written first with the resolved enrollment + email + method
    const created = (Refund.create as jest.Mock).mock.calls[0][0];
    expect(created).toMatchObject({ status: 'pending', method: 'refund', amount_cents: 19900, enrollment_id: 'enr-1', customer_email: 'shefatrahman03@gmail.com', issued_by: 'ali@colaberry.com' });
    // full refund → no Amount passed to PaySimple
    expect((refundPayment as jest.Mock).mock.calls[0][0]).toEqual({ paymentId: '154860344', amount: undefined });
    expect(voidPayment).not.toHaveBeenCalled();
    expect(voidCreditBySourceEvent).toHaveBeenCalledWith('ps-payment-154860344');
    // row flipped to succeeded with the refund id + voided credit
    expect(r.refund.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'succeeded', paysimple_refund_id: '999', voided_credit_cents: 5000 }));
  });

  it('partial refund: passes the dollar amount to PaySimple', async () => {
    const r = await issueRefund({ paymentId: '154860344', amountCents: 5000 });
    expect(r.ok).toBe(true);
    expect((refundPayment as jest.Mock).mock.calls[0][0]).toEqual({ paymentId: '154860344', amount: 50 });
  });

  it('voids (not refunds) when still inside the void window', async () => {
    (isVoidable as jest.Mock).mockReturnValue(true);
    const r = await issueRefund({ paymentId: '154860344' });
    expect(r.ok).toBe(true);
    expect(voidPayment).toHaveBeenCalledWith('154860344');
    expect(refundPayment).not.toHaveBeenCalled();
    expect((Refund.create as jest.Mock).mock.calls[0][0].method).toBe('void');
  });

  it('rejects an over-refund beyond the remaining balance', async () => {
    (Refund.findAll as jest.Mock).mockResolvedValue([{ amount_cents: 19900 }]); // already fully refunded
    const r = await issueRefund({ paymentId: '154860344', amountCents: 100 });
    expect(r).toMatchObject({ ok: false, reason: 'invalid_amount' });
    expect(refundPayment).not.toHaveBeenCalled();
  });

  it('records a failed row and returns the error when PaySimple refuses', async () => {
    (refundPayment as jest.Mock).mockRejectedValue(new Error('PaySimple API error 400: nope'));
    const r = await issueRefund({ paymentId: '154860344' });
    expect(r).toMatchObject({ ok: false, reason: 'paysimple_error' });
    // the pending row is flipped to failed with the error captured
    const createdRow = await (Refund.create as jest.Mock).mock.results[0].value;
    expect(createdRow.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
  });
});

describe('refundService.lookupPayment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (env as any).paysimpleApiUser = 'u';
    (env as any).paysimpleApiKey = 'k';
    (getPayment as jest.Mock).mockResolvedValue(PAYMENT);
    (getCustomerById as jest.Mock).mockResolvedValue({ Email: 'shefatrahman03@gmail.com' });
    (isVoidable as jest.Mock).mockReturnValue(false);
    (Refund.findAll as jest.Mock).mockResolvedValue([{ amount_cents: 5000 }]); // $50 already refunded
  });

  it('previews the payment with the remaining refundable balance', async () => {
    const r = await lookupPayment('154860344');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payment).toMatchObject({ id: '154860344', amount_cents: 19900, refundable_cents: 14900, method: 'refund', email: 'shefatrahman03@gmail.com', name: 'Shefat Rahman' });
    }
  });
});
