import { startCheckout } from '../subscriptionService';
import { Enrollment, Subscription, AccountCredit, Cohort } from '../../models';
import { findOrCreateCustomer, createPaymentLink } from '../paysimpleService';

jest.mock('../../config/env', () => ({ env: { paysimpleApiUser: 'u', paysimpleApiKey: 'k', paymentMode: 'test' } }));
jest.mock('../../models', () => ({
  Enrollment: { findByPk: jest.fn(), findAll: jest.fn() },
  Cohort: { findByPk: jest.fn(), findAll: jest.fn() },
  Subscription: { findAll: jest.fn(), findOne: jest.fn(), create: jest.fn() },
  AccountCredit: { findAll: jest.fn(), update: jest.fn() },
}));
jest.mock('../paysimpleService', () => ({ findOrCreateCustomer: jest.fn(), createPaymentLink: jest.fn(), getCustomerById: jest.fn() }));
jest.mock('../openHouseService', () => ({ isDemoCohortName: () => false }));
jest.mock('../enrollmentService', () => ({ retireRedundantExplorerAccounts: jest.fn() }));

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 30, 15);

describe('startCheckout: second-checkout guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Enrollment.findByPk as jest.Mock).mockResolvedValue({ id: 'e1', full_name: 'Ada Lovelace', email: 'ada@x.io', company: 'X', update: jest.fn() });
    (AccountCredit.findAll as jest.Mock).mockResolvedValue([]);
    (Cohort.findAll as jest.Mock).mockResolvedValue([]);
    (Subscription.findOne as jest.Mock).mockResolvedValue(null);
    (Subscription.create as jest.Mock).mockResolvedValue({});
    (findOrCreateCustomer as jest.Mock).mockResolvedValue({ Id: 42 });
    (createPaymentLink as jest.Mock).mockResolvedValue({ payment_link: 'https://pay.example/abc' });
  });

  it('refuses a member who paid yesterday, and never creates a payment link or a row', async () => {
    (Subscription.findAll as jest.Mock).mockResolvedValue([
      { plan: 'monthly', status: 'active', current_period_end: new Date(NOW + 29 * DAY), paysimple_schedule_id: null },
    ]);
    const r = await startCheckout('e1', 'monthly', NOW);
    expect(r).toMatchObject({ ok: false, reason: 'already_subscribed' });
    expect((r as any).message).toMatch(/already paid through/);
    expect(createPaymentLink).not.toHaveBeenCalled();
    expect(Subscription.create).not.toHaveBeenCalled();
    expect(Subscription.findAll).toHaveBeenCalledWith({ where: { enrollment_id: 'e1', status: 'active' } });
  });

  it('lets a member renew inside the 7-day window', async () => {
    (Subscription.findAll as jest.Mock).mockResolvedValue([
      { plan: 'monthly', status: 'active', current_period_end: new Date(NOW + 5 * DAY), paysimple_schedule_id: null },
    ]);
    const r = await startCheckout('e1', 'monthly', NOW);
    expect(r).toMatchObject({ ok: true, payment_link: 'https://pay.example/abc' });
  });

  it('lets a first-time buyer through', async () => {
    (Subscription.findAll as jest.Mock).mockResolvedValue([]);
    const r = await startCheckout('e1', 'annual', NOW);
    expect(r).toMatchObject({ ok: true });
  });

  it('refuses a member on a standing schedule, whatever the date', async () => {
    (Subscription.findAll as jest.Mock).mockResolvedValue([
      { plan: 'monthly', status: 'active', current_period_end: new Date(NOW + 2 * DAY), paysimple_schedule_id: '4511902' },
    ]);
    const r = await startCheckout('e1', 'monthly', NOW);
    expect(r).toMatchObject({ ok: false, reason: 'already_subscribed' });
    expect((r as any).message).toMatch(/renews automatically/);
    expect(createPaymentLink).not.toHaveBeenCalled();
  });
});
