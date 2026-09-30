import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import {
  selectLinkableMembershipPayments, matchesAppCheckout, matchesCheckoutOrigin, sharedCustomerIds,
} from '../appPaymentReconcileService';

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

/**
 * DEFECT 2 — path A used to match on customer id alone: no amount, no time window.
 * These lock the ORIGIN guard that path B always had and path A never did. There is
 * deliberately NO email test here: path A is the alias case, where the PaySimple
 * customer record carries a different address than the enrollment (confirmed live for
 * Britiana Akhile, Jude Mofunanya and Marione Nkerbu). An equality check would stop
 * reconciling them and move revenue attribution.
 */
describe('appPaymentReconcileService.matchesCheckoutOrigin (path A origin guard)', () => {
  const T0 = Date.parse('2026-07-31T00:45:57Z');
  const checkouts = [{ startedMs: T0, amountCents: 19900, chargeCents: 14900 }];

  it('matches a charge for the checkout amount, just after the checkout opened', () => {
    expect(matchesCheckoutOrigin({ amountCents: 19900, paidMs: T0 + 5 * 60_000 }, checkouts)).toBe(true);
  });

  it('matches the CREDIT-DISCOUNTED charge — $149 paid against a $199 pending row', () => {
    // The $50 Open House credit is taken off the charge but the pending row keeps the
    // full plan price. Matching on amount_cents alone would reject every credited
    // student and lock a paying member out of the portal.
    expect(matchesCheckoutOrigin({ amountCents: 14900, paidMs: T0 + 5 * 60_000 }, checkouts)).toBe(true);
  });

  it('REJECTS an amount we never asked for on this checkout (the defect: id alone was enough)', () => {
    expect(matchesCheckoutOrigin({ amountCents: 25000, paidMs: T0 + 5 * 60_000 }, checkouts)).toBe(false);
  });

  it('REJECTS a charge that PREDATES the checkout — it cannot have originated from it', () => {
    expect(matchesCheckoutOrigin({ amountCents: 19900, paidMs: T0 - 48 * 3600 * 1000 }, checkouts)).toBe(false);
  });

  it('REJECTS a charge long after the window closed (a later direct/manual charge)', () => {
    expect(matchesCheckoutOrigin({ amountCents: 19900, paidMs: T0 + 30 * 3600 * 1000 }, checkouts)).toBe(false);
  });

  it('REJECTS everything when this enrollment opened no checkout at all', () => {
    expect(matchesCheckoutOrigin({ amountCents: 19900, paidMs: T0 + 60_000 }, [])).toBe(false);
  });

  it('allows the same small clock skew path B allows', () => {
    expect(matchesCheckoutOrigin({ amountCents: 19900, paidMs: T0 - 60_000 }, checkouts)).toBe(true);
  });

  it('REJECTS an unparseable payment date rather than guessing', () => {
    expect(matchesCheckoutOrigin({ amountCents: 19900, paidMs: NaN }, checkouts)).toBe(false);
  });

  it('treats a checkout with no recorded credit as charging its list price', () => {
    expect(matchesCheckoutOrigin({ amountCents: 19900, paidMs: T0 + 60_000 }, [{ startedMs: T0, amountCents: 19900 }])).toBe(true);
  });
});

/**
 * DEFECT 2 (invariant) — a PaySimple customer id belongs to exactly one enrollment.
 * The 2026-08 contamination (customer 7095991 written onto three enrollments) was
 * visible as a duplicate long before it was visible as a mis-charge.
 */
describe('appPaymentReconcileService.sharedCustomerIds', () => {
  it('reports a customer id claimed by two enrollments, with both claimants', () => {
    const shared = sharedCustomerIds([
      { enrollmentId: 'e1', cid: '7095991' },
      { enrollmentId: 'e2', cid: '7095991' },
      { enrollmentId: 'e3', cid: '43540435' },
    ]);
    expect([...shared.keys()]).toEqual(['7095991']);
    expect(shared.get('7095991')).toEqual(['e1', 'e2']);
  });

  it('is silent when every customer id has exactly one owner', () => {
    expect(sharedCustomerIds([
      { enrollmentId: 'e1', cid: '1' },
      { enrollmentId: 'e2', cid: '2' },
    ]).size).toBe(0);
  });

  it('does not flag one enrollment claiming the same id on its enrollment AND its subscriptions', () => {
    // The claim set is a UNION across both tables; the same person holding the same id
    // twice is normal and must never trip the invariant.
    expect(sharedCustomerIds([
      { enrollmentId: 'e1', cid: '43540435' },
      { enrollmentId: 'e1', cid: '43540435' },
    ]).size).toBe(0);
  });

  it('ignores blank ids rather than grouping them together', () => {
    expect(sharedCustomerIds([
      { enrollmentId: 'e1', cid: '' },
      { enrollmentId: 'e2', cid: '' },
    ]).size).toBe(0);
  });
});

/**
 * DEFECT 3 — `enrollments.intake_data_json.credit_applied` is a dead mirror of the
 * account-credit ledger: stamped at checkout, never updated on consumption. On
 * 2026-08-19 all 24 rows carrying it read `false`, including Marcus Zeno's, whose $50
 * credit had actually been applied on 2026-07-31 — and that stale `false` nearly caused
 * a duplicate credit. The mirror is retired rather than repaired, and `account_credits`
 * is the sole authority. This is the tripwire that keeps it retired: a comment asking
 * people not to read it is not a contract, because it can be violated silently.
 */
describe('credit_applied mirror stays retired', () => {
  it('no backend source file reads or writes intake_data_json.credit_applied', () => {
    const root = path.resolve(__dirname, '../..');
    // The only files allowed to name the key are the ones documenting that it is dead:
    // the Enrollment model's warning, and this tripwire.
    const documentationOnly = new Set(
      ['models/Enrollment.ts', 'services/__tests__/appPaymentReconcileService.test.ts'].map((p) => path.normalize(p))
    );
    const isOffender = (rel: string): boolean => !documentationOnly.has(path.normalize(rel));

    // `git grep` over tracked + untracked sources is ~15x cheaper than reading all 3,400
    // backend files (2.5s vs 42s), and this runs on every suite. Fall back to the walk
    // wherever git is unavailable, so the guard can never silently stop guarding.
    let hits: string[] | null = null;
    try {
      const out = execFileSync('git', ['grep', '-l', '-I', '--untracked', '-e', 'credit_applied', '--', '*.ts', '*.js'],
        { cwd: root, encoding: 'utf8' });
      hits = out.split('\n').filter(Boolean);
    } catch (err: any) {
      if (err?.status === 1 && !err?.stderr?.length) hits = []; // exit 1 = no matches
    }

    if (hits === null) {
      hits = [];
      const walk = (dir: string): void => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name === 'dist') continue;
            walk(full);
            continue;
          }
          if (!/\.(ts|js)$/.test(entry.name)) continue;
          if (/\bcredit_applied\b/.test(fs.readFileSync(full, 'utf8'))) hits!.push(path.relative(root, full));
        }
      };
      walk(root);
    }

    expect(hits.filter(isOffender)).toEqual([]);
  });
});
