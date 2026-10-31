/**
 * Routing PaySimple payment webhooks that came from a standing schedule.
 *
 * Before 2026-10-31, `payment_failed` for a scheduled charge did nothing, because
 * the controller only acted on our checkout reference and a scheduled charge has
 * none. These pin that a failure now reaches the book and a success still advances.
 */
jest.mock('../../paysimpleService', () => ({ getPayment: jest.fn() }));
jest.mock('../../subscriptionScheduleService', () => ({
  applyScheduledCharge: jest.fn(),
  markPastDueForSchedule: jest.fn(),
}));

import { getPayment } from '../../paysimpleService';
import { applyScheduledCharge, markPastDueForSchedule } from '../../subscriptionScheduleService';
import { handleScheduledChargeEvent, failureReasonOf } from '../scheduledChargeWebhook';

const get = getPayment as jest.Mock;
const apply = applyScheduledCharge as jest.Mock;
const markPastDue = markPastDueForSchedule as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('handleScheduledChargeEvent', () => {
  it('passes a created charge and its status through to the book (happy path)', async () => {
    get.mockResolvedValue({ Id: 1, Status: 'Authorized', Amount: 199, RecurringScheduleId: 4511899 });
    apply.mockResolvedValue({ outcome: 'success', advanced: true, markedPastDue: false, subscriptionId: 'sub-1' });
    const r = await handleScheduledChargeEvent('payment_created', 1);
    expect(apply).toHaveBeenCalledWith(expect.objectContaining({ scheduleId: '4511899', paymentId: '1', status: 'Authorized' }));
    expect(r).toMatchObject({ handled: true, advanced: true, scheduleId: '4511899' });
  });

  it('a created-but-declined charge carries the decline reason', async () => {
    get.mockResolvedValue({
      Id: 2, Status: 'Failed', Amount: 199, RecurringScheduleId: 4511901,
      FailureData: { Code: '4046', Description: 'Closed account' },
    });
    apply.mockResolvedValue({ outcome: 'failed', advanced: false, markedPastDue: true });
    const r = await handleScheduledChargeEvent('payment_created', 2);
    expect(apply).toHaveBeenCalledWith(expect.objectContaining({ status: 'Failed', failureReason: 'Closed account' }));
    expect(r).toMatchObject({ handled: true, markedPastDue: true });
  });

  it.each(['payment_failed', 'payment_returned'] as const)(
    '%s marks the schedule past_due even if the payment still reads as live', async (evt) => {
      // The payment object can lag the event that reported it failing.
      get.mockResolvedValue({ Id: 3, Status: 'Authorized', Amount: 199, RecurringScheduleId: 4511898 });
      markPastDue.mockResolvedValue(true);
      const r = await handleScheduledChargeEvent(evt, 3, 'Insufficient funds');
      expect(markPastDue).toHaveBeenCalledWith('4511898', expect.stringContaining(evt));
      expect(apply).not.toHaveBeenCalled();
      expect(r).toMatchObject({ handled: true, outcome: 'failed', advanced: false, markedPastDue: true });
    },
  );

  it('leaves a non-scheduled payment to the controller', async () => {
    get.mockResolvedValue({ Id: 4, Status: 'Failed', Amount: 4500, RecurringScheduleId: null });
    const r = await handleScheduledChargeEvent('payment_failed', 4);
    expect(r).toEqual({ handled: false });
    expect(markPastDue).not.toHaveBeenCalled();
  });

  it('does nothing without a payment id (boundary)', async () => {
    expect(await handleScheduledChargeEvent('payment_failed', undefined)).toEqual({ handled: false });
    expect(get).not.toHaveBeenCalled();
  });

  it('PaySimple unreachable: logs and hands back, never throws (failure path)', async () => {
    get.mockRejectedValue(Object.assign(new Error('timeout'), { errorClass: 'TimeoutError' }));
    await expect(handleScheduledChargeEvent('payment_failed', 5)).resolves.toEqual({ handled: false });
    expect(markPastDue).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('scheduled_charge_lookup_failed'));
  });

  it('logs loudly when a status is not recognized', async () => {
    get.mockResolvedValue({ Id: 6, Status: 'Weird', Amount: 199, RecurringScheduleId: 7 });
    apply.mockResolvedValue({ outcome: 'ignore', advanced: false, markedPastDue: false, reason: 'unrecognized_status:Weird' });
    await handleScheduledChargeEvent('payment_created', 6);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('scheduled_charge_unrecognized_status'));
  });
});

describe('failureReasonOf', () => {
  it('prefers the card decline, then the bank return text, then the event', () => {
    expect(failureReasonOf({ FailureData: { Description: 'Insufficient funds' }, ProviderAuthCode: 'x' })).toBe('Insufficient funds');
    expect(failureReasonOf({ FailureData: null, ProviderAuthCode: "Balance is sufficient but can't be released" }))
      .toContain('Balance is sufficient');
    expect(failureReasonOf({}, 'from event')).toBe('from event');
    expect(failureReasonOf({ Status: 'Returned' })).toBe('Returned');
  });
});
