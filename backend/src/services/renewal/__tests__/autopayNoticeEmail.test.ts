/**
 * The auto-pay disclosure has to survive the two ways it could hurt someone:
 * saying nothing useful, and saying something that invites a second payment.
 */
import { renderAutopayNoticeEmail, formatChargeDate } from '../autopayNoticeEmail';

const base = (over: Record<string, unknown> = {}) => ({
  full_name: 'Hellen Muhonja',
  email: 'hellen@example.test',
  plan: 'monthly',
  amount_cents: 19900,
  next_charge_iso: '2026-09-04T00:00:00.000Z',
  ...over,
});

describe('it discloses the thing it exists to disclose', () => {
  it('says the membership now renews automatically', () => {
    const e = renderAutopayNoticeEmail(base());
    expect(e.subject).toMatch(/renews automatically/i);
    expect(e.text).toMatch(/renews automatically/i);
  });

  it('names the amount and the date, because "you are on auto-pay" alone is not a disclosure', () => {
    const e = renderAutopayNoticeEmail(base());
    expect(e.text).toContain('$199.00');
    expect(e.text).toMatch(/September 3/);
    expect(e.html).toContain('$199.00');
  });

  it('tells an annual member their own cadence, not a monthly one', () => {
    const e = renderAutopayNoticeEmail(base({ plan: 'annual', amount_cents: 178800 }));
    expect(e.text).toContain('$1788.00');
    expect(e.text).toMatch(/continue yearly/);
    expect(e.text).not.toMatch(/pay a link each month/);
  });
});

describe('it never invites a second payment', () => {
  // The whole point. A member told they are on automatic billing and handed a
  // payment link in the same email is a member who may pay for a period
  // PaySimple is about to collect.
  it('carries no URL at all', () => {
    const e = renderAutopayNoticeEmail(base());
    expect(e.text).not.toMatch(/https?:\/\/(?!enterprise\.colaberry\.ai)/);
    expect(e.text).not.toMatch(/checkout/i);
  });

  it('never tells the member a payment is due from them', () => {
    const e = renderAutopayNoticeEmail(base());
    expect(e.text).not.toMatch(/payment is due/i);
    expect(e.text).not.toMatch(/has to come from you/i);
  });
});

describe('leaving is offered, next to the charge date', () => {
  it('says how to stop, pause, or change the card', () => {
    const e = renderAutopayNoticeEmail(base());
    expect(e.text).toMatch(/pause, or stop/i);
    expect(e.text).toMatch(/reply and tell me/i);
  });

  it('promises to act before the charge, not after it', () => {
    const e = renderAutopayNoticeEmail(base());
    expect(e.text).toMatch(/before the date above/i);
  });
});

describe('house style', () => {
  it('uses no em-dashes or en-dashes', () => {
    const e = renderAutopayNoticeEmail(base());
    expect(e.text).not.toMatch(/[—–]/);
    expect(e.html).not.toMatch(/[—–]/);
  });

  it('signs off exactly once', () => {
    // Ali has asked twice to stop being double-signed. The signature block is
    // the only sign-off; the body must not also end with his name.
    const e = renderAutopayNoticeEmail(base());
    expect(e.text.match(/Ali Muwwakkil/g) || []).toHaveLength(1);
  });

  it('falls back to the address when the stored name is not a name', () => {
    const e = renderAutopayNoticeEmail(base({ full_name: '  ', email: 'ammar@example.test' }));
    expect(e.text.startsWith('ammar,')).toBe(true);
  });
});

describe('the charge date survives both input shapes', () => {
  /**
   * PaySimple reports NextScheduledPaymentDate as a CALENDAR DATE with no
   * timezone. Parsing "2026-09-04" lands on UTC midnight, which is 7pm on the
   * 3rd in Central, so formatting it in the program timezone printed September 3
   * for a charge that happens on the 4th. Caught by this test before it reached
   * anyone: a disclosure naming the wrong day is worse than no disclosure.
   */
  it('prints a gateway calendar date exactly as given, with no timezone shift', () => {
    expect(formatChargeDate('2026-09-04')).toMatch(/September 4/);
    expect(formatChargeDate('2026-09-04')).not.toMatch(/September 3/);
    expect(formatChargeDate('2026-01-01')).toMatch(/January 1/);
    expect(formatChargeDate('2026-12-31')).toMatch(/December 31/);
  });

  it('still renders a real instant in Central, where the member reads it', () => {
    // An after-midnight-UTC instant is still the previous evening in Texas.
    expect(formatChargeDate('2026-09-04T02:00:00.000Z')).toMatch(/September 3/);
  });

  it('uses the gateway date in the body, not a day earlier', () => {
    const e = renderAutopayNoticeEmail(base({ next_charge_iso: '2026-09-04' }));
    expect(e.text).toMatch(/September 4/);
  });

  it('degrades to no date rather than printing Invalid Date', () => {
    const e = renderAutopayNoticeEmail(base({ next_charge_iso: 'not-a-date' }));
    expect(e.text).not.toMatch(/Invalid Date|NaN/);
    expect(e.text).toContain('$199.00');
  });
});
