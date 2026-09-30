import { isAbandonedCheckout, matchesPaymentFilter, paymentBadgeFor, PAYMENT_FILTER_OPTIONS } from '../enrollmentPaymentFilter';

// The seven-person list of 2026-09-17, anonymised. Two of them (the ex-members)
// had cancelled paid memberships and must NOT come back as abandoned checkouts.
const started = { payment_status: 'pending', subscription: { plan: 'monthly', status: 'pending', created_at: '2026-09-16T14:00:00Z' } };
const annualStarted = { payment_status: 'pending', subscription: { plan: 'annual', status: 'pending', created_at: '2026-09-03T09:30:00Z' } };
const exMemberRenewalLeftOpen = { payment_status: 'paid', subscription: { plan: 'monthly', status: 'pending', created_at: '2026-08-28T00:00:00Z' } };
const explorerSignup = { payment_status: 'pending', subscription: null };
const explorerNoSubKey = { payment_status: 'pending' };
const paidActive = { payment_status: 'paid', subscription: { plan: 'monthly', status: 'active', created_at: '2026-08-04T00:00:00Z' } };
const invoice = { payment_status: 'pending_invoice', subscription: null };
const failed = { payment_status: 'failed', subscription: { plan: 'monthly', status: 'failed', created_at: '2026-07-24T00:00:00Z' } };

describe('isAbandonedCheckout', () => {
  it('is a never-paid enrollment whose latest subscription is a pending checkout', () => {
    expect(isAbandonedCheckout(started)).toBe(true);
    expect(isAbandonedCheckout(annualStarted)).toBe(true);
  });

  it('is NOT a former member whose renewal checkout was left open before they cancelled', () => {
    expect(isAbandonedCheckout(exMemberRenewalLeftOpen)).toBe(false);
  });

  it('is NOT a free signup, which never minted a subscription row', () => {
    expect(isAbandonedCheckout(explorerSignup)).toBe(false);
    expect(isAbandonedCheckout(explorerNoSubKey)).toBe(false);
  });

  it('is NOT paid, invoiced or failed', () => {
    expect(isAbandonedCheckout(paidActive)).toBe(false);
    expect(isAbandonedCheckout(invoice)).toBe(false);
    expect(isAbandonedCheckout(failed)).toBe(false);
  });
});

describe('matchesPaymentFilter', () => {
  const all = [started, annualStarted, exMemberRenewalLeftOpen, explorerSignup, explorerNoSubKey, paidActive, invoice, failed];

  it('all passes everything', () => {
    expect(all.filter((e) => matchesPaymentFilter(e, 'all'))).toHaveLength(all.length);
  });

  it('abandoned_checkout picks exactly the two started-never-paid checkouts', () => {
    expect(all.filter((e) => matchesPaymentFilter(e, 'abandoned_checkout'))).toEqual([started, annualStarted]);
  });

  it('not_paid is every pending enrollment, checkout or not', () => {
    expect(all.filter((e) => matchesPaymentFilter(e, 'not_paid'))).toEqual([started, annualStarted, explorerSignup, explorerNoSubKey]);
  });

  it('the three legacy values still match payment_status exactly', () => {
    expect(all.filter((e) => matchesPaymentFilter(e, 'paid'))).toEqual([exMemberRenewalLeftOpen, paidActive]);
    expect(all.filter((e) => matchesPaymentFilter(e, 'pending_invoice'))).toEqual([invoice]);
    expect(all.filter((e) => matchesPaymentFilter(e, 'failed'))).toEqual([failed]);
  });

  it('every dropdown option is a filter the matcher understands', () => {
    for (const o of PAYMENT_FILTER_OPTIONS) expect(() => matchesPaymentFilter(started, o.value)).not.toThrow();
    expect(PAYMENT_FILTER_OPTIONS.map((o) => o.value)).toContain('abandoned_checkout');
  });
});

describe('paymentBadgeFor', () => {
  it('names an abandoned checkout and says which plan and when it was started', () => {
    expect(paymentBadgeFor(started)).toEqual({ label: 'Abandoned checkout', tone: 'warning', detail: 'monthly checkout started Sep 16' });
    expect(paymentBadgeFor(annualStarted).detail).toBe('annual checkout started Sep 3');
  });

  it('survives a payload without created_at (older backend) by dropping the date only', () => {
    expect(paymentBadgeFor({ payment_status: 'pending', subscription: { plan: 'monthly', status: 'pending' } }).detail).toBe('monthly checkout');
  });

  it('shows a free signup as Not paid, not as a bare status word', () => {
    expect(paymentBadgeFor(explorerSignup)).toEqual({ label: 'Not paid', tone: 'neutral', detail: null });
  });

  it('keeps the three existing labels and tones, and treats a missing status as failed', () => {
    expect(paymentBadgeFor(paidActive)).toEqual({ label: 'Paid', tone: 'success', detail: null });
    expect(paymentBadgeFor(invoice)).toEqual({ label: 'Pending Invoice', tone: 'warning', detail: null });
    expect(paymentBadgeFor(failed)).toEqual({ label: 'Failed', tone: 'danger', detail: null });
    expect(paymentBadgeFor({})).toEqual({ label: 'Failed', tone: 'danger', detail: null });
  });

  it('an ex-member with an open renewal checkout still reads Paid', () => {
    expect(paymentBadgeFor(exMemberRenewalLeftOpen).label).toBe('Paid');
  });
});
