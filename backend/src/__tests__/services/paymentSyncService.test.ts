/**
 * paymentSyncService pure-helper tests — the deterministic reconciliation logic:
 * status classification, defensive payment normalization (from a getPayment
 * result), and the "latest recorded payment governs" target-state decision
 * (settled -> paid, failed/reversed -> failed, pending -> no change). The DB +
 * getPayment paths (syncPaySimplePayments) are integration-tier.
 */
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../config/env', () => ({ env: { paysimpleApiUser: 'u', paysimpleApiKey: 'k', paysimpleEnv: 'live' } }));
jest.mock('../../services/paysimpleService', () => ({ getPayment: jest.fn() }));

import {
  isCollected, isFailed, normalizeStatus, normalizePayment, decideTargetState, NormalizedPayment,
} from '../../services/paymentSyncService';

const pmt = (o: Partial<NormalizedPayment>): NormalizedPayment => ({
  paysimplePaymentId: '1', amount: 149, status: 'settled', paymentDate: null, ...o,
});

describe('status classification', () => {
  it('collected statuses = money received', () => {
    ['Settled', 'authorized', 'Posted'].forEach((s) => expect(isCollected(s)).toBe(true));
  });
  it('failed/reversed statuses reverse revenue', () => {
    ['Failed', 'Returned', 'Voided', 'Chargeback', 'Refunded', 'Declined'].forEach((s) => expect(isFailed(s)).toBe(true));
  });
  it('pending is neither', () => {
    expect(isCollected('pending')).toBe(false);
    expect(isFailed('pending')).toBe(false);
  });
  it('normalizeStatus lowercases/trims; null -> unknown', () => {
    expect(normalizeStatus('  Settled ')).toBe('settled');
    expect(normalizeStatus(null)).toBe('unknown');
  });
});

describe('normalizePayment (from a getPayment result)', () => {
  it('maps canonical PaySimple payment fields', () => {
    const p = normalizePayment({ Id: 9, Amount: 1788, Status: 'Settled', PaymentDate: '2026-07-16' } as any);
    expect(p).toMatchObject({ paysimplePaymentId: '9', amount: 1788, status: 'settled' });
    expect(p!.paymentDate).toBeInstanceOf(Date);
  });
  it('returns null without an id; coerces bad amount to 0', () => {
    expect(normalizePayment({ Amount: 5, Status: 'Settled' } as any)).toBeNull();
    expect(normalizePayment({ Id: 1, Amount: 'oops', Status: 'Settled' } as any)!.amount).toBe(0);
  });
  it('falls back to ActualSettledDate when PaymentDate absent', () => {
    const p = normalizePayment({ Id: 2, Amount: 1, Status: 'Settled', ActualSettledDate: '2026-07-15' } as any);
    expect(p!.paymentDate).toBeInstanceOf(Date);
  });
});

describe('decideTargetState (latest recorded payment governs)', () => {
  it('settled -> paid with amount + payment id', () => {
    expect(decideTargetState(pmt({ status: 'settled', amount: 1788, paysimplePaymentId: 'P9' })))
      .toMatchObject({ payment_status: 'paid', amount_paid: 1788, paysimple_payment_id: 'P9' });
  });
  it('returned/chargeback -> failed (reversal)', () => {
    expect(decideTargetState(pmt({ status: 'returned' }))).toMatchObject({ payment_status: 'failed' });
    expect(decideTargetState(pmt({ status: 'chargeback' }))).toMatchObject({ payment_status: 'failed' });
  });
  it('pending/unknown -> no change (null)', () => {
    expect(decideTargetState(pmt({ status: 'pending' }))).toBeNull();
    expect(decideTargetState(pmt({ status: 'authorizing' }))).toBeNull();
  });
});
