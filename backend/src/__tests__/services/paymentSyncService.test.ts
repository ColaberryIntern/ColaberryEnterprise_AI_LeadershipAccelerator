/**
 * paymentSyncService pure-helper tests — the deterministic reconciliation logic:
 * status classification, defensive payment normalization, enrollment matching
 * priority, and the "latest payment governs" target-state decision (settled ->
 * paid, failed/reversed -> failed, pending -> no change). Network + DB paths
 * (listPayments / syncPaySimplePayments) are integration-tier.
 */
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../models', () => ({ Enrollment: { findAll: jest.fn() } }));
jest.mock('../../config/env', () => ({ env: { paysimpleApiUser: 'u', paysimpleApiKey: 'k', paysimpleEnv: 'live' } }));
jest.mock('../../services/paysimpleService', () => ({ listPayments: jest.fn(), getCustomerById: jest.fn() }));

import {
  isCollected, isFailed, normalizeStatus, normalizePayment, resolveEnrollmentId,
  decideTargetState, EnrollmentIndex, NormalizedPayment,
} from '../../services/paymentSyncService';

const idx = (over?: Partial<EnrollmentIndex>): EnrollmentIndex => ({
  byExternalId: new Map(), byCustomerId: new Map(), byEmail: new Map(), byId: new Map(), ...over,
});
const pmt = (o: Partial<NormalizedPayment>): NormalizedPayment => ({
  paysimplePaymentId: '1', customerId: null, externalId: null, email: null,
  amount: 149, status: 'settled', paymentDate: null, ...o,
});

describe('status classification', () => {
  it('collected statuses = money received', () => {
    ['Settled', 'authorized', 'Posted'].forEach((s) => expect(isCollected(s)).toBe(true));
  });
  it('failed/reversed statuses reverse revenue', () => {
    ['Failed', 'Returned', 'Voided', 'Chargeback', 'Refunded', 'Declined'].forEach((s) => expect(isFailed(s)).toBe(true));
  });
  it('pending is neither collected nor failed', () => {
    expect(isCollected('pending')).toBe(false);
    expect(isFailed('pending')).toBe(false);
  });
  it('normalizeStatus lowercases/trims; null -> unknown', () => {
    expect(normalizeStatus('  Settled ')).toBe('settled');
    expect(normalizeStatus(null)).toBe('unknown');
  });
});

describe('normalizePayment', () => {
  it('maps canonical fields', () => {
    const p = normalizePayment({ Id: 9, CustomerId: 4, Email: 'A@B.com', Amount: 149, Status: 'Settled', PaymentDate: '2026-07-16' } as any);
    expect(p).toMatchObject({ paysimplePaymentId: '9', customerId: '4', email: 'A@B.com', amount: 149, status: 'settled' });
    expect(p!.paymentDate).toBeInstanceOf(Date);
  });
  it('honors snake_case fallbacks + returns null without an id', () => {
    expect(normalizePayment({ payment_id: 'x', amount: 5, payment_status: 'returned' } as any)).toMatchObject({ paysimplePaymentId: 'x', status: 'returned' });
    expect(normalizePayment({ Amount: 5 } as any)).toBeNull();
  });
  it('coerces bad amount to 0', () => {
    expect(normalizePayment({ Id: 1, Amount: 'oops', Status: 'Settled' } as any)!.amount).toBe(0);
  });
});

describe('resolveEnrollmentId priority external > customer > email', () => {
  it('prefers external id', () => {
    const i = idx({ byExternalId: new Map([['CB-1', 'e-ext']]), byCustomerId: new Map([['4', 'e-cust']]), byEmail: new Map([['a@b.com', 'e-mail']]) });
    expect(resolveEnrollmentId(pmt({ externalId: 'CB-1', customerId: '4', email: 'a@b.com' }), i)).toBe('e-ext');
  });
  it('falls back to customer id then email (case-insensitive)', () => {
    expect(resolveEnrollmentId(pmt({ customerId: '4' }), idx({ byCustomerId: new Map([['4', 'e-cust']]) }))).toBe('e-cust');
    expect(resolveEnrollmentId(pmt({ email: 'A@B.com' }), idx({ byEmail: new Map([['a@b.com', 'e-mail']]) }))).toBe('e-mail');
  });
  it('null when nothing matches', () => {
    expect(resolveEnrollmentId(pmt({ email: 'no@one.com' }), idx())).toBeNull();
  });
});

describe('decideTargetState (latest payment governs)', () => {
  it('settled -> paid with amount', () => {
    expect(decideTargetState(pmt({ status: 'settled', amount: 1788 }))).toMatchObject({ payment_status: 'paid', amount_paid: 1788 });
  });
  it('returned/failed -> failed (reversal)', () => {
    expect(decideTargetState(pmt({ status: 'returned' }))).toMatchObject({ payment_status: 'failed' });
    expect(decideTargetState(pmt({ status: 'chargeback' }))).toMatchObject({ payment_status: 'failed' });
  });
  it('pending/unknown -> no change (null)', () => {
    expect(decideTargetState(pmt({ status: 'pending' }))).toBeNull();
    expect(decideTargetState(pmt({ status: 'authorizing' }))).toBeNull();
  });
});
