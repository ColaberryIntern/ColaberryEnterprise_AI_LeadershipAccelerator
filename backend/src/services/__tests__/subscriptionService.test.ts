import {
  PLANS, planChargeAmount, isSubscriptionRef, isNonPayingCohortName, getSubscription, startCheckout, activateByRef, cancelSubscription, confirmCheckout,
} from '../subscriptionService';
import { Enrollment, Cohort, Subscription } from '../../models';
import { findOrCreateCustomer, createPaymentLink } from '../paysimpleService';
import { env } from '../../config/env';

jest.mock('../../config/env', () => ({ env: { paysimpleApiUser: 'u', paysimpleApiKey: 'k', paymentMode: 'test' } }));
jest.mock('../../models', () => ({
  Enrollment: { findByPk: jest.fn() },
  Cohort: { findByPk: jest.fn(), findAll: jest.fn() },
  Subscription: { findAll: jest.fn(), findOne: jest.fn(), create: jest.fn() },
}));
jest.mock('../paysimpleService', () => ({ findOrCreateCustomer: jest.fn(), createPaymentLink: jest.fn() }));
jest.mock('../openHouseService', () => ({ isDemoCohortName: (n: string) => /demo|test|sandbox/i.test(n || '') }));

const NOW = Date.UTC(2026, 6, 15, 12);

describe('subscriptionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (env as any).paysimpleApiUser = 'u';
    (env as any).paysimpleApiKey = 'k';
    (env as any).paymentMode = 'test';
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
      expect(r).toEqual({ ok: true, payment_link: 'https://pay.example/abc', plan: 'annual', amount: 1788 });
      const created = (Subscription.create as jest.Mock).mock.calls[0][0];
      expect(created.status).toBe('pending');
      expect(created.payment_ref).toMatch(/^SUB-e1-/);
      expect(created.amount_cents).toBe(178800);
      // Checkout requests the real plan amount (test mode reduces it to $0.01 on dev).
      expect((createPaymentLink as jest.Mock).mock.calls[0][0]).toMatchObject({ amount: 1788 });
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
      expect(subUpdate.current_period_end.getTime()).toBe(NOW + 30 * 864e5);
      const enrUpdate = enrollment.update.mock.calls[0][0];
      expect(enrUpdate.enrollment_type).toBe('standard'); // drops the Week-0 gate
      expect(enrUpdate.tier).toBe('member');
      expect(enrUpdate.payment_status).toBe('paid');
      expect(enrUpdate.cohort_id).toBe('c-july');
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
