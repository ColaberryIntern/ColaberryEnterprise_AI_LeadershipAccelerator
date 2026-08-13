import { selectLinkableMembershipPayments, matchesAppCheckout } from '../appPaymentReconcileService';

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

/**
 * Path B exists because PaySimple's hosted page mints its OWN customer for the payer,
 * so the charge never carries the customer id we pre-created. The guard that replaces
 * the customer-id check must still be ORIGIN-based: an app-opened pending checkout,
 * for that amount, just before the charge. Email alone must never qualify a payment —
 * that is what keeps bootcamp tuition and direct charges out of Accelerator revenue.
 */
describe('appPaymentReconcileService.matchesAppCheckout', () => {
  const T0 = Date.parse('2026-08-11T02:23:53Z'); // Arinze's real checkout
  const EMAIL = 'arinzeohagwu@yahoo.com';
  const checkouts = [{ startedMs: T0, amountCents: 19900 }];

  it('matches the real case: hosted page charged a DIFFERENT customer 4 min after our checkout', () => {
    expect(
      matchesAppCheckout(
        { amountCents: 19900, paidMs: Date.parse('2026-08-11T02:28:15Z'), payerEmail: EMAIL },
        EMAIL,
        checkouts
      )
    ).toBe(true);
  });

  it('REJECTS a same-amount charge from a different payer (no origin link to this person)', () => {
    expect(
      matchesAppCheckout(
        { amountCents: 19900, paidMs: Date.parse('2026-08-11T02:28:15Z'), payerEmail: 'someone-else@example.com' },
        EMAIL,
        checkouts
      )
    ).toBe(false);
  });

  it('REJECTS a charge for an amount we never asked for (bootcamp $250 tuition on the shared gateway)', () => {
    expect(
      matchesAppCheckout(
        { amountCents: 25000, paidMs: Date.parse('2026-08-11T02:28:15Z'), payerEmail: EMAIL },
        EMAIL,
        checkouts
      )
    ).toBe(false);
  });

  it('REJECTS a charge outside the window — a later direct/manual charge is not this checkout', () => {
    expect(
      matchesAppCheckout(
        { amountCents: 19900, paidMs: Date.parse('2026-08-12T09:00:00Z'), payerEmail: EMAIL },
        EMAIL,
        checkouts
      )
    ).toBe(false);
  });

  it('REJECTS everything when the person has no app-originated checkout at all', () => {
    expect(
      matchesAppCheckout(
        { amountCents: 19900, paidMs: Date.parse('2026-08-11T02:28:15Z'), payerEmail: EMAIL },
        EMAIL,
        []
      )
    ).toBe(false);
  });

  it('allows small clock skew (charge stamped just before our row was written)', () => {
    expect(
      matchesAppCheckout(
        { amountCents: 19900, paidMs: T0 - 60_000, payerEmail: EMAIL },
        EMAIL,
        checkouts
      )
    ).toBe(true);
  });

  it('is case- and whitespace-insensitive on the payer email', () => {
    expect(
      matchesAppCheckout(
        { amountCents: 19900, paidMs: T0 + 60_000, payerEmail: '  ArinzeOhagwu@Yahoo.com ' },
        EMAIL,
        checkouts
      )
    ).toBe(true);
  });

  it('REJECTS a payment with an unparseable date rather than guessing', () => {
    expect(
      matchesAppCheckout({ amountCents: 19900, paidMs: NaN, payerEmail: EMAIL }, EMAIL, checkouts)
    ).toBe(false);
  });

  it('REJECTS when the payer email is missing (customer lookup failed)', () => {
    expect(
      matchesAppCheckout({ amountCents: 19900, paidMs: T0 + 60_000, payerEmail: '' }, EMAIL, checkouts)
    ).toBe(false);
  });
});
