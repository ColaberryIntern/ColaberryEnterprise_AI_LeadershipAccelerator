/**
 * scheduleSubscription must make the ledger agree with the gateway.
 *
 * Found live 2026-09-17: two members scheduled on 2026-09-01 were already past
 * their period end (30/31 Aug). The schedule correctly started on the NEXT
 * boundary (30 Sep), writing the elapsed period off, but the row kept the
 * August date, so the renewal reminder read them as lapsed and mailed a pay
 * link on 6 and 7 September while PaySimple was set to collect on the 30th:
 * pay the link and the member is charged twice for one period.
 */
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../paysimpleService', () => ({ getPayment: jest.fn() }));
jest.mock('../paysimpleRecurring', () => ({
  createRecurringSchedule: jest.fn(),
  suspendRecurringSchedule: jest.fn(),
  assertStartDateNotPast: jest.fn(),
}));

import { sequelize } from '../../config/database';
import { getPayment } from '../paysimpleService';
import { createRecurringSchedule, assertStartDateNotPast } from '../paysimpleRecurring';
import { scheduleSubscription } from '../subscriptionScheduleService';

const query = sequelize.query as jest.Mock;
const NOW = Date.UTC(2026, 8, 1, 12); // 2026-09-01T12:00Z

const candidate = (firstChargeOn: Date) => ({
  subscriptionId: 'sub-1',
  plan: 'monthly' as const,
  amount: 199,
  firstChargeOn,
  paysimplePaymentId: '155176955',
  email: 'rogation@example.com',
} as any);

beforeEach(() => {
  jest.clearAllMocks();
  (getPayment as jest.Mock).mockResolvedValue({ AccountId: 991, CustomerId: 43634921 });
  (createRecurringSchedule as jest.Mock).mockResolvedValue({ Id: 4511911 });
  query.mockResolvedValue([[], 1]);
});

describe('scheduleSubscription keeps current_period_end in step with the first charge', () => {
  it('writes the first charge date into current_period_end via GREATEST, so a written-off period is not read as lapsed', async () => {
    const first = new Date(Date.UTC(2026, 8, 30, 6));
    const r = await scheduleSubscription(candidate(first), { nowMs: NOW });
    expect(r).toEqual({ scheduled: true, scheduleId: '4511911' });

    const [sql, opts] = query.mock.calls.at(-1);
    expect(sql).toMatch(/current_period_end = GREATEST\(current_period_end, :firstCharge::timestamptz\)/);
    expect(opts.replacements.firstCharge).toBe(first.toISOString());
    expect(opts.replacements.sid).toBe('4511911');
    expect(opts.replacements.cid).toBe('43634921');
    expect(opts.replacements.id).toBe('sub-1');
    // Still only touches an active, not-yet-scheduled row (idempotent on re-run).
    expect(sql).toMatch(/status = 'active' AND paysimple_schedule_id IS NULL/);
  });

  it('refuses a first charge in the past before touching the gateway (delegated to assertStartDateNotPast)', async () => {
    (assertStartDateNotPast as jest.Mock).mockImplementationOnce(() => { throw new Error('start date is in the past'); });
    await expect(scheduleSubscription(candidate(new Date(Date.UTC(2026, 7, 30))), { nowMs: NOW })).rejects.toThrow(/past/);
    expect(createRecurringSchedule).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it('dry run creates nothing and writes nothing', async () => {
    const r = await scheduleSubscription(candidate(new Date(Date.UTC(2026, 8, 30, 6))), { nowMs: NOW, dryRun: true });
    expect(r).toEqual({ scheduled: false, reason: 'dry run' });
    expect(createRecurringSchedule).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it('surfaces a payment that yields no account instead of scheduling against nothing', async () => {
    (getPayment as jest.Mock).mockResolvedValue({});
    await expect(scheduleSubscription(candidate(new Date(Date.UTC(2026, 8, 30, 6))), { nowMs: NOW })).rejects.toThrow(/AccountId\/CustomerId/);
    expect(createRecurringSchedule).not.toHaveBeenCalled();
  });
});
