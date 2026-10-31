/**
 * A declined scheduled charge must never advance a member's period.
 *
 * Found live 2026-10-31: a declined card is still a PaySimple payment carrying a
 * `RecurringScheduleId`, and `advancePeriodForScheduledPayment` advanced on any such
 * payment without reading its status. Six members declined on 28-30 Oct
 * (insufficient funds, closed account, card reported lost). `markPastDueForSchedule`
 * existed for exactly this and nothing called it.
 */
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../paysimpleService', () => ({ getPayment: jest.fn() }));
jest.mock('../paysimpleRecurring', () => ({
  createRecurringSchedule: jest.fn(),
  suspendRecurringSchedule: jest.fn(),
  assertStartDateNotPast: jest.fn(),
}));

import { sequelize } from '../../config/database';
import { scheduledChargeOutcome, applyScheduledCharge } from '../subscriptionScheduleService';

const query = sequelize.query as jest.Mock;
const sqlOf = (c: unknown[]) => String(c[0]);
const periodUpdates = () => query.mock.calls.filter((c) => sqlOf(c).includes('SET current_period_end'));
const pastDueUpdates = () => query.mock.calls.filter((c) => sqlOf(c).includes("SET status = 'past_due'"));

beforeEach(() => query.mockReset());

describe('scheduledChargeOutcome', () => {
  it.each(['Failed', 'Returned', 'ReverseNSF', 'ChargeBack', 'Reversed'])('%s is a failure', (s) => {
    expect(scheduledChargeOutcome(s)).toBe('failed');
  });

  it.each(['Authorized', 'Pending', 'Posted', 'Settled'])('%s is a live charge', (s) => {
    expect(scheduledChargeOutcome(s)).toBe('success');
  });

  it('ignores case and stray whitespace (boundary)', () => {
    expect(scheduledChargeOutcome('  failed ')).toBe('failed');
    expect(scheduledChargeOutcome('SETTLED')).toBe('success');
  });

  it.each([undefined, null, '', 'Voided', 'RefundSettled', 'SomethingNew'])(
    'treats %p as neither, so nothing is written on a guess', (s) => {
      expect(scheduledChargeOutcome(s as any)).toBe('ignore');
    },
  );
});

describe('applyScheduledCharge', () => {
  it('advances the period on a live charge (happy path)', async () => {
    query
      .mockResolvedValueOnce([{
        id: 'sub-1', plan: 'monthly', paysimple_payment_id: 'older',
        started_at: '2026-09-30T06:00:00.000Z', current_period_end: '2026-10-30T06:00:00.000Z',
      }])
      .mockResolvedValue([[], 1]);
    const r = await applyScheduledCharge({ scheduleId: '4511899', paymentId: 'p1', status: 'Authorized' });
    expect(r).toMatchObject({ outcome: 'success', advanced: true, markedPastDue: false });
    expect(periodUpdates()).toHaveLength(1);
    expect(pastDueUpdates()).toHaveLength(0);
  });

  it('a successful charge clears the failure note a past_due row carried', async () => {
    query
      .mockResolvedValueOnce([{
        id: 'sub-1', plan: 'monthly', paysimple_payment_id: 'failed-one',
        started_at: '2026-09-30T06:00:00.000Z', current_period_end: '2026-10-30T06:00:00.000Z',
      }])
      .mockResolvedValue([[], 1]);
    await applyScheduledCharge({ scheduleId: '4511898', paymentId: 'p2', status: 'Settled' });
    expect(sqlOf(periodUpdates()[0])).toContain("CASE WHEN status = 'past_due' THEN NULL ELSE cancel_reason END");
  });

  it('marks a declined charge past_due and does NOT advance (the 2026-10-30 defect)', async () => {
    query.mockResolvedValue([[], 1]);
    const r = await applyScheduledCharge({
      scheduleId: '4511898', paymentId: '9001', status: 'Failed', failureReason: 'Closed account',
    });
    expect(r).toMatchObject({ outcome: 'failed', advanced: false, markedPastDue: true, reason: 'marked_past_due' });
    expect(periodUpdates()).toHaveLength(0);
    expect(pastDueUpdates()).toHaveLength(1);
    const { replacements } = pastDueUpdates()[0][1] as { replacements: { sid: string; r: string } };
    expect(replacements.sid).toBe('4511898');
    expect(replacements.r).toContain('9001');
    expect(replacements.r).toContain('Closed account');
  });

  it('only moves an active row, so a redelivered failure changes nothing (idempotency)', async () => {
    query.mockResolvedValueOnce([[], 1]).mockResolvedValueOnce([[], 0]);
    const first = await applyScheduledCharge({ scheduleId: 's', paymentId: 'p', status: 'Failed' });
    const second = await applyScheduledCharge({ scheduleId: 's', paymentId: 'p', status: 'Failed' });
    expect(first.markedPastDue).toBe(true);
    expect(second).toMatchObject({ markedPastDue: false, reason: 'not_active_or_unmatched' });
    pastDueUpdates().forEach((c) => expect(sqlOf(c)).toContain("status = 'active'"));
  });

  it('writes nothing for an unrecognized or missing status (failure path)', async () => {
    const r = await applyScheduledCharge({ scheduleId: 's', paymentId: 'p', status: undefined });
    expect(r).toMatchObject({ outcome: 'ignore', advanced: false, markedPastDue: false, reason: 'unrecognized_status:missing' });
    expect(query).not.toHaveBeenCalled();
  });

  it('records a placeholder when PaySimple gives no reason (boundary)', async () => {
    query.mockResolvedValue([[], 1]);
    await applyScheduledCharge({ scheduleId: 's', paymentId: 'p', status: 'ReverseNSF', failureReason: null });
    const { replacements } = pastDueUpdates()[0][1] as { replacements: { r: string } };
    expect(replacements.r).toContain('no reason given');
  });
});
