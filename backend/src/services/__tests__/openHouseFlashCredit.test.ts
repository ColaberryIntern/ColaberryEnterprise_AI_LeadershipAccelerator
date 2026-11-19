import {
  FLASH_REASON, FLASH_SETTLE_GRACE_MS, flashSourceId, flashDeadlineMs, isFlashCreditExpired, validateFlashDeadline,
} from '../openHouseFlashCredit';
import { creditUsableOnPlan } from '../accountCreditService';

jest.mock('../../models', () => ({ AccountCredit: {} }));

// 11:59 PM CT on Nov 19, 2026 = 05:59 UTC on Nov 20.
const DEADLINE = Date.parse('2026-11-20T05:59:00Z');
const SID = '8c92ba87-4766-4a83-9da4-ad529f68b2dc';

describe('openHouseFlashCredit', () => {
  it('round-trips the deadline through the source id, one key per session + email', () => {
    const id = flashSourceId(DEADLINE, SID, '  Maria@Example.com ');
    expect(id).toBe('OHFLASH-1795154340-8c92ba874766-maria@example.com');
    expect(flashDeadlineMs(id)).toBe(DEADLINE);
    expect(flashDeadlineMs('OH1029-SCHOLAR-x@y.com')).toBeNull();
  });

  it('expires a flash credit after its deadline, with the settle grace only when asked', () => {
    const id = flashSourceId(DEADLINE, SID, 'a@b.com');
    expect(isFlashCreditExpired(FLASH_REASON, id, DEADLINE - 1000)).toBe(false);
    expect(isFlashCreditExpired(FLASH_REASON, id, DEADLINE + 1000)).toBe(true);
    expect(isFlashCreditExpired(FLASH_REASON, id, DEADLINE + 1000, FLASH_SETTLE_GRACE_MS)).toBe(false);
    expect(isFlashCreditExpired(FLASH_REASON, id, DEADLINE + FLASH_SETTLE_GRACE_MS + 1000, FLASH_SETTLE_GRACE_MS)).toBe(true);
  });

  it('never expires other credits, and treats a malformed flash id as expired', () => {
    expect(isFlashCreditExpired('open_house_scholarship_annual', 'OH1029-SCHOLAR-x', DEADLINE * 2)).toBe(false);
    expect(isFlashCreditExpired('open_house_deposit', null, DEADLINE * 2)).toBe(false);
    expect(isFlashCreditExpired(FLASH_REASON, 'garbage', 0)).toBe(true);
  });

  it('is annual-only, like the scholarship', () => {
    expect(creditUsableOnPlan(FLASH_REASON, 'annual')).toBe(true);
    expect(creditUsableOnPlan(FLASH_REASON, 'monthly')).toBe(false);
  });

  it('accepts only a future deadline within 36 hours', () => {
    const now = Date.parse('2026-11-20T01:15:00Z'); // 7:15 PM CT
    expect(validateFlashDeadline('2026-11-20T05:59:00Z', now)).toEqual({ ok: true, deadlineMs: DEADLINE });
    expect(validateFlashDeadline('2026-11-19T05:59:00Z', now).ok).toBe(false);
    expect(validateFlashDeadline('2026-11-25T05:59:00Z', now).ok).toBe(false);
    expect(validateFlashDeadline(undefined, now).ok).toBe(false);
  });
});
