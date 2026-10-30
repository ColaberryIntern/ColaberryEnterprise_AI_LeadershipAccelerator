/**
 * advancePeriodForScheduledPayment — a renewal must land on the member's
 * anniversary, which is the day they SIGNED UP.
 *
 * The rule, set 2026-10-30 when enrollment went rolling: sign up on the 3rd and
 * the membership renews on the 3rd, every month, or the 3rd each year on annual.
 *
 * The defect this covers: the renewal day was read from the period being advanced
 * past (`current_period_end`) rather than from the signup. That is invisible for
 * most of the month and wrong at the end of it. Sign up 1/31, February clamps to
 * 2/28, and every later month was then computed from the 28th — so the member
 * renewed on the 28th for good. PaySimple does not agree: `cadenceFor` maps day 31
 * to `LastofMonth`, so it keeps billing 3/31 and 4/30. Our record and the actual
 * charges would diverge from the third month on, silently, on the path that takes
 * money every month.
 *
 * This path had NO test coverage before this file.
 */
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../paysimpleService', () => ({ getPayment: jest.fn() }));
jest.mock('../paysimpleRecurring', () => ({
  createRecurringSchedule: jest.fn(),
  suspendRecurringSchedule: jest.fn(),
  assertStartDateNotPast: jest.fn(),
}));

import { sequelize } from '../../config/database';
import { advancePeriodForScheduledPayment } from '../subscriptionScheduleService';

const query = sequelize.query as jest.Mock;

/**
 * One subscription row, then a successful UPDATE. The service SELECTs first and
 * UPDATEs second, so the queue order matters.
 */
function givenSubscription(row: Record<string, unknown>) {
  query.mockReset();
  query.mockResolvedValueOnce([row]).mockResolvedValue([[], 1]);
}

/** The `:next` the service wrote, as an ISO string. */
function writtenNext(): string {
  const updateCall = query.mock.calls.find((c) => String(c[0]).includes('UPDATE subscriptions'));
  if (!updateCall) throw new Error('no UPDATE issued');
  return (updateCall[1] as { replacements: { next: string } }).replacements.next;
}

const base = {
  id: 'sub-1',
  plan: 'monthly',
  paysimple_payment_id: 'older-payment',
};

beforeEach(() => jest.clearAllMocks());

describe('the renewal lands on the signup anniversary', () => {
  it('signing up on the 3rd renews on the 3rd (happy path)', async () => {
    givenSubscription({
      ...base,
      started_at: '2026-11-03T15:00:00.000Z',
      current_period_end: '2026-12-03T15:00:00.000Z',
    });
    const r = await advancePeriodForScheduledPayment({ scheduleId: 's1', paymentId: 'p1' });
    expect(r.advanced).toBe(true);
    expect(writtenNext()).toBe('2027-01-03T15:00:00.000Z');
  });

  it('an end-of-month signup CLAMPS then RECOVERS, instead of drifting to the 28th', async () => {
    // Signed up 1/31. The period being advanced past already clamped to 2/28.
    // Reading the day from that period end would return 3/28 and stay there.
    givenSubscription({
      ...base,
      started_at: '2027-01-31T09:00:00.000Z',
      current_period_end: '2027-02-28T09:00:00.000Z',
    });
    await advancePeriodForScheduledPayment({ scheduleId: 's1', paymentId: 'p1' });
    expect(writtenNext()).toBe('2027-03-31T09:00:00.000Z'); // NOT 2027-03-28

    // ...and the month after that clamps again to a 30-day month.
    givenSubscription({
      ...base,
      started_at: '2027-01-31T09:00:00.000Z',
      current_period_end: '2027-03-31T09:00:00.000Z',
    });
    await advancePeriodForScheduledPayment({ scheduleId: 's1', paymentId: 'p2' });
    expect(writtenNext()).toBe('2027-04-30T09:00:00.000Z');
  });

  it('matches what PaySimple will actually bill for a day-31 member', async () => {
    // cadenceFor maps day 31 to LastofMonth, so the gateway charges the last day
    // of each month. Our record has to say the same thing or the two drift apart.
    for (const [periodEnd, expected] of [
      ['2027-04-30T09:00:00.000Z', '2027-05-31T09:00:00.000Z'],
      ['2027-05-31T09:00:00.000Z', '2027-06-30T09:00:00.000Z'],
    ]) {
      givenSubscription({ ...base, started_at: '2027-01-31T09:00:00.000Z', current_period_end: periodEnd });
      await advancePeriodForScheduledPayment({ scheduleId: 's1', paymentId: 'p-' + periodEnd });
      expect(writtenNext()).toBe(expected);
    }
  });

  it('advances an annual membership by a year, on the same date', async () => {
    givenSubscription({
      ...base,
      plan: 'annual',
      started_at: '2026-11-03T15:00:00.000Z',
      current_period_end: '2027-11-03T15:00:00.000Z',
    });
    await advancePeriodForScheduledPayment({ scheduleId: 's1', paymentId: 'p1' });
    expect(writtenNext()).toBe('2028-11-03T15:00:00.000Z');
  });

  it('falls back to the period-end day when started_at is missing (failure path)', async () => {
    // Older rows may have no signup recorded. That must never block a renewal; it
    // just reverts to the previous behavior for those rows.
    givenSubscription({ ...base, started_at: null, current_period_end: '2027-02-28T09:00:00.000Z' });
    const r = await advancePeriodForScheduledPayment({ scheduleId: 's1', paymentId: 'p1' });
    expect(r.advanced).toBe(true);
    expect(writtenNext()).toBe('2027-03-28T09:00:00.000Z');
  });

  it('ignores an unparseable started_at rather than throwing (boundary)', async () => {
    givenSubscription({ ...base, started_at: 'not-a-date', current_period_end: '2027-02-28T09:00:00.000Z' });
    await expect(advancePeriodForScheduledPayment({ scheduleId: 's1', paymentId: 'p1' }))
      .resolves.toMatchObject({ advanced: true });
    expect(writtenNext()).toBe('2027-03-28T09:00:00.000Z');
  });

  it('does not advance twice for the same payment (idempotency)', async () => {
    // A webhook retry is a retry, not a new period. Advancing again would hand the
    // member a free month and move every later renewal.
    givenSubscription({
      ...base,
      paysimple_payment_id: 'p1',
      started_at: '2026-11-03T15:00:00.000Z',
      current_period_end: '2026-12-03T15:00:00.000Z',
    });
    const r = await advancePeriodForScheduledPayment({ scheduleId: 's1', paymentId: 'p1' });
    expect(r).toMatchObject({ advanced: false, reason: 'already_applied' });
    expect(query.mock.calls.some((c) => String(c[0]).includes('UPDATE subscriptions'))).toBe(false);
  });

  it('reports a missing subscription instead of throwing (failure path)', async () => {
    query.mockReset();
    query.mockResolvedValueOnce([]);
    await expect(advancePeriodForScheduledPayment({ scheduleId: 'nope', paymentId: 'p1' }))
      .resolves.toMatchObject({ advanced: false, reason: 'no_subscription_for_schedule' });
  });
});
