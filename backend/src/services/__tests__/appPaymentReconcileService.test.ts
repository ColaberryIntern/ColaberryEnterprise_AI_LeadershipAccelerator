import { selectLinkableMembershipPayments } from '../appPaymentReconcileService';

/**
 * The scope guard is the safety-critical part: a payment is linkable ONLY if its
 * customer id is one WE stored during checkout. This is what keeps direct/bootcamp
 * charges on the shared PaySimple gateway out of Accelerator revenue.
 */
describe('appPaymentReconcileService.selectLinkableMembershipPayments', () => {
  const ourCids = new Set(['43540425', '43540563']); // two of our checkout customers

  it('keeps a live membership payment under OUR customer id, grouped by cid', () => {
    const out = selectLinkableMembershipPayments(
      [{ Id: 1, Status: 'Settled', Amount: 199, CustomerId: 43540425, PaymentDate: '2026-07-17' }],
      ourCids
    );
    expect(out.get('43540425')).toEqual([{ amountCents: 19900, pid: '1', date: '2026-07-17' }]);
  });

  it('EXCLUDES a membership-amount payment under a customer id we did NOT store (direct/bootcamp charge)', () => {
    const out = selectLinkableMembershipPayments(
      [{ Id: 2, Status: 'Settled', Amount: 149, CustomerId: 99999999 }], // not ours
      ourCids
    );
    expect(out.size).toBe(0);
  });

  it('EXCLUDES the $50 deposit (below the membership floor) even under our customer', () => {
    const out = selectLinkableMembershipPayments(
      [{ Id: 3, Status: 'Settled', Amount: 50, CustomerId: 43540425 }],
      ourCids
    );
    expect(out.size).toBe(0);
  });

  it('EXCLUDES non-collected (failed / reversed / NSF) payments', () => {
    const out = selectLinkableMembershipPayments(
      [
        { Id: 4, Status: 'ReverseNSF', Amount: 149, CustomerId: 43540425 },
        { Id: 5, Status: 'Returned', Amount: 199, CustomerId: 43540563 },
        { Id: 6, Status: 'Failed', Amount: 1788, CustomerId: 43540425 },
      ],
      ourCids
    );
    expect(out.size).toBe(0);
  });

  it('collects multiple live payments for the same customer (recurring / annual)', () => {
    const out = selectLinkableMembershipPayments(
      [
        { Id: 7, Status: 'Settled', Amount: 149, CustomerId: 43540563, PaymentDate: '2026-06-16' },
        { Id: 8, Status: 'Posted', Amount: 149, CustomerId: 43540563, PaymentDate: '2026-07-16' },
      ],
      ourCids
    );
    expect(out.get('43540563')).toHaveLength(2);
  });
});
