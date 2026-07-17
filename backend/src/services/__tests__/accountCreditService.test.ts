import {
  MIN_CHARGE_CENTS, selectCreditsUpTo, creditApplyTarget,
  getAvailableCreditCents, availableCreditRows, planCreditPreview,
  grantCredit, consumeCreditsForSubscription,
} from '../accountCreditService';
import { AccountCredit } from '../../models';

jest.mock('../../models', () => ({
  AccountCredit: { findAll: jest.fn(), findOne: jest.fn(), findOrCreate: jest.fn(), update: jest.fn() },
}));

const NOW = Date.UTC(2026, 6, 17, 12);

describe('accountCreditService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('pure selection', () => {
    it('creditApplyTarget keeps at least the $1 PaySimple floor', () => {
      expect(creditApplyTarget(19900)).toBe(19900 - MIN_CHARGE_CENTS);
      expect(creditApplyTarget(50)).toBe(0); // charge below the floor → nothing applicable
    });

    it('selectCreditsUpTo takes whole rows oldest-first within the target', () => {
      const rows = [{ id: 'a', amount_cents: 5000 }, { id: 'b', amount_cents: 5000 }];
      // $50 credit vs the $199 monthly target → full $50 applies.
      expect(selectCreditsUpTo(rows.slice(0, 1), creditApplyTarget(19900))).toEqual({ creditIds: ['a'], appliedCents: 5000 });
      // Two $50 credits vs $199 → both apply ($100).
      expect(selectCreditsUpTo(rows, creditApplyTarget(19900))).toEqual({ creditIds: ['a', 'b'], appliedCents: 10000 });
    });

    it('never overshoots the target — a row that would exceed it is skipped, not split', () => {
      const rows = [{ id: 'big', amount_cents: 5000 }, { id: 'small', amount_cents: 100 }];
      // target 200: the $50 row overflows and is skipped; the $1 row fits.
      expect(selectCreditsUpTo(rows, 200)).toEqual({ creditIds: ['small'], appliedCents: 100 });
    });

    it('ignores non-positive rows', () => {
      expect(selectCreditsUpTo([{ id: 'z', amount_cents: 0 }], 10000)).toEqual({ creditIds: [], appliedCents: 0 });
    });
  });

  describe('balance reads', () => {
    it('getAvailableCreditCents sums available rows', async () => {
      (AccountCredit.findAll as jest.Mock).mockResolvedValue([{ amount_cents: 5000 }, { amount_cents: 5000 }]);
      expect(await getAvailableCreditCents('e1')).toBe(10000);
    });

    it('planCreditPreview reports available, applied, and the resulting charge', async () => {
      (AccountCredit.findAll as jest.Mock).mockResolvedValue([{ id: 'a', amount_cents: 5000 }]);
      // Annual $1,788 = 178800 cents.
      expect(await planCreditPreview('e1', 178800)).toEqual({ available_cents: 5000, applied_cents: 5000, charge_after_cents: 173800 });
    });
  });

  describe('grantCredit', () => {
    it('creates a new credit and reports granted:true', async () => {
      (AccountCredit.findOrCreate as jest.Mock).mockResolvedValue([{ id: 'c1' }, true]);
      const r = await grantCredit({ enrollmentId: 'e1', amountCents: 5000, reason: 'open_house_deposit', sourceEventId: 'OH716-1' });
      expect(r.granted).toBe(true);
      expect((AccountCredit.findOrCreate as jest.Mock).mock.calls[0][0].where).toEqual({ source_event_id: 'OH716-1' });
    });

    it('is idempotent — a duplicate source_event_id does not grant again', async () => {
      (AccountCredit.findOrCreate as jest.Mock).mockResolvedValue([{ id: 'c1' }, false]);
      const r = await grantCredit({ enrollmentId: 'e1', amountCents: 5000, reason: 'open_house_deposit', sourceEventId: 'OH716-1' });
      expect(r.granted).toBe(false);
    });

    it('rejects bad input', async () => {
      await expect(grantCredit({ enrollmentId: '', amountCents: 5000, reason: 'x', sourceEventId: 's' })).rejects.toThrow();
      await expect(grantCredit({ enrollmentId: 'e1', amountCents: 0, reason: 'x', sourceEventId: 's' })).rejects.toThrow();
      await expect(grantCredit({ enrollmentId: 'e1', amountCents: 5000, reason: 'x', sourceEventId: '' })).rejects.toThrow();
    });
  });

  describe('consumeCreditsForSubscription', () => {
    it('marks whole credit rows applied and links them to the subscription', async () => {
      (AccountCredit.findAll as jest.Mock)
        .mockResolvedValueOnce([]) // idempotency guard: none applied to this sub yet
        .mockResolvedValueOnce([{ id: 'a', amount_cents: 5000 }]); // available rows
      const consumed = await consumeCreditsForSubscription('e1', 'sub1', 5000, NOW);
      expect(consumed).toBe(5000);
      const [vals, opts] = (AccountCredit.update as jest.Mock).mock.calls[0];
      expect(vals.status).toBe('applied');
      expect(vals.applied_subscription_id).toBe('sub1');
      expect(opts.where).toEqual({ id: ['a'] });
    });

    it('is idempotent — a sub that already has credit applied is not re-consumed', async () => {
      (AccountCredit.findAll as jest.Mock).mockResolvedValueOnce([{ amount_cents: 5000 }]); // already applied
      const consumed = await consumeCreditsForSubscription('e1', 'sub1', 5000, NOW);
      expect(consumed).toBe(5000);
      expect(AccountCredit.update).not.toHaveBeenCalled();
    });

    it('no-ops when there is no target or nothing available', async () => {
      expect(await consumeCreditsForSubscription('e1', 'sub1', 0, NOW)).toBe(0);
      (AccountCredit.findAll as jest.Mock).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      expect(await consumeCreditsForSubscription('e1', 'sub1', 5000, NOW)).toBe(0);
      expect(AccountCredit.update).not.toHaveBeenCalled();
    });
  });
});
