import { checkoutBlock, checkoutBlockMessage, RENEWAL_CHECKOUT_LEAD_DAYS } from '../checkoutGuard';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 30, 15); // 2026-10-30, the day of the second checkout
const at = (days: number) => new Date(NOW + days * DAY);

describe('checkoutGuard', () => {
  it('uses the renewal reminder window, so the reminder link still works', () => {
    expect(RENEWAL_CHECKOUT_LEAD_DAYS).toBe(7);
  });

  it('allows a first checkout (no rows)', () => {
    expect(checkoutBlock([], NOW)).toBeNull();
  });

  it('blocks a second checkout the day after paying (the Unuforeh Iyasere case)', () => {
    const block = checkoutBlock([{ plan: 'monthly', status: 'active', current_period_end: at(30) }], NOW);
    expect(block).toEqual({ reason: 'already_subscribed', renews_on: at(30).toISOString(), auto_billed: false });
  });

  it('allows renewal inside the window, including the boundary day', () => {
    expect(checkoutBlock([{ plan: 'monthly', status: 'active', current_period_end: at(7) }], NOW)).toBeNull();
    expect(checkoutBlock([{ plan: 'monthly', status: 'active', current_period_end: at(1) }], NOW)).toBeNull();
    expect(checkoutBlock([{ plan: 'monthly', status: 'active', current_period_end: at(-3) }], NOW)).toBeNull();
  });

  it('blocks one hour outside the window', () => {
    const end = new Date(NOW + 7 * DAY + 3600 * 1000);
    expect(checkoutBlock([{ plan: 'monthly', status: 'active', current_period_end: end }], NOW)).not.toBeNull();
  });

  it('blocks any checkout on a scheduled row, even inside the window (the Million Abate case)', () => {
    const block = checkoutBlock([{ plan: 'monthly', status: 'active', current_period_end: at(2), paysimple_schedule_id: '4511902' }], NOW);
    expect(block).toMatchObject({ reason: 'already_subscribed', auto_billed: true });
  });

  it('ignores comp, pending, canceled and failed rows', () => {
    const rows = [
      { plan: 'comp', status: 'active', current_period_end: at(3000) },
      { plan: 'monthly', status: 'pending', current_period_end: null },
      { plan: 'annual', status: 'canceled', current_period_end: at(200) },
      { plan: 'monthly', status: 'failed', current_period_end: at(30) },
    ];
    expect(checkoutBlock(rows, NOW)).toBeNull();
  });

  it('lets an active row with an unreadable period end through rather than stranding the member', () => {
    expect(checkoutBlock([{ plan: 'monthly', status: 'active', current_period_end: null }], NOW)).toBeNull();
    expect(checkoutBlock([{ plan: 'monthly', status: 'active', current_period_end: 'not a date' }], NOW)).toBeNull();
  });

  it('accepts string dates as Sequelize and raw pg return them', () => {
    expect(checkoutBlock([{ plan: 'annual', status: 'active', current_period_end: at(300).toISOString() }], NOW)).not.toBeNull();
  });

  it('is deterministic: the same rows twice give the same answer', () => {
    const rows = [{ plan: 'monthly', status: 'active', current_period_end: at(30) }];
    expect(checkoutBlock(rows, NOW)).toEqual(checkoutBlock(rows, NOW));
  });

  it('writes a member-facing message in Central time without banned words', () => {
    const msg = checkoutBlockMessage({ reason: 'already_subscribed', renews_on: '2026-11-30T15:00:00.000Z', auto_billed: false });
    expect(msg).toBe('You are already paid through November 30, 2026. Renewal opens 7 days before that date.');
    const auto = checkoutBlockMessage({ reason: 'already_subscribed', renews_on: '2026-11-24T15:00:00.000Z', auto_billed: true });
    expect(auto).toBe('Your membership renews automatically on November 24, 2026, so there is nothing to pay now.');
    expect(checkoutBlockMessage({ reason: 'already_subscribed', renews_on: null, auto_billed: false })).toBe('You already have an active membership.');
    expect(`${msg} ${auto}`).not.toMatch(/free|—/i);
  });
});
