import {
  PLANS, planChargeAmount, isSubscriptionRef, isNonPayingCohortName, getSubscription, startCheckout, activateByRef, cancelSubscription, confirmCheckout,
  billingAnchorMs, periodEndMs,
  grantFreeAccess, revokeFreeAccess, activeCompEnrollmentIds,
} from '../subscriptionService';
import { Enrollment, Cohort, Subscription, AccountCredit } from '../../models';
import { findOrCreateCustomer, createPaymentLink } from '../paysimpleService';
import { retireRedundantExplorerAccounts } from '../enrollmentService';
import { env } from '../../config/env';

jest.mock('../../config/env', () => ({ env: { paysimpleApiUser: 'u', paysimpleApiKey: 'k', paymentMode: 'test' } }));
jest.mock('../../models', () => ({
  Enrollment: { findByPk: jest.fn() },
  Cohort: { findByPk: jest.fn(), findAll: jest.fn() },
  Subscription: { findAll: jest.fn(), findOne: jest.fn(), create: jest.fn() },
  AccountCredit: { findAll: jest.fn(), update: jest.fn() },
}));
jest.mock('../paysimpleService', () => ({ findOrCreateCustomer: jest.fn(), createPaymentLink: jest.fn() }));
jest.mock('../openHouseService', () => ({ isDemoCohortName: (n: string) => /demo|test|sandbox/i.test(n || '') }));
jest.mock('../enrollmentService', () => ({ retireRedundantExplorerAccounts: jest.fn() }));

const NOW = Date.UTC(2026, 6, 15, 12);
const mockRetireExplorer = retireRedundantExplorerAccounts as jest.Mock;

describe('subscriptionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (env as any).paysimpleApiUser = 'u';
    (env as any).paysimpleApiKey = 'k';
    (env as any).paymentMode = 'test';
    // Defaults: no cohorts configured. Tests override per-case.
    (Cohort.findAll as jest.Mock).mockResolvedValue([]);
    (Cohort.findByPk as jest.Mock).mockResolvedValue(null);
    // Default: no account credit. Credit tests override per-case.
    (AccountCredit.findAll as jest.Mock).mockResolvedValue([]);
    mockRetireExplorer.mockResolvedValue(undefined);
  });

  describe('plans + helpers', () => {
    it('derives the annual charge as per_month × 12, monthly as per_month', () => {
      // Test amounts now; the ×12 rule keeps real prices correct on swap-in.
      expect(planChargeAmount({ per_month: 0.15, cadence: 'year' })).toBe(1.8);
      expect(planChargeAmount({ per_month: 0.19, cadence: 'month' })).toBe(0.19);
      expect(planChargeAmount({ per_month: 149, cadence: 'year' })).toBe(1788);
      expect(planChargeAmount({ per_month: 199, cadence: 'month' })).toBe(199);
      expect(PLANS.annual.price).toBe(1788);
      expect(PLANS.annual.amount_cents).toBe(178800);
      expect(PLANS.annual.per_month).toBe(149);
      expect(PLANS.monthly.price).toBe(199);
    });
    it('recognizes a subscription external_id', () => {
      expect(isSubscriptionRef('SUB-abc-123')).toBe(true);
      expect(isSubscriptionRef('CB-1-2')).toBe(false);
      expect(isSubscriptionRef(undefined)).toBe(false);
    });
    it('never treats the Explorer/prospect/demo cohorts as a paying target', () => {
      expect(isNonPayingCohortName('Explorer — Prospects')).toBe(true);
      expect(isNonPayingCohortName('Timeline Demo Cohort')).toBe(true);
      expect(isNonPayingCohortName('Cohort - July 2026')).toBe(false);
      expect(isNonPayingCohortName('Cohort 1 — July 2026')).toBe(false);
    });
  });

  describe('free access (comped seats)', () => {
    it('grantFreeAccess: creates an active comp subscription and flips the enrollment to a paid member', async () => {
      const update = jest.fn();
      (Enrollment.findByPk as jest.Mock).mockResolvedValue({ id: 'e1', email: 'staff@example.com', cohort_id: 'c1', enrolled_at: null, update });
      (Subscription.findOne as jest.Mock).mockResolvedValue(null);
      (Subscription.create as jest.Mock).mockImplementation(async (attrs: any) => ({ id: 'sub1', ...attrs }));

      const sub = await grantFreeAccess('e1', NOW);

      expect(Subscription.create).toHaveBeenCalledWith(expect.objectContaining({
        enrollment_id: 'e1', plan: 'comp', status: 'active', amount_cents: 0,
      }));
      expect((Subscription.create as jest.Mock).mock.calls[0][0].payment_ref).toMatch(/^COMP-e1-/);
      expect(update).toHaveBeenCalledWith(expect.objectContaining({
        enrollment_type: 'standard', tier: 'member', payment_status: 'paid', status: 'active', portal_enabled: true, amount_paid: 0,
      }));
      expect((sub as any).plan).toBe('comp');
      // grantFreeAccess shares grantMembership with activateByRef, so a comped
      // student's lingering Explorer duplicate gets retired the same way.
      expect(mockRetireExplorer).toHaveBeenCalledWith('staff@example.com', 'e1');
    });

    it('grantFreeAccess: idempotent — reuses an existing active comp (no new row)', async () => {
      const update = jest.fn();
      (Enrollment.findByPk as jest.Mock).mockResolvedValue({ id: 'e1', cohort_id: 'c1', enrolled_at: null, update });
      (Subscription.findOne as jest.Mock).mockResolvedValue({ id: 'existing', plan: 'comp', status: 'active' });

      const sub = await grantFreeAccess('e1', NOW);

      expect(Subscription.create).not.toHaveBeenCalled();
      expect((sub as any).id).toBe('existing');
      expect(update).toHaveBeenCalled(); // membership grant is still (idempotently) applied
    });

    it('grantFreeAccess: throws NotFoundError when the enrollment is missing', async () => {
      (Enrollment.findByPk as jest.Mock).mockResolvedValue(null);
      await expect(grantFreeAccess('nope', NOW)).rejects.toMatchObject({ error_class: 'NotFoundError' });
      expect(Subscription.create).not.toHaveBeenCalled();
    });

    it('revokeFreeAccess: cancels an active comp and returns true', async () => {
      const update = jest.fn();
      (Subscription.findOne as jest.Mock).mockResolvedValue({ id: 'sub1', update });
      const ok = await revokeFreeAccess('e1', NOW);
      expect(ok).toBe(true);
      expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'canceled', cancel_reason: 'comp_revoked' }));
    });

    it('revokeFreeAccess: returns false when there is no active comp', async () => {
      (Subscription.findOne as jest.Mock).mockResolvedValue(null);
      await expect(revokeFreeAccess('e1', NOW)).resolves.toBe(false);
    });

    it('activeCompEnrollmentIds: empty input short-circuits with no query', async () => {
      const set = await activeCompEnrollmentIds([]);
      expect(set.size).toBe(0);
      expect(Subscription.findAll).not.toHaveBeenCalled();
    });

    it('activeCompEnrollmentIds: returns the enrollments holding an active comp', async () => {
      (Subscription.findAll as jest.Mock).mockResolvedValue([{ enrollment_id: 'e1' }]);
      const set = await activeCompEnrollmentIds(['e1', 'e2']);
      expect(set.has('e1')).toBe(true);
      expect(set.has('e2')).toBe(false);
    });

    it('startCheckout rejects the comp plan — comp is admin-granted, never self-serve', async () => {
      const res = await startCheckout('e1', 'comp' as any, NOW);
      expect(res).toEqual({ ok: false, reason: 'unknown_plan' });
      expect(Subscription.create).not.toHaveBeenCalled();
      expect(createPaymentLink).not.toHaveBeenCalled();
    });
  });

  describe('billing anchor', () => {
    it('anchors an early payment on the class start date', () => {
      // NOW is July 15 — class starts July 23, so the period starts July 23.
      expect(billingAnchorMs(NOW, '2026-07-23')).toBe(Date.UTC(2026, 6, 23));
    });
    it('anchors on payment time once class has started', () => {
      expect(billingAnchorMs(NOW, '2026-07-01')).toBe(NOW);
      expect(billingAnchorMs(NOW, '2026-07-15')).toBe(NOW); // class day, later that day
    });
    it('falls back to payment time without a valid class date', () => {
      expect(billingAnchorMs(NOW, null)).toBe(NOW);
      expect(billingAnchorMs(NOW, undefined)).toBe(NOW);
      expect(billingAnchorMs(NOW, 'not-a-date')).toBe(NOW);
    });
    it('computes period end as +1 calendar month/year with end-of-month clamping', () => {
      expect(periodEndMs(Date.UTC(2026, 6, 23), 'month')).toBe(Date.UTC(2026, 7, 23));  // 7/23 → 8/23
      expect(periodEndMs(Date.UTC(2026, 11, 15), 'month')).toBe(Date.UTC(2027, 0, 15)); // year boundary
      expect(periodEndMs(Date.UTC(2027, 0, 31), 'month')).toBe(Date.UTC(2027, 1, 28));  // Jan 31 → Feb 28
      expect(periodEndMs(Date.UTC(2026, 6, 23), 'year')).toBe(Date.UTC(2027, 6, 23));
      expect(periodEndMs(Date.UTC(2028, 1, 29), 'year')).toBe(Date.UTC(2029, 1, 28));   // leap day → Feb 28
    });
  });

  describe('getSubscription', () => {
    it('an Explorer with no plan needs a subscription', async () => {
      (Enrollment.findByPk as jest.Mock).mockResolvedValue({ enrollment_type: 'explorer' });
      (Subscription.findAll as jest.Mock).mockResolvedValue([]);
      const v = await getSubscription('e1', NOW);
      expect(v.subscription).toBeNull();
      expect(v.needs_subscription).toBe(true);
      expect(v.plans).toHaveLength(2);
    });

    it('an active plan reports next payment in N days', async () => {
      (Enrollment.findByPk as jest.Mock).mockResolvedValue({ enrollment_type: 'standard' });
      (Subscription.findAll as jest.Mock).mockResolvedValue([
        { plan: 'monthly', status: 'active', amount_cents: 19900, started_at: new Date(NOW), current_period_end: new Date(NOW + 20 * 864e5), cancel_reason: null },
      ]);
      const v = await getSubscription('e1', NOW);
      expect(v.subscription?.status).toBe('active');
      expect(v.subscription?.next_payment?.in_days).toBe(20);
      expect(v.needs_subscription).toBe(false);
    });

    it('reports the class the payment counts toward (class_start)', async () => {
      (Enrollment.findByPk as jest.Mock).mockResolvedValue({ enrollment_type: 'explorer' });
      (Subscription.findAll as jest.Mock).mockResolvedValue([]);
      (Cohort.findAll as jest.Mock).mockResolvedValue([
        { id: 'c-july', name: 'Cohort - July 2026', status: 'open', start_date: '2026-07-23' },
      ]);
      const v = await getSubscription('e1', NOW); // July 15 — class is still ahead
      expect(v.class_start).toEqual({
        cohort_id: 'c-july', cohort_name: 'Cohort - July 2026', start_date: '2026-07-23', is_future: true,
      });
    });

    it('reports available account credit (the $50 Open House deposit)', async () => {
      (Enrollment.findByPk as jest.Mock).mockResolvedValue({ enrollment_type: 'explorer' });
      (Subscription.findAll as jest.Mock).mockResolvedValue([]);
      (AccountCredit.findAll as jest.Mock).mockResolvedValue([{ amount_cents: 5000 }]);
      const v = await getSubscription('e1', NOW);
      expect(v.available_credit_cents).toBe(5000);
    });

    it('a canceled plan retains access until the period end', async () => {
      (Enrollment.findByPk as jest.Mock).mockResolvedValue({ enrollment_type: 'standard' });
      (Subscription.findAll as jest.Mock).mockResolvedValue([
        { plan: 'annual', status: 'canceled', amount_cents: 178800, started_at: new Date(NOW), current_period_end: new Date(NOW + 100 * 864e5), cancel_reason: 'Too busy' },
      ]);
      const v = await getSubscription('e1', NOW);
      expect(v.subscription?.canceled).toBe(true);
      expect(v.subscription?.access_until).not.toBeNull();
      expect(v.subscription?.next_payment).toBeNull();
    });
  });

  describe('startCheckout', () => {
    it('rejects an unknown plan', async () => {
      const r = await startCheckout('e1', 'weekly' as any, NOW);
      expect(r).toEqual({ ok: false, reason: 'unknown_plan' });
    });

    it('reports billing_unconfigured when PaySimple creds are missing', async () => {
      (env as any).paysimpleApiKey = '';
      const r = await startCheckout('e1', 'monthly', NOW);
      expect(r).toEqual({ ok: false, reason: 'billing_unconfigured' });
    });

    it('404s when the enrollment is gone', async () => {
      (Enrollment.findByPk as jest.Mock).mockResolvedValue(null);
      const r = await startCheckout('e1', 'monthly', NOW);
      expect(r).toEqual({ ok: false, reason: 'enrollment_not_found' });
    });

    it('creates a pending subscription and returns the payment link', async () => {
      (Enrollment.findByPk as jest.Mock).mockResolvedValue({ full_name: 'Ada Lovelace', email: 'ada@x.io', company: 'X', phone: '5551234567' });
      (findOrCreateCustomer as jest.Mock).mockResolvedValue({ Id: 42 });
      (createPaymentLink as jest.Mock).mockResolvedValue({ id: 'pl_1', payment_link: 'https://pay.example/abc' });
      (Subscription.create as jest.Mock).mockResolvedValue({});
      const r = await startCheckout('e1', 'annual', NOW);
      expect(r).toEqual({ ok: true, payment_link: 'https://pay.example/abc', plan: 'annual', amount: 1788, full_amount: 1788, applied_credit: 0 });
      const created = (Subscription.create as jest.Mock).mock.calls[0][0];
      expect(created.status).toBe('pending');
      expect(created.payment_ref).toMatch(/^SUB-e1-/);
      expect(created.amount_cents).toBe(178800);
      expect(created.applied_credit_cents).toBe(0);
      // Checkout requests the real plan amount (test mode reduces it to $0.01 on dev).
      expect((createPaymentLink as jest.Mock).mock.calls[0][0]).toMatchObject({ amount: 1788 });
    });

    it('applies an available $50 credit to the charge and records it on the pending sub', async () => {
      (Enrollment.findByPk as jest.Mock).mockResolvedValue({ full_name: 'Ada Lovelace', email: 'ada@x.io', company: 'X' });
      (findOrCreateCustomer as jest.Mock).mockResolvedValue({ Id: 42 });
      (createPaymentLink as jest.Mock).mockResolvedValue({ id: 'pl_1', payment_link: 'https://pay.example/abc' });
      (Subscription.create as jest.Mock).mockResolvedValue({});
      (AccountCredit.findAll as jest.Mock).mockResolvedValue([{ id: 'cr1', amount_cents: 5000 }]); // $50 available
      const r = await startCheckout('e1', 'monthly', NOW);
      // $199 monthly − $50 credit = $149 charged today; recurring price unchanged.
      expect(r).toMatchObject({ ok: true, amount: 149, full_amount: 199, applied_credit: 50 });
      expect((createPaymentLink as jest.Mock).mock.calls[0][0].amount).toBe(149);
      const created = (Subscription.create as jest.Mock).mock.calls[0][0];
      expect(created.amount_cents).toBe(19900);        // full recurring price kept
      expect(created.applied_credit_cents).toBe(5000); // credit recorded for consumption on settle
    });
  });

  describe('activateByRef', () => {
    it('returns null for an unknown ref', async () => {
      (Subscription.findOne as jest.Mock).mockResolvedValue(null);
      expect(await activateByRef('SUB-x-1', {}, NOW)).toBeNull();
    });

    it('is idempotent — an already-active subscription is not re-processed', async () => {
      const sub = { status: 'active', plan: 'monthly', update: jest.fn(), enrollment_id: 'e1' };
      (Subscription.findOne as jest.Mock).mockResolvedValue(sub);
      await activateByRef('SUB-e1-1', { paymentId: 9 }, NOW);
      expect(sub.update).not.toHaveBeenCalled();
      expect(Enrollment.findByPk).not.toHaveBeenCalled();
    });

    it('activates + converts the Explorer on first payment', async () => {
      const sub = { status: 'pending', plan: 'monthly', enrollment_id: 'e1', paysimple_payment_id: null, update: jest.fn() };
      const enrollment = { cohort_id: null, enrolled_at: null, update: jest.fn() };
      (Subscription.findOne as jest.Mock).mockResolvedValue(sub);
      (Enrollment.findByPk as jest.Mock).mockResolvedValue(enrollment);
      (Cohort.findAll as jest.Mock).mockResolvedValue([{ id: 'c-july', name: 'July 2026', status: 'open' }]);
      await activateByRef('SUB-e1-1', { paymentId: 9, amount: 199 }, NOW);

      const subUpdate = sub.update.mock.calls[0][0];
      expect(subUpdate.status).toBe('active');
      // No class start date on the cohort → anchored on payment time, +1 calendar month.
      expect(subUpdate.started_at.getTime()).toBe(NOW);
      expect(subUpdate.current_period_end.getTime()).toBe(Date.UTC(2026, 7, 15, 12));
      const enrUpdate = enrollment.update.mock.calls[0][0];
      expect(enrUpdate.enrollment_type).toBe('standard'); // drops the Week-0 gate
      expect(enrUpdate.tier).toBe('member');
      expect(enrUpdate.payment_status).toBe('paid');
      expect(enrUpdate.cohort_id).toBe('c-july');
    });

    it('retires any lingering Explorer duplicate on activation (regression: this self-serve path never did before 2026-07-31)', async () => {
      // Root cause found live 2026-07-31: the legacy CB- payment path always
      // retired a paying student's free Explorer duplicate on confirmation,
      // but this self-serve checkout path funneled through grantMembership
      // without ever doing the same thing -- a real reason 8+ students ended
      // up with an active duplicate shadowing their real, newly-paid account.
      const sub = { status: 'pending', plan: 'monthly', enrollment_id: 'e1', paysimple_payment_id: null, update: jest.fn() };
      const enrollment = { id: 'e1', email: 'sonya@example.com', cohort_id: 'c-july', enrolled_at: null, update: jest.fn() };
      (Subscription.findOne as jest.Mock).mockResolvedValue(sub);
      (Enrollment.findByPk as jest.Mock).mockResolvedValue(enrollment);

      await activateByRef('SUB-e1-1', { paymentId: 9, amount: 199 }, NOW);

      expect(mockRetireExplorer).toHaveBeenCalledWith('sonya@example.com', 'e1');
    });

    it('does not fail activation when the Explorer retirement lookup errors (best-effort, non-blocking)', async () => {
      const sub = { status: 'pending', plan: 'monthly', enrollment_id: 'e1', paysimple_payment_id: null, update: jest.fn() };
      const enrollment = { id: 'e1', email: 'sonya@example.com', cohort_id: 'c-july', enrolled_at: null, update: jest.fn() };
      (Subscription.findOne as jest.Mock).mockResolvedValue(sub);
      (Enrollment.findByPk as jest.Mock).mockResolvedValue(enrollment);
      mockRetireExplorer.mockRejectedValue(new Error('db hiccup'));

      await expect(activateByRef('SUB-e1-1', { paymentId: 9, amount: 199 }, NOW)).resolves.toBeTruthy();
      expect(sub.update).toHaveBeenCalled(); // the real activation still completed
    });

    it('consumes the applied account credit when the payment settles', async () => {
      const sub = { id: 'sub1', status: 'pending', plan: 'monthly', enrollment_id: 'e1', applied_credit_cents: 5000, paysimple_payment_id: null, update: jest.fn() };
      const enrollment = { cohort_id: 'c-july', enrolled_at: null, update: jest.fn() };
      (Subscription.findOne as jest.Mock).mockResolvedValue(sub);
      (Enrollment.findByPk as jest.Mock).mockResolvedValue(enrollment);
      (Cohort.findByPk as jest.Mock).mockResolvedValue({ id: 'c-july', name: 'Cohort - July 2026', start_date: '2026-07-23' });
      // consume: idempotency guard finds none applied, then one $50 row available.
      (AccountCredit.findAll as jest.Mock).mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'cr1', amount_cents: 5000 }]);
      await activateByRef('SUB-e1-1', { amount: 149 }, NOW);
      const [vals, opts] = (AccountCredit.update as jest.Mock).mock.calls[0];
      expect(vals.status).toBe('applied');
      expect(vals.applied_subscription_id).toBe('sub1');
      expect(opts.where).toEqual({ id: ['cr1'] });
    });

    it('keeps an existing cohort assignment on activation', async () => {
      const sub = { status: 'pending', plan: 'annual', enrollment_id: 'e1', paysimple_payment_id: null, update: jest.fn() };
      const enrollment = { cohort_id: 'existing', enrolled_at: null, update: jest.fn() };
      (Subscription.findOne as jest.Mock).mockResolvedValue(sub);
      (Enrollment.findByPk as jest.Mock).mockResolvedValue(enrollment);
      await activateByRef('SUB-e1-1', {}, NOW);
      expect(enrollment.update.mock.calls[0][0].cohort_id).toBe('existing');
      expect(Cohort.findAll).not.toHaveBeenCalled();
    });

    it('anchors the period on the class start date when paying early (pay 7/20 → month runs 7/23 → 8/23)', async () => {
      const payTime = Date.UTC(2026, 6, 20, 15); // July 20, class starts July 23
      const sub = { status: 'pending', plan: 'monthly', enrollment_id: 'e1', paysimple_payment_id: null, update: jest.fn() };
      const enrollment = { cohort_id: 'c-july', enrolled_at: null, update: jest.fn() };
      (Subscription.findOne as jest.Mock).mockResolvedValue(sub);
      (Enrollment.findByPk as jest.Mock).mockResolvedValue(enrollment);
      (Cohort.findByPk as jest.Mock).mockResolvedValue({ id: 'c-july', name: 'Cohort - July 2026', start_date: '2026-07-23' });
      await activateByRef('SUB-e1-1', { amount: 199 }, payTime);

      const subUpdate = sub.update.mock.calls[0][0];
      expect(subUpdate.started_at.getTime()).toBe(Date.UTC(2026, 6, 23));            // class day, not pay day
      expect(subUpdate.current_period_end.getTime()).toBe(Date.UTC(2026, 7, 23));    // 8/23, not 8/20
      // The enrollment still records the real payment date.
      expect(enrollment.update.mock.calls[0][0].enrolled_at.getTime()).toBe(payTime);
    });

    it('anchors on payment time when the class has already started', async () => {
      const payTime = Date.UTC(2026, 7, 1, 10); // Aug 1, class started July 23
      const sub = { status: 'pending', plan: 'monthly', enrollment_id: 'e1', paysimple_payment_id: null, update: jest.fn() };
      const enrollment = { cohort_id: 'c-july', enrolled_at: null, update: jest.fn() };
      (Subscription.findOne as jest.Mock).mockResolvedValue(sub);
      (Enrollment.findByPk as jest.Mock).mockResolvedValue(enrollment);
      (Cohort.findByPk as jest.Mock).mockResolvedValue({ id: 'c-july', name: 'Cohort - July 2026', start_date: '2026-07-23' });
      await activateByRef('SUB-e1-1', {}, payTime);

      const subUpdate = sub.update.mock.calls[0][0];
      expect(subUpdate.started_at.getTime()).toBe(payTime);
      expect(subUpdate.current_period_end.getTime()).toBe(Date.UTC(2026, 8, 1, 10));
    });

    it('reroutes a paying Explorer out of the Explorer bucket into the paid cohort', async () => {
      const sub = { status: 'pending', plan: 'monthly', enrollment_id: 'e1', paysimple_payment_id: null, update: jest.fn() };
      const enrollment = { cohort_id: 'c-explorer', enrolled_at: null, update: jest.fn() };
      (Subscription.findOne as jest.Mock).mockResolvedValue(sub);
      (Enrollment.findByPk as jest.Mock).mockResolvedValue(enrollment);
      (Cohort.findByPk as jest.Mock).mockResolvedValue({ id: 'c-explorer', name: 'Explorer — Prospects', start_date: '2026-05-01' });
      (Cohort.findAll as jest.Mock).mockResolvedValue([{ id: 'c-july', name: 'Cohort - July 2026', status: 'open', start_date: '2026-07-23' }]);
      await activateByRef('SUB-e1-1', {}, NOW); // July 15

      expect(enrollment.update.mock.calls[0][0].cohort_id).toBe('c-july'); // not the Explorer bucket
      // ...and the anchor uses the PAID cohort's start date, not the bucket's.
      expect(sub.update.mock.calls[0][0].started_at.getTime()).toBe(Date.UTC(2026, 6, 23));
    });
  });

  describe('confirmCheckout', () => {
    afterEach(() => { delete process.env.SUBSCRIPTION_ALLOW_RETURN_ACTIVATE; });

    it('reports active without re-activating when already active', async () => {
      (Enrollment.findByPk as jest.Mock).mockResolvedValue({ enrollment_type: 'standard' });
      (Subscription.findAll as jest.Mock).mockResolvedValue([
        { plan: 'annual', status: 'active', amount_cents: 180, started_at: new Date(NOW), current_period_end: new Date(NOW + 300 * 864e5), cancel_reason: null },
      ]);
      const r = await confirmCheckout('e1', NOW);
      expect(r.activated).toBe(false);
      expect(r.view.subscription?.status).toBe('active');
    });

    it('does NOT activate a pending sub when the dev flag is off (prod relies on the webhook)', async () => {
      delete process.env.SUBSCRIPTION_ALLOW_RETURN_ACTIVATE;
      (Enrollment.findByPk as jest.Mock).mockResolvedValue({ enrollment_type: 'explorer' });
      (Subscription.findAll as jest.Mock).mockResolvedValue([]); // nothing active
      const pending = { status: 'pending', created_at: new Date(NOW), payment_ref: 'SUB-x', update: jest.fn() };
      (Subscription.findOne as jest.Mock).mockResolvedValue(pending);
      const r = await confirmCheckout('e1', NOW);
      expect(r.activated).toBe(false);
      expect(pending.update).not.toHaveBeenCalled();
    });

    it('activates the recent pending sub when the dev flag is on', async () => {
      process.env.SUBSCRIPTION_ALLOW_RETURN_ACTIVATE = 'true';
      (Enrollment.findByPk as jest.Mock).mockResolvedValue({ enrollment_type: 'explorer', cohort_id: 'c', enrolled_at: null, update: jest.fn() });
      (Subscription.findAll as jest.Mock).mockResolvedValue([]); // currentSubscription: none active
      const pending = { status: 'pending', plan: 'annual', enrollment_id: 'e1', created_at: new Date(NOW), payment_ref: 'SUB-x', paysimple_payment_id: null, update: jest.fn() };
      (Subscription.findOne as jest.Mock).mockResolvedValue(pending);
      const r = await confirmCheckout('e1', NOW);
      expect(r.activated).toBe(true);
      expect(pending.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'active' }));
    });

    it('ignores a stale pending sub (older than the window) even with the flag on', async () => {
      process.env.SUBSCRIPTION_ALLOW_RETURN_ACTIVATE = 'true';
      (Enrollment.findByPk as jest.Mock).mockResolvedValue({ enrollment_type: 'explorer' });
      (Subscription.findAll as jest.Mock).mockResolvedValue([]);
      const stale = { status: 'pending', created_at: new Date(NOW - 60 * 60 * 1000), payment_ref: 'SUB-x', update: jest.fn() };
      (Subscription.findOne as jest.Mock).mockResolvedValue(stale);
      const r = await confirmCheckout('e1', NOW);
      expect(r.activated).toBe(false);
      expect(stale.update).not.toHaveBeenCalled();
    });
  });

  describe('cancelSubscription', () => {
    it('errors when there is no active subscription', async () => {
      (Subscription.findAll as jest.Mock).mockResolvedValue([]);
      const r = await cancelSubscription('e1', 'Too pricey', NOW);
      expect(r).toEqual({ ok: false, reason: 'no_active_subscription' });
    });

    it('cancels the active subscription and records the reason', async () => {
      const sub = { status: 'active', current_period_end: new Date(NOW + 10 * 864e5), update: jest.fn() };
      (Subscription.findAll as jest.Mock).mockResolvedValue([sub]);
      const r = await cancelSubscription('e1', 'Switching tools', NOW);
      expect(r.ok).toBe(true);
      const upd = sub.update.mock.calls[0][0];
      expect(upd.status).toBe('canceled');
      expect(upd.cancel_reason).toBe('Switching tools');
    });
  });
});
