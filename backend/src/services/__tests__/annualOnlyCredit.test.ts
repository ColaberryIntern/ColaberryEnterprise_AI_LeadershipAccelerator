/**
 * The Open House scholarship credit ($894, 50% off a year) may only reduce an
 * ANNUAL plan charge. A monthly checkout must neither preview, apply, nor
 * consume it — while ordinary credits (the $50 deposit) still work on both.
 */
import {
  creditUsableOnPlan, availableCreditRows, getAvailableCreditCents, planCreditPreview,
  consumeCreditsForSubscription, ANNUAL_ONLY_CREDIT_REASONS,
} from '../accountCreditService';
import { OPEN_HOUSE_SCHOLARSHIP_REASON, OPEN_HOUSE_SCHOLARSHIP_CENTS } from '../openHouseCreditService';
import { AccountCredit } from '../../models';

jest.mock('../../models', () => ({
  AccountCredit: { findAll: jest.fn(), findOne: jest.fn(), findOrCreate: jest.fn(), update: jest.fn() },
  Enrollment: {}, Cohort: {},
}));
jest.mock('../subscriptionService', () => ({ isNonPayingCohortName: () => false }));
jest.mock('../explorerGrowth/explorerProfileAtRegistration', () => ({ bridgeExplorerProfileAtRegistration: jest.fn() }));

const findAll = AccountCredit.findAll as jest.Mock;
const update = AccountCredit.update as jest.Mock;
const scholarship = { id: 's', amount_cents: OPEN_HOUSE_SCHOLARSHIP_CENTS, reason: OPEN_HOUSE_SCHOLARSHIP_REASON };
const deposit = { id: 'd', amount_cents: 5000, reason: 'open_house_deposit' };

beforeEach(() => jest.clearAllMocks());

describe('annual-only credits', () => {
  it('the scholarship reason is annual-only, and is $894', () => {
    expect(ANNUAL_ONLY_CREDIT_REASONS).toContain(OPEN_HOUSE_SCHOLARSHIP_REASON);
    expect(OPEN_HOUSE_SCHOLARSHIP_CENTS).toBe(178800 / 2);
  });

  it('creditUsableOnPlan: annual yes, monthly no, unrestricted with no plan', () => {
    expect(creditUsableOnPlan(OPEN_HOUSE_SCHOLARSHIP_REASON, 'annual')).toBe(true);
    expect(creditUsableOnPlan(OPEN_HOUSE_SCHOLARSHIP_REASON, 'monthly')).toBe(false);
    expect(creditUsableOnPlan(OPEN_HOUSE_SCHOLARSHIP_REASON)).toBe(true);
    expect(creditUsableOnPlan('open_house_deposit', 'monthly')).toBe(true);
  });

  it('a monthly checkout sees only the deposit; annual sees both', async () => {
    findAll.mockResolvedValue([scholarship, deposit]);
    expect((await availableCreditRows('e1', 'monthly')).map((r) => r.id)).toEqual(['d']);
    expect((await availableCreditRows('e1', 'annual')).map((r) => r.id)).toEqual(['s', 'd']);
    expect(await getAvailableCreditCents('e1', 'monthly')).toBe(5000);
    expect(await getAvailableCreditCents('e1')).toBe(OPEN_HOUSE_SCHOLARSHIP_CENTS + 5000);
  });

  it('previews $894 off the $1,788 annual plan and $0 off monthly', async () => {
    findAll.mockResolvedValue([scholarship]);
    expect((await planCreditPreview('e1', 178800, 'annual')).charge_after_cents).toBe(89400);
    expect((await planCreditPreview('e1', 19900, 'monthly')).applied_cents).toBe(0);
  });

  it('settling a MONTHLY subscription never consumes the scholarship', async () => {
    findAll.mockImplementation(async (q: { where: { applied_subscription_id?: string } }) =>
      (q.where.applied_subscription_id ? [] : [scholarship]));
    expect(await consumeCreditsForSubscription('e1', 'sub-m', 19800, Date.now(), 'monthly')).toBe(0);
    expect(update).not.toHaveBeenCalled();
    expect(await consumeCreditsForSubscription('e1', 'sub-a', 89400, Date.now(), 'annual')).toBe(89400);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'applied', applied_subscription_id: 'sub-a' }), { where: { id: ['s'] } });
  });
});
