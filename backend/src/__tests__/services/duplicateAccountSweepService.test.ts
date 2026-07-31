/**
 * Regression suite for the duplicate-account point-shadowing bug found and
 * manually fixed 5 times overnight (2026-07-30/31: Sonya Parker, Britiana
 * Akhile, Martin Mungai, Marcus Zeno, Jude Mofunanya). Locks in the
 * detection query and the conservative merge rules (skip on event_key
 * collision, skip on a real Subscription payment) so a future change can't
 * silently reintroduce blind auto-merging of ambiguous or financially real
 * cases.
 */

jest.spyOn(console, 'error').mockImplementation(() => undefined);
jest.spyOn(console, 'log').mockImplementation(() => undefined);

jest.mock('../../models', () => ({
  __esModule: true,
  Enrollment: { findAll: jest.fn(), update: jest.fn() },
  CommunityMember: {},
  StudentPointsEvent: { findAll: jest.fn(), sum: jest.fn(), update: jest.fn() },
  AccountCredit: { update: jest.fn() },
  Subscription: { findAll: jest.fn() },
}));

import { Enrollment, StudentPointsEvent, AccountCredit, Subscription } from '../../models';
import { findShadowedAccounts, mergeShadowedAccount, runDuplicateAccountSweep } from '../../services/duplicateAccountSweepService';

const enrFindAll = Enrollment.findAll as jest.Mock;
const enrUpdate = Enrollment.update as jest.Mock;
const eventsFindAll = StudentPointsEvent.findAll as jest.Mock;
const eventsSum = StudentPointsEvent.sum as jest.Mock;
const eventsUpdate = StudentPointsEvent.update as jest.Mock;
const creditsUpdate = AccountCredit.update as jest.Mock;
const subsFindAll = Subscription.findAll as jest.Mock;

function enr(id: string, email: string, overrides: Partial<any> = {}) {
  return {
    id,
    email,
    full_name: 'Test Student',
    enrollment_type: 'standard',
    payment_status: 'paid',
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  eventsUpdate.mockResolvedValue([1]);
  creditsUpdate.mockResolvedValue([0]);
  enrUpdate.mockResolvedValue([1]);
  subsFindAll.mockResolvedValue([]);
});

describe('findShadowedAccounts', () => {
  it('flags a real shadowing case: winner has fewer points than a duplicate under the same email', async () => {
    const real = enr('real-id', 'jude@example.com', { enrollment_type: 'standard', payment_status: 'paid', created_at: '2026-07-01T00:00:00Z' });
    const dupe = enr('dupe-id', 'jude@example.com', { enrollment_type: 'explorer', payment_status: 'pending', created_at: '2026-06-01T00:00:00Z' });
    enrFindAll.mockResolvedValue([real, dupe]);
    eventsSum.mockImplementation(({ where }: any) => Promise.resolve(where.enrollment_id === 'real-id' ? 20 : 160));

    const result = await findShadowedAccounts();

    expect(result).toHaveLength(1);
    expect(result[0].winnerId).toBe('real-id');
    expect(result[0].winnerPoints).toBe(20);
    expect(result[0].shadowRows).toEqual([{ id: 'dupe-id', points: 160 }]);
  });

  it('does not flag when the winning account already has more points than the duplicate', async () => {
    const real = enr('real-id', 'ok@example.com', { created_at: '2026-07-01T00:00:00Z' });
    const dupe = enr('dupe-id', 'ok@example.com', { enrollment_type: 'explorer', payment_status: 'pending', created_at: '2026-06-01T00:00:00Z' });
    enrFindAll.mockResolvedValue([real, dupe]);
    eventsSum.mockImplementation(({ where }: any) => Promise.resolve(where.enrollment_id === 'real-id' ? 100 : 5));

    const result = await findShadowedAccounts();

    expect(result).toHaveLength(0);
  });

  it('ignores emails with only one active enrollment row', async () => {
    enrFindAll.mockResolvedValue([enr('only-id', 'single@example.com')]);

    const result = await findShadowedAccounts();

    expect(result).toHaveLength(0);
    expect(eventsSum).not.toHaveBeenCalled();
  });
});

describe('mergeShadowedAccount', () => {
  const entry = {
    email: 'jude@example.com',
    name: 'Jude Mofunanya',
    winnerId: 'real-id',
    winnerPoints: 20,
    shadowRows: [{ id: 'dupe-id', points: 160 }],
  };

  it('moves points and unclaimed credit, then withdraws the duplicate, when there is no collision or real payment', async () => {
    eventsFindAll.mockImplementation(({ where }: any) =>
      Promise.resolve(where.enrollment_id === entry.winnerId ? [{ event_key: 'card:1' }] : [{ event_key: 'card:2' }, { event_key: 'card:3' }]),
    );
    eventsUpdate.mockResolvedValue([11]);
    creditsUpdate.mockResolvedValue([1]);

    const outcome = await mergeShadowedAccount(entry);

    expect(outcome.flaggedCollision).toEqual([]);
    expect(outcome.flaggedRealPayment).toEqual([]);
    expect(outcome.merged).toEqual([{ shadowId: 'dupe-id', pointsMoved: 11, creditsMoved: 1, withdrawn: true }]);
    expect(eventsUpdate).toHaveBeenCalledWith({ enrollment_id: entry.winnerId }, { where: { enrollment_id: 'dupe-id' } });
    expect(enrUpdate).toHaveBeenCalledWith({ status: 'withdrawn' }, { where: { id: 'dupe-id' } });
  });

  it('skips the merge and flags for review on an event_key collision, without withdrawing the duplicate', async () => {
    eventsFindAll.mockImplementation(({ where }: any) =>
      Promise.resolve(where.enrollment_id === entry.winnerId ? [{ event_key: 'daily_streak:2026-07-29' }] : [{ event_key: 'daily_streak:2026-07-29' }]),
    );

    const outcome = await mergeShadowedAccount(entry);

    expect(outcome.flaggedCollision).toEqual(['dupe-id']);
    expect(outcome.merged).toEqual([]);
    expect(eventsUpdate).not.toHaveBeenCalled();
    expect(enrUpdate).not.toHaveBeenCalled();
  });

  it('skips the merge and flags for review when the duplicate holds a real, paid Subscription', async () => {
    eventsFindAll.mockImplementation(({ where }: any) => Promise.resolve(where.enrollment_id === entry.winnerId ? [] : [{ event_key: 'card:2' }]));
    subsFindAll.mockResolvedValue([{ status: 'active', paysimple_payment_id: '155192015' }]);

    const outcome = await mergeShadowedAccount(entry);

    expect(outcome.flaggedRealPayment).toEqual(['dupe-id']);
    expect(outcome.merged).toEqual([]);
    expect(eventsUpdate).not.toHaveBeenCalled();
    expect(enrUpdate).not.toHaveBeenCalled();
  });

  it('ignores a Subscription on the duplicate that has no real payment id (an abandoned checkout attempt)', async () => {
    eventsFindAll.mockImplementation(({ where }: any) => Promise.resolve(where.enrollment_id === entry.winnerId ? [] : [{ event_key: 'card:2' }]));
    subsFindAll.mockResolvedValue([{ status: 'pending', paysimple_payment_id: null }]);

    const outcome = await mergeShadowedAccount(entry);

    expect(outcome.flaggedRealPayment).toEqual([]);
    expect(outcome.merged).toHaveLength(1);
  });
});

describe('runDuplicateAccountSweep', () => {
  it('dry run finds shadowed accounts but writes nothing', async () => {
    const real = enr('real-id', 'jude@example.com');
    const dupe = enr('dupe-id', 'jude@example.com', { enrollment_type: 'explorer', payment_status: 'pending' });
    enrFindAll.mockResolvedValue([real, dupe]);
    eventsSum.mockImplementation(({ where }: any) => Promise.resolve(where.enrollment_id === 'real-id' ? 20 : 160));

    const result = await runDuplicateAccountSweep({ dryRun: true });

    expect(result.scanned).toBe(1);
    expect(result.shadowed).toHaveLength(1);
    expect(result.merges).toEqual([]);
    expect(eventsUpdate).not.toHaveBeenCalled();
    expect(enrUpdate).not.toHaveBeenCalled();
  });

  it('a real run finds and merges shadowed accounts', async () => {
    const real = enr('real-id', 'jude@example.com');
    const dupe = enr('dupe-id', 'jude@example.com', { enrollment_type: 'explorer', payment_status: 'pending' });
    enrFindAll.mockResolvedValue([real, dupe]);
    eventsSum.mockImplementation(({ where }: any) => Promise.resolve(where.enrollment_id === 'real-id' ? 20 : 160));
    eventsFindAll.mockImplementation(({ where }: any) => Promise.resolve(where.enrollment_id === 'real-id' ? [] : [{ event_key: 'card:2' }]));
    eventsUpdate.mockResolvedValue([11]);

    const result = await runDuplicateAccountSweep({ dryRun: false });

    expect(result.scanned).toBe(1);
    expect(result.merges).toHaveLength(1);
    expect(result.merges[0].merged).toHaveLength(1);
    expect(enrUpdate).toHaveBeenCalledWith({ status: 'withdrawn' }, { where: { id: 'dupe-id' } });
  });

  it('a clean roster with no shadowing produces no merges and no writes', async () => {
    enrFindAll.mockResolvedValue([enr('only-id', 'clean@example.com')]);

    const result = await runDuplicateAccountSweep({ dryRun: false });

    expect(result.scanned).toBe(0);
    expect(result.merges).toEqual([]);
    expect(eventsUpdate).not.toHaveBeenCalled();
  });
});
