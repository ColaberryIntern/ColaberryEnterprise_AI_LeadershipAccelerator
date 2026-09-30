import { exclusionFor, ACH_AWAITING_CONSENT, CARD_BLOCKED } from '../subscriptionScheduleService';

const row = (over: Partial<Parameters<typeof exclusionFor>[0]> = {}) => ({
  email: 'someone@example.com',
  plan: 'monthly',
  status: 'active',
  paysimple_schedule_id: null,
  paysimple_payment_id: '155189115',
  ...over,
});

describe('who may be put on a standing schedule', () => {
  it('allows an ordinary active card member', () => {
    expect(exclusionFor(row())).toBeNull();
  });

  // PaySimple cannot process a $0 charge, and a comped seat should never be billed
  // at all. There are 12 of these live, so a migration that forgets them fails
  // loudly mid-run, which is a bad time to find out.
  it('never schedules a comped seat', () => {
    expect(exclusionFor(row({ plan: 'comp' }))?.code).toBe('comp');
  });

  it('skips anything not active', () => {
    for (const status of ['pending', 'canceled', 'failed', 'past_due']) {
      expect(exclusionFor(row({ status }))?.code).toBe('not_active');
    }
  });

  // Idempotency: re-running the migration must not give anyone a second schedule
  // and therefore a second monthly charge.
  it('skips a subscription that already has a schedule', () => {
    expect(exclusionFor(row({ paysimple_schedule_id: '4434931' }))?.code).toBe('already_scheduled');
  });

  it('skips a subscription with no payment to resolve an account from', () => {
    expect(exclusionFor(row({ paysimple_payment_id: null }))?.code).toBe('no_payment_id');
  });

  // A recurring bank debit needs the payer's affirmative authorization; the
  // one-time web checkout they went through does not cover it, and silence is not
  // consent. All three are real live members.
  it.each([...ACH_AWAITING_CONSENT])('holds back bank-draft member %s until they consent', (email) => {
    expect(exclusionFor(row({ email }))?.code).toBe('ach_no_consent');
  });

  it('holds back a member whose card belongs to somebody else', () => {
    const r = exclusionFor(row({ email: 'chukseneh@outlook.com' }));
    expect(r?.code).toBe('third_party_card');
    expect(r?.detail).toMatch(/never authorized/);
  });

  it('holds back a member whose card has expired', () => {
    expect(exclusionFor(row({ email: 'shabana.zeeshan001@gmail.com' }))?.code).toBe('card_expired');
  });

  it('matches the exclusion lists case-insensitively and ignores stray whitespace', () => {
    expect(exclusionFor(row({ email: '  ChukSeneh@Outlook.com ' }))?.code).toBe('third_party_card');
    expect(exclusionFor(row({ email: 'KEPHAMO2004@GMAIL.COM' }))?.code).toBe('ach_no_consent');
  });

  it('keeps the two exclusion lists disjoint, so a reason is never ambiguous', () => {
    for (const email of ACH_AWAITING_CONSENT) {
      expect(CARD_BLOCKED.has(email)).toBe(false);
    }
  });
});
