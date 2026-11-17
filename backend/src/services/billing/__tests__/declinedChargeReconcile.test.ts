/**
 * The decline reconcile: catch a declined scheduled charge that never reached the book.
 *
 * Found 2026-11-17: five members declined on 28-30 Sep / 28-30 Oct, before the
 * webhook fix (#3532) existed, and stayed `active` with $0 collected. These pin that
 * a lapsed row whose newest charge failed is marked past_due with PaySimple's reason,
 * that a member paid on a newer row is never marked, and that an orphan schedule is
 * only suspended when that newer row provably exists.
 */
jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../paysimpleService', () => ({ getPayment: jest.fn(), listRecentPayments: jest.fn() }));
jest.mock('../../subscriptionScheduleService', () => {
  const actual = jest.requireActual('../../subscriptionScheduleService');
  return {
    scheduledChargeOutcome: actual.scheduledChargeOutcome,
    markPastDueForSchedule: jest.fn(),
    suspendScheduleForSubscription: jest.fn(),
  };
});

import { sequelize } from '../../../config/database';
import { getPayment, listRecentPayments } from '../../paysimpleService';
import { markPastDueForSchedule, suspendScheduleForSubscription } from '../../subscriptionScheduleService';
import {
  decideReconcile, latestChargeBySchedule, reconcileDeclinedScheduledCharges, suspendOrphanSchedule,
  RECONCILE_CANDIDATES_SQL,
} from '../declinedChargeReconcile';

const query = sequelize.query as unknown as jest.Mock;
const list = listRecentPayments as jest.Mock;
const get = getPayment as jest.Mock;
const markPastDue = markPastDueForSchedule as jest.Mock;
const suspend = suspendScheduleForSubscription as jest.Mock;

const SONYA = { id: 'sub-sonya', enrollment_id: 'e1', schedule_id: '4511898', period_end: '2026-09-30', full_name: 'Sonya Parker', email: 's@x', covered: false };
const JUDE = { id: 'sub-jude', enrollment_id: 'e2', schedule_id: '4511913', period_end: '2026-10-28', full_name: 'Jude M', email: 'j@x', covered: false };
const ORPHAN = { id: 'sub-q-old', enrollment_id: 'e3', schedule_id: '4511909', period_end: '2026-09-30', full_name: 'Q N', email: 'q@x', covered: true };

const pay = (Id: number, sched: number, date: string, Status: string) => ({ Id, Amount: 199, RecurringScheduleId: sched, PaymentDate: date, Status, FailureData: null });

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('latestChargeBySchedule', () => {
  it('keeps the newest charge per schedule and drops non-scheduled payments', () => {
    const m = latestChargeBySchedule([
      pay(1, 4511898, '2026-09-30T00:00:00Z', 'Failed'),
      pay(2, 4511898, '2026-10-30T00:00:00Z', 'Failed'),
      pay(3, 4511913, '2026-09-28T00:00:00Z', 'Settled'),
      pay(4, 4511913, '2026-10-28T00:00:00Z', 'Failed'),
      { ...pay(5, 0, '2026-11-01T00:00:00Z', 'Settled'), RecurringScheduleId: null },
    ] as any);
    expect(m.get('4511898')?.Id).toBe(2);
    expect(m.get('4511913')?.Id).toBe(4);
    expect(m.size).toBe(2);
  });
});

describe('decideReconcile', () => {
  it('marks a lapsed row whose newest charge failed', () => {
    expect(decideReconcile({ covered: false }, pay(1, 1, '2026-10-30', 'Failed') as any)).toBe('mark_past_due');
  });
  it('never marks a member paid on a newer row, even with a failed charge', () => {
    expect(decideReconcile({ covered: true }, pay(1, 1, '2026-10-30', 'Failed') as any)).toBe('covered_by_newer_row');
  });
  it('leaves a row whose newest charge succeeded to a person', () => {
    expect(decideReconcile({ covered: false }, pay(1, 1, '2026-10-30', 'Settled') as any)).toBe('latest_charge_succeeded');
  });
  it('does nothing without a charge, or on an unrecognized status', () => {
    expect(decideReconcile({ covered: false }, undefined)).toBe('no_charge_seen');
    expect(decideReconcile({ covered: false }, pay(1, 1, '2026-10-30', 'Voided') as any)).toBe('latest_charge_unrecognized');
  });
});

describe('RECONCILE_CANDIDATES_SQL', () => {
  it('only reads active, scheduled, paid rows whose period has ended', () => {
    expect(RECONCILE_CANDIDATES_SQL).toContain("s.status = 'active'");
    expect(RECONCILE_CANDIDATES_SQL).toContain("s.plan <> 'comp'");
    expect(RECONCILE_CANDIDATES_SQL).toContain('s.paysimple_schedule_id IS NOT NULL');
    expect(RECONCILE_CANDIDATES_SQL).toContain('s.current_period_end < now()');
  });
});

describe('reconcileDeclinedScheduledCharges', () => {
  const gateway = [
    pay(11, 4511898, '2026-09-30T00:00:00Z', 'Failed'),
    pay(12, 4511898, '2026-10-30T00:00:00Z', 'Failed'),
    pay(21, 4511913, '2026-09-28T00:00:00Z', 'Settled'),
    pay(22, 4511913, '2026-10-28T00:00:00Z', 'Failed'),
    pay(31, 4511909, '2026-10-30T00:00:00Z', 'Failed'),
  ];

  beforeEach(() => {
    query.mockResolvedValue([SONYA, JUDE, ORPHAN]);
    list.mockResolvedValue(gateway);
    get.mockImplementation(async (id: number) => ({
      ...gateway.find((p) => p.Id === id),
      FailureData: { Code: id === 12 ? '4046' : '4051', Description: id === 12 ? 'Closed account' : 'Insufficient funds' },
    }));
    markPastDue.mockResolvedValue(true);
  });

  it('dry run names every row and changes nothing', async () => {
    const r = await reconcileDeclinedScheduledCharges({ since: new Date('2026-09-01T00:00:00Z') });
    expect(markPastDue).not.toHaveBeenCalled();
    expect(r.execute).toBe(false);
    expect(r.rows.map((x) => [x.subscriptionId, x.action])).toEqual([
      ['sub-sonya', 'mark_past_due'], ['sub-jude', 'mark_past_due'], ['sub-q-old', 'covered_by_newer_row'],
    ]);
    expect(r.rows[0].reason).toContain('Closed account');
    expect(r.rows[0].reason).toContain('12');
  });

  it('execute marks the two declined rows with the decline reason, and never the covered one', async () => {
    const r = await reconcileDeclinedScheduledCharges({ execute: true, since: new Date('2026-09-01T00:00:00Z') });
    expect(markPastDue).toHaveBeenCalledTimes(2);
    expect(markPastDue).toHaveBeenCalledWith('4511898', expect.stringContaining('Closed account'));
    expect(markPastDue).toHaveBeenCalledWith('4511913', expect.stringContaining('Insufficient funds'));
    expect(markPastDue).not.toHaveBeenCalledWith('4511909', expect.anything());
    expect(r.rows.filter((x) => x.marked)).toHaveLength(2);
  });

  it('a second run reports nothing moved (idempotency rides markPastDueForSchedule)', async () => {
    markPastDue.mockResolvedValue(false);
    const r = await reconcileDeclinedScheduledCharges({ execute: true });
    expect(r.rows.filter((x) => x.marked)).toHaveLength(0);
  });

  it('defaults to a 45-day look-back', async () => {
    const nowMs = Date.parse('2026-11-17T14:00:00Z');
    const r = await reconcileDeclinedScheduledCharges({ nowMs });
    expect(list).toHaveBeenCalledWith({ since: new Date(nowMs - 45 * 86_400_000) });
    expect(r.since).toBe('2026-10-03T14:00:00.000Z');
  });

  it('a PaySimple error on one row is recorded on that row and the rest still run', async () => {
    get.mockRejectedValueOnce(Object.assign(new Error('timeout'), { errorClass: 'UpstreamTimeout' }));
    const r = await reconcileDeclinedScheduledCharges({ execute: true });
    expect(r.rows[0].error).toBe('timeout');
    expect(markPastDue).toHaveBeenCalledTimes(1);
    expect(markPastDue).toHaveBeenCalledWith('4511913', expect.any(String));
  });

  it('asks PaySimple nothing when no row has lapsed', async () => {
    query.mockResolvedValue([]);
    const r = await reconcileDeclinedScheduledCharges({ execute: true });
    expect(list).not.toHaveBeenCalled();
    expect(r.rows).toEqual([]);
  });
});

describe('suspendOrphanSchedule', () => {
  beforeEach(() => query.mockResolvedValue([SONYA, JUDE, ORPHAN]));

  it('dry run names the orphan and suspends nothing', async () => {
    const r = await suspendOrphanSchedule('4511909');
    expect(r).toEqual({ scheduleId: '4511909', subscriptionId: 'sub-q-old', outcome: 'would_suspend' });
    expect(suspend).not.toHaveBeenCalled();
  });

  it('execute suspends a covered schedule', async () => {
    suspend.mockResolvedValue({ suspended: true });
    const r = await suspendOrphanSchedule('4511909', { execute: true });
    expect(suspend).toHaveBeenCalledWith('sub-q-old', '4511909');
    expect(r.outcome).toBe('suspended');
  });

  it('refuses a schedule that is a member\'s only billing, so nobody silently stops being charged', async () => {
    const r = await suspendOrphanSchedule('4511898', { execute: true });
    expect(r.outcome).toBe('refused');
    expect(suspend).not.toHaveBeenCalled();
  });

  it('refuses an unknown or malformed schedule id', async () => {
    expect((await suspendOrphanSchedule('999', { execute: true })).outcome).toBe('refused');
    expect((await suspendOrphanSchedule('4511909; drop', { execute: true })).outcome).toBe('refused');
    expect(suspend).not.toHaveBeenCalled();
  });

  it('reports a gateway failure as failed', async () => {
    suspend.mockResolvedValue({ suspended: false, error: 'gateway 500' });
    const r = await suspendOrphanSchedule('4511909', { execute: true });
    expect(r).toMatchObject({ outcome: 'failed', reason: 'gateway 500' });
  });
});
