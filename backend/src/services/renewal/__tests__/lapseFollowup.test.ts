import {
  lapseFollowupKindFor, selectRenewalReminders, LAPSE_FOLLOWUP_DAYS, REMINDER_KINDS,
  type RenewalSubscriptionRow,
} from '../renewalReminderSelection';
import { renderRenewalReminderEmail, renewalSubject } from '../renewalReminderEmail';

const NOW = Date.UTC(2026, 7, 23, 15, 0); // 23 Aug 2026, 10am Central
const DAY = 86_400_000;

const row = (over: Partial<RenewalSubscriptionRow> = {}): RenewalSubscriptionRow => ({
  id: 'sub-1',
  enrollment_id: 'enr-1',
  email: 'member@example.com',
  full_name: 'A Member',
  plan: 'monthly',
  status: 'active',
  amount_cents: 19900,
  applied_credit_cents: 0,
  current_period_end: new Date(NOW - 1 * DAY).toISOString(),
  ...over,
} as RenewalSubscriptionRow);

describe('following up after a missed date', () => {
  it('nudges one day after, and again at a week', () => {
    expect(lapseFollowupKindFor(1)).toBe('after_lapse_1d');
    expect(lapseFollowupKindFor(7)).toBe('after_lapse_7d');
  });

  // Two nudges, then let go. A monthly membership that dunned forever would be
  // worse than one that stops asking.
  it('goes quiet on every other day, including long after', () => {
    for (const d of [0, 2, 3, 6, 8, 14, 30, 365]) {
      expect(lapseFollowupKindFor(d)).toBeNull();
    }
  });

  it('exposes both new kinds so the idempotency ledger can key on them', () => {
    expect(REMINDER_KINDS).toEqual(expect.arrayContaining(['after_lapse_1d', 'after_lapse_7d']));
    expect(LAPSE_FOLLOWUP_DAYS).toEqual([1, 7]);
  });

  // The regression that motivated all of this: three real members missed their
  // date on 2026-08-23 and the job reported them and moved on, permanently. They
  // had to be chased by hand.
  it('MAILS a member one day past their date instead of dropping them forever', () => {
    const r = selectRenewalReminders([row()], NOW);
    expect(r.skipped.find((s) => s.reason === 'already_lapsed')).toBeUndefined();
    expect(r.due).toHaveLength(1);
    expect(r.due[0].kind).toBe('after_lapse_1d');
    // Negative day_delta is what tells the template this is a past date.
    expect(r.due[0].day_delta).toBe(-1);
  });

  it('still reports, and does not mail, someone outside both windows', () => {
    const r = selectRenewalReminders([row({ current_period_end: new Date(NOW - 3 * DAY).toISOString() })], NOW);
    expect(r.due).toHaveLength(0);
    expect(r.skipped[0].reason).toBe('already_lapsed');
  });

  it('never follows up on a comped seat, which is never billed at all', () => {
    const r = selectRenewalReminders([row({ plan: 'comp', amount_cents: 0 })], NOW);
    expect(r.due).toHaveLength(0);
    expect(r.skipped[0].reason).toBe('comped');
  });

  it('never follows up once a newer active subscription exists', () => {
    const stale = row({ id: 'old', current_period_end: new Date(NOW - 1 * DAY).toISOString() });
    const fresh = row({ id: 'new', current_period_end: new Date(NOW + 29 * DAY).toISOString() });
    const r = selectRenewalReminders([stale, fresh], NOW);
    expect(r.due.find((d) => d.subscription_id === 'old')).toBeUndefined();
    expect(r.skipped.find((s) => s.subscription_id === 'old')?.reason).toBe('superseded');
  });
});

describe('what a lapsed member actually reads', () => {
  const lapsedInput = {
    full_name: 'Maria C Garcia', email: 'm@example.com',
    plan: 'monthly' as const, amount_cents: 19900, applied_credit_cents: 0,
    period_end: new Date(NOW - 1 * DAY).toISOString(),
    day_delta: -1,
    payment_link: 'https://example.test/pay/abc',
  };

  // "Payment is due August 22" to someone on the 23rd is both wrong and needling.
  it('does not claim a payment is due on a date that has passed', () => {
    const subject = renewalSubject(lapsedInput);
    expect(subject).toBe('Your Colaberry membership payment');
    expect(subject).not.toMatch(/due/);
  });

  it('drops the "paid through" framing and says nothing has been cut off', () => {
    const { text } = renderRenewalReminderEmail(lapsedInput);
    expect(text).not.toMatch(/paid through/i);
    expect(text).toMatch(/has not gone through yet/i);
    expect(text).toMatch(/access is exactly as it was/i);
    expect(text).toMatch(/not a warning/i);
  });

  // The invariant the original code was protecting: never sell them back time
  // they already lost. "A further month" is forward, "the next month" is ambiguous.
  it('offers a FORWARD term, never the elapsed one', () => {
    const { text, html } = renderRenewalReminderEmail(lapsedInput);
    expect(text).toMatch(/A further month is \$199\.00/);
    expect(html).toMatch(/Pay \$199\.00 for a further month/);
  });

  it('gives a lapsed member a way out that does not require ignoring us', () => {
    const { text } = renderRenewalReminderEmail(lapsedInput);
    expect(text).toMatch(/reply with the word "cancel"/i);
  });

  it('leaves the pre-renewal email untouched', () => {
    const { subject, text } = renderRenewalReminderEmail({ ...lapsedInput, day_delta: 1 });
    expect(subject).toMatch(/is due tomorrow/);
    expect(text).toMatch(/paid through/i);
    expect(text).toMatch(/The next month is \$199\.00/);
    expect(text).not.toMatch(/not a warning/i);
  });
});
