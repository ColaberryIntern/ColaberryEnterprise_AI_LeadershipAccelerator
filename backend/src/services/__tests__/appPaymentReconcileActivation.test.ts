import { reconcileAppPayments } from '../appPaymentReconcileService';
import { Enrollment, Cohort, Subscription, AccountCredit } from '../../models';
import { sequelize } from '../../config/database';
import { listRecentPayments, getCustomerById } from '../paysimpleService';

/**
 * DEFECT 1 — the reconciler activated subscriptions with its own raw SQL and never
 * called activateByRef, so consumeCreditsForSubscription never ran. Five students who
 * genuinely received the $50 Open House discount (each charged $149 against a $199
 * plan, verified against PaySimple 2026-08-19) still had `available` credit rows that
 * would have been spent a second time — roughly $250 running against the company.
 *
 * These tests exercise the REAL activateByRef and the REAL accountCreditService, with
 * only the model/DB layer faked, because the bug lived precisely in the seam between
 * them. Mocking activateByRef here would re-create the bug: two implementations of
 * "activate a subscription" that agree only in the test suite.
 */

jest.mock('../../config/env', () => ({
  env: {
    paysimpleApiUser: 'u',
    paysimpleApiKey: 'k',
    paysimpleReconcileStart: '2026-07-01T00:00:00Z',
    paymentMode: 'test',
    databaseUrl: 'postgres://test/test',
    nodeEnv: 'test',
  },
}));
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../models', () => ({
  Enrollment: { findByPk: jest.fn(), findAll: jest.fn() },
  Cohort: { findByPk: jest.fn(), findAll: jest.fn() },
  Subscription: { findAll: jest.fn(), findOne: jest.fn(), create: jest.fn() },
  AccountCredit: { findAll: jest.fn(), update: jest.fn() },
}));
jest.mock('../paysimpleService', () => ({
  listRecentPayments: jest.fn(),
  getCustomerById: jest.fn(),
  findOrCreateCustomer: jest.fn(),
  createPaymentLink: jest.fn(),
}));
jest.mock('../enrollmentService', () => ({ retireRedundantExplorerAccounts: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../openHouseService', () => ({ isDemoCohortName: (n: string) => /demo|test|sandbox/i.test(n || '') }));

const mockQuery = sequelize.query as jest.Mock;

const ENROLLMENT_ID = 'enr-1';
const SUB_ID = 'sub-1';
const PAYMENT_REF = 'SUB-enr1-ms881m3n';
const CUSTOMER_ID = '43540435';
const PAYMENT_ID = '155191653';

// Emmanuel Sane's real shape: checkout opened 2026-07-31 00:45:57Z on a $199 monthly
// plan with a $50 credit applied, settled $149.
const CHECKOUT_MS = Date.parse('2026-07-31T00:45:57Z');
const PAID_AT = '2026-07-31T00:52:00Z';

interface Scenario {
  checkouts?: Array<{ startedMs: number; amountCents: number; chargeCents: number }>;
  pendingSubs?: Array<{ id: string; payment_ref: string; paysimple_payment_id: string | null }>;
  claims?: Array<{ enrollmentId: string; cid: string }>;
  payments?: Array<Record<string, unknown>>;
}

/** Routes the service's raw SQL to canned rows by matching on distinctive fragments. */
function wireDb(sc: Scenario = {}): { updates: Array<{ sql: string; replacements: any }> } {
  const updates: Array<{ sql: string; replacements: any }> = [];
  const checkouts = sc.checkouts ?? [{ startedMs: CHECKOUT_MS, amountCents: 19900, chargeCents: 14900 }];
  const pendingSubs = sc.pendingSubs ?? [{ id: SUB_ID, payment_ref: PAYMENT_REF, paysimple_payment_id: null }];
  const claims = sc.claims ?? [{ enrollmentId: ENROLLMENT_ID, cid: CUSTOMER_ID }];

  mockQuery.mockImplementation(async (sql: string, opts: any) => {
    if (sql.includes('LEFT JOIN subscriptions s ON s.enrollment_id = e.id')) {
      return [{ id: ENROLLMENT_ID, email: 'paulsane@yahoo.com', cids: [CUSTOMER_ID], checkouts }];
    }
    if (sql.includes('paysimple_customer_id::text')) return claims;
    if (sql.includes('paysimple_payment_id AS pid')) return [];
    // Matched loosely (not on the exact column list) so this harness stays faithful when
    // run against the pre-fix implementation, whose pending-subs SELECT names only `id`.
    if (sql.trimStart().startsWith('SELECT') && sql.includes('FROM subscriptions') && sql.includes("status = 'pending'")) {
      return pendingSubs;
    }
    updates.push({ sql, replacements: opts?.replacements });
    return [undefined, 1];
  });

  (listRecentPayments as jest.Mock).mockResolvedValue(
    sc.payments ?? [{ Id: PAYMENT_ID, Status: 'Settled', Amount: 149, CustomerId: Number(CUSTOMER_ID), PaymentDate: PAID_AT }]
  );
  (getCustomerById as jest.Mock).mockResolvedValue({ Email: 'paulsane@yahoo.com' });
  return { updates };
}

/** The pending subscription row activateByRef will load and mutate. */
function wireSubscription(appliedCreditCents: number): any {
  const sub: any = {
    id: SUB_ID, status: 'pending', plan: 'monthly', enrollment_id: ENROLLMENT_ID,
    applied_credit_cents: appliedCreditCents, paysimple_payment_id: null,
    update: jest.fn(async (vals: any) => { Object.assign(sub, vals); return sub; }),
  };
  (Subscription.findOne as jest.Mock).mockResolvedValue(sub);
  const enrollment: any = {
    id: ENROLLMENT_ID, email: 'paulsane@yahoo.com', cohort_id: 'c-july', enrolled_at: null,
    update: jest.fn(async () => enrollment),
  };
  (Enrollment.findByPk as jest.Mock).mockResolvedValue(enrollment);
  return { sub, enrollment };
}

describe('reconcileAppPayments — activation consumes account credit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Cohort.findAll as jest.Mock).mockResolvedValue([]);
    (Cohort.findByPk as jest.Mock).mockResolvedValue({ id: 'c-july', name: 'Cohort - July 2026', start_date: '2026-07-23' });
    (AccountCredit.findAll as jest.Mock).mockResolvedValue([]);
    (AccountCredit.update as jest.Mock).mockResolvedValue([1]);
  });

  it('CONSUMES an available $50 credit when the reconciler activates the subscription', async () => {
    // THE BUG: before the fix this activated via raw SQL, so the credit row stayed
    // `available` and was spendable a second time.
    wireDb();
    const { sub } = wireSubscription(5000);
    (AccountCredit.findAll as jest.Mock)
      .mockResolvedValueOnce([])                                  // none applied to this sub yet
      .mockResolvedValueOnce([{ id: 'cr-1', amount_cents: 5000 }]); // one $50 row available

    const summary = await reconcileAppPayments();

    expect(summary.linked).toBe(1);
    expect(summary.subscriptionsActivated).toBe(1);
    expect(sub.status).toBe('active');
    const [vals, opts] = (AccountCredit.update as jest.Mock).mock.calls[0];
    expect(vals.status).toBe('applied');
    expect(vals.applied_subscription_id).toBe(SUB_ID);
    expect(opts.where).toEqual({ id: ['cr-1'] });
  });

  it('activates cleanly when there is NO credit — nothing to consume, nothing touched', async () => {
    wireDb();
    const { sub } = wireSubscription(0);

    const summary = await reconcileAppPayments();

    expect(summary.subscriptionsActivated).toBe(1);
    expect(sub.status).toBe('active');
    expect(AccountCredit.update as jest.Mock).not.toHaveBeenCalled();
  });

  it('is IDEMPOTENT when the credit is already consumed — consuming twice is the exact bug', async () => {
    wireDb();
    wireSubscription(5000);
    // The idempotency guard finds credit already linked to this subscription.
    (AccountCredit.findAll as jest.Mock).mockResolvedValue([
      { id: 'cr-1', amount_cents: 5000, status: 'applied', applied_subscription_id: SUB_ID },
    ]);

    const summary = await reconcileAppPayments();

    // The activation must actually have gone through the credit path and found it
    // already spent — not simply skipped the ledger, which is what the old raw-SQL
    // activation did and why this looked "idempotent" while being broken.
    expect(summary.subscriptionsActivated).toBe(1);
    expect(AccountCredit.findAll as jest.Mock).toHaveBeenCalledWith({ where: { applied_subscription_id: SUB_ID } });
    expect(AccountCredit.update as jest.Mock).not.toHaveBeenCalled();
  });

  it('converts the Explorer to a paying member — the raw-SQL path never did', async () => {
    wireDb();
    const { enrollment } = wireSubscription(0);

    await reconcileAppPayments();

    const enrUpdate = enrollment.update.mock.calls[0][0];
    expect(enrUpdate.enrollment_type).toBe('standard'); // drops the Week-0 gate
    expect(enrUpdate.tier).toBe('member');
    expect(enrUpdate.payment_status).toBe('paid');
  });

  it('never overwrites a payment id already on the subscription row (COALESCE semantics)', async () => {
    wireDb({ pendingSubs: [{ id: SUB_ID, payment_ref: PAYMENT_REF, paysimple_payment_id: '999' }] });
    const { sub } = wireSubscription(0);

    await reconcileAppPayments();

    expect(sub.paysimple_payment_id).toBe('999');
  });

  it('records a link failure and keeps going when activation throws (candidate stays re-runnable)', async () => {
    const { updates } = wireDb();
    wireSubscription(0);
    (Subscription.findOne as jest.Mock).mockRejectedValue(new Error('db hiccup'));

    const summary = await reconcileAppPayments();

    expect(summary.linkFailures).toBe(1);
    expect(summary.linked).toBe(0);
    // The enrollment payment-id link is what removes the candidate from the next run;
    // it must NOT have been written when activation failed.
    expect(updates.some((u) => u.sql.includes('UPDATE enrollments'))).toBe(false);
  });
});

describe('reconcileAppPayments — path A origin guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Cohort.findAll as jest.Mock).mockResolvedValue([]);
    (Cohort.findByPk as jest.Mock).mockResolvedValue({ id: 'c-july', name: 'Cohort - July 2026', start_date: '2026-07-23' });
    (AccountCredit.findAll as jest.Mock).mockResolvedValue([]);
    (AccountCredit.update as jest.Mock).mockResolvedValue([1]);
  });

  it('REJECTS a payment on our customer id whose amount matches no pending checkout', async () => {
    // $250 bootcamp tuition on the shared gateway, landing on a customer id we stored.
    // Customer id alone used to be enough to link it and grant portal access.
    wireDb({
      payments: [{ Id: '900001', Status: 'Settled', Amount: 250, CustomerId: Number(CUSTOMER_ID), PaymentDate: PAID_AT }],
    });
    wireSubscription(0);

    const summary = await reconcileAppPayments();

    expect(summary.linked).toBe(0);
    expect(summary.rejectedByOriginGuard).toBe(1);
    expect(summary.noPaymentFound).toBe(1);
  });

  it('REJECTS a payment that PREDATES the checkout it would be attributed to', async () => {
    wireDb({
      payments: [{
        Id: '900002', Status: 'Settled', Amount: 149, CustomerId: Number(CUSTOMER_ID),
        PaymentDate: '2026-07-20T10:00:00Z', // 11 days BEFORE the checkout opened
      }],
    });
    wireSubscription(0);

    const summary = await reconcileAppPayments();

    expect(summary.linked).toBe(0);
    expect(summary.rejectedByOriginGuard).toBe(1);
  });

  it('still links the ALIAS case: our customer id, different payer email, valid origin', async () => {
    // Path A exists for payers whose PaySimple record carries a different address.
    // The origin guard must narrow path A without an email test, or Britiana Akhile,
    // Jude Mofunanya and Marione Nkerbu silently stop reconciling.
    wireDb();
    (getCustomerById as jest.Mock).mockResolvedValue({ Email: 'a-totally-different@address.com' });
    wireSubscription(0);

    const summary = await reconcileAppPayments();

    expect(summary.linked).toBe(1);
    expect(summary.linkedByCustomerId).toBe(1);
  });

  it('refuses path A on a customer id claimed by two enrollments, and reports the breach', async () => {
    wireDb({ claims: [{ enrollmentId: ENROLLMENT_ID, cid: CUSTOMER_ID }, { enrollmentId: 'enr-2', cid: CUSTOMER_ID }] });
    wireSubscription(0);

    const summary = await reconcileAppPayments();

    expect(summary.sharedCustomerIds).toEqual([{ cid: CUSTOMER_ID, enrollmentIds: [ENROLLMENT_ID, 'enr-2'] }]);
    expect(summary.linkedByCustomerId).toBe(0);
  });
});
