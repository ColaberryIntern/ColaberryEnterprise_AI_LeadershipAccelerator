/**
 * The only file in this feature whose output a paying customer reads. The
 * assertions are about the words: the house style rules, and the three facts
 * the email exists to carry (what it costs, when it ends, where to pay).
 */

import {
  renderRenewalReminderEmail, renewalSubject, urgencyWord, firstName, formatMoney, formatPeriodEnd,
} from '../renewalReminderEmail';
import { validateRenewalEmailStyle, findStyleViolations } from '../renewalReminderStyle';

const LINK = 'https://sandbox.paysimple.com/checkout/abc123XYZ';

const BASE = Object.freeze({
  full_name: 'Firas Haddad',
  email: 'firas@example.com',
  plan: 'monthly',
  kind: 'advance_7d' as const,
  period_end: '2026-08-18T18:26:46.821Z',
  amount_cents: 19900,
  applied_credit_cents: 0,
  payment_link: LINK,
  day_delta: 3,
});

const r = (over: Partial<typeof BASE> = {}) => renderRenewalReminderEmail({ ...BASE, ...over });

describe('outbound style rules', () => {
  test('passes the style gate', () => {
    const m = r();
    expect(() => validateRenewalEmailStyle(m.html, m.text)).not.toThrow();
    expect(findStyleViolations(m.html, m.text)).toEqual([]);
  });

  test('contains no em-dash or en-dash in either body', () => {
    const m = r();
    expect(m.text).not.toMatch(/[–—]/);
    expect(m.html).not.toMatch(/[–—]/);
  });

  test('carries the branded signature in both bodies, exactly once', () => {
    const m = r();
    expect(m.text).toContain('200 Chisholm Place, Suite 200');
    expect(m.html).toContain('200 Chisholm Place, Suite 200');
    expect((m.text.match(/Ali Muwwakkil/g) || []).length).toBe(1);
    expect((m.html.match(/Ali Muwwakkil/g) || []).length).toBe(1);
  });

  test('does not sign off with a bare "Ali" on top of the signature', () => {
    expect(r().text).not.toMatch(/\b(best|thanks|cheers|regards),?\s*\n+\s*Ali\b/i);
  });

  test('stays short: a handful of lines, not a newsletter', () => {
    const prose = r().text.split('Ali Muwwakkil')[0];
    expect(prose.length).toBeLessThan(800);
  });

  test('never renders an unresolved value, even from an empty row', () => {
    const m = renderRenewalReminderEmail({
      plan: '', kind: 'advance_7d', period_end: '', amount_cents: 0, payment_link: '',
    } as any);
    expect(m.text).not.toContain('undefined');
    expect(m.text).not.toContain('NaN');
    expect(m.html).not.toContain('undefined');
    expect(m.html).not.toContain('NaN');
  });
});

describe('the real amount', () => {
  test('the monthly list price appears in both bodies', () => {
    const m = r();
    expect(m.text).toContain('$199.00');
    expect(m.html).toContain('$199.00');
  });

  test('the annual price appears for an annual plan, described as a year', () => {
    const m = r({ plan: 'annual', amount_cents: 178800 });
    expect(m.text).toContain('$1788.00');
    expect(m.text).toContain('next year');
  });

  test('an account credit is shown, and the charged amount is the reduced one', () => {
    // 10 of the 28 monthly subscribers carry a $50 Open House credit, and
    // startCheckout is the only place a charge is ever reduced by it. The
    // number the student sees has to be the number that leaves their account.
    const m = r({ applied_credit_cents: 5000 });
    expect(m.text).toContain('$199.00');
    expect(m.text).toContain('$50.00 of account credit');
    expect(m.text).toContain('this payment is $149.00');
    expect(m.html).toContain('Pay $149.00');
  });

  test('with no credit the button shows the full price and no credit sentence', () => {
    const m = r();
    expect(m.html).toContain('Pay $199.00');
    expect(m.text).not.toContain('account credit');
  });

  test('a credit larger than the price never renders a negative charge', () => {
    const m = r({ applied_credit_cents: 25000 });
    expect(m.text).toContain('this payment is $0.00');
    expect(m.text).not.toContain('-$');
  });

  test.each([
    [19900, '$199.00'],
    [178800, '$1788.00'],
    [14900, '$149.00'],
    [0, '$0.00'],
    [1, '$0.01'],
  ])('%s cents renders as %s', (cents, expected) => {
    expect(formatMoney(cents as number)).toBe(expected);
  });
});

describe('the real date', () => {
  test('the period end is spelled out in both bodies', () => {
    const m = r();
    expect(m.text).toContain('Tuesday, August 18, 2026');
    expect(m.html).toContain('Tuesday, August 18, 2026');
  });

  test('the date is rendered in Central, not UTC', () => {
    // 2026-09-01T02:00Z is still 2026-08-31 in Texas. Printing the UTC date
    // would tell seven of the real subscribers the wrong day.
    expect(formatPeriodEnd('2026-09-01T02:00:00.000Z')).toBe('Monday, August 31, 2026');
  });

  test('the subject carries the date too', () => {
    expect(r().subject).toBe('Your Colaberry membership payment is due August 18');
  });

  test('the eve of the renewal says tomorrow, in the subject and the body', () => {
    const m = r({ kind: 'final_1d', day_delta: 1 });
    expect(m.subject).toContain('due tomorrow, August 18');
    expect(m.text).toContain('That is tomorrow.');
    expect(m.html).toContain('That is tomorrow.');
  });

  test('the renewal day itself says today, never tomorrow', () => {
    // The daily job fires at a fixed hour and the period ends are spread across
    // the clock, so the final notice can legitimately land on the day itself.
    // Saying "tomorrow" then would be a plain lie to a paying customer.
    const m = r({ kind: 'final_1d', day_delta: 0 });
    expect(m.subject).toContain('due today, August 18');
    expect(m.text).toContain('That is today.');
    expect(m.text).not.toContain('tomorrow');
  });

  test('the advance notice claims neither today nor tomorrow', () => {
    const m = r({ day_delta: 5 });
    expect(m.text).not.toContain('tomorrow');
    expect(m.text).not.toContain('That is today');
    expect(m.subject).toBe('Your Colaberry membership payment is due August 18');
  });

  test.each([[0, 'today'], [1, 'tomorrow'], [2, null], [7, null], [undefined, null]])(
    'a delta of %s reads as %s', (delta, expected) => {
      expect(urgencyWord(delta as number | undefined)).toBe(expected);
    });

  test('an unparseable date degrades to a sendable message rather than printing junk', () => {
    const m = r({ period_end: 'nonsense' });
    expect(m.text).toContain('Your Colaberry membership term is ending.');
    expect(m.text).not.toContain('Invalid');
    expect(() => validateRenewalEmailStyle(m.html, m.text)).not.toThrow();
  });

  test.each([
    ['2026-08-18T18:26:46.821Z', 'Tuesday, August 18, 2026'],
    ['2026-08-30T12:00:00.000Z', 'Sunday, August 30, 2026'],
    ['2026-09-12T00:00:00.000Z', 'Friday, September 11, 2026'],
    ['2027-07-23T00:00:00.000Z', 'Thursday, July 22, 2027'],
  ])('%s renders as %s in Central', (iso, expected) => {
    expect(formatPeriodEnd(iso as string)).toBe(expected);
  });
});

describe('the link', () => {
  test('appears verbatim in the text body and as an href in the HTML', () => {
    const m = r();
    expect(m.text).toContain(LINK);
    expect(m.html).toContain(`href="${LINK}"`);
  });

  test('is an absolute https URL, which is the shape a hosted checkout has', () => {
    const m = r();
    const found = m.text.match(/https:\/\/\S+/);
    expect(found).not.toBeNull();
    expect(() => new URL(found![0])).not.toThrow();
    expect(new URL(found![0]).protocol).toBe('https:');
  });

  test('there is exactly one link to click, so there is one clear action', () => {
    const hrefs = r().html.match(/href="https?:\/\/[^"]+"/g) || [];
    const checkout = hrefs.filter((h) => h.includes('paysimple'));
    expect(checkout).toHaveLength(1);
  });

  test('a link containing HTML metacharacters cannot break out of the attribute', () => {
    const m = r({ payment_link: 'https://x.test/a"onmouseover="alert(1)' });
    expect(m.html).not.toContain('onmouseover="alert(1)"');
    expect(m.html).toContain('&quot;');
  });
});

describe('what the copy must not promise', () => {
  /**
   * SCOPED 2026-09-01, not deleted. This asserted that the mail never promises
   * automatic billing, which was right while nothing billed automatically.
   * On 2026-09-01, 20 members were moved onto standing PaySimple schedules and
   * auto-pay went from 1 member to 21, so for those members the promise is
   * simply true.
   *
   * The protection still matters for everyone else and is what this now pins:
   * a member with NO schedule must never be told their membership renews on its
   * own, because it does not, and they would lapse waiting for a charge that
   * never comes.
   */
  test('never promises automatic billing to a member who has no schedule', () => {
    const m = r({ autopay: false } as never);
    expect(m.text).not.toMatch(/renews on its own/i);
    expect(m.text).not.toMatch(/auto-?renew/i);
  });

  test('does promise it to a member who DOES have a schedule, because it is true', () => {
    const m = r({ autopay: true } as never);
    expect(m.text).toMatch(/renews on its own/i);
  });

  test('never promises a coverage end date, because paying early moves the anchor', () => {
    // activateByRef anchors the new period on payment time, so "covers you
    // through September 18" is wrong for everyone who acts before the last day.
    expect(r().text).not.toMatch(/through \w+ \d+/i);
    expect(r().text).not.toMatch(/covers you/i);
  });

  /**
   * REVERSED 2026-09-01, deliberately, and this is the substantive change.
   *
   * Telling a member that inaction is free made leaving the default: silence is
   * the easiest thing a busy person does, so staying became the effortful
   * choice. The July cohort started 13 July and should have been on a third
   * payment by 1 September; 21 members had paid exactly once.
   *
   * It is also now FALSE for the 21 on schedules, where doing nothing means
   * being charged.
   *
   * Cancelling is still offered in every branch. What changed is that it is
   * something a member says, not something that happens to them by inaction.
   */
  test('never offers inaction as the way to leave', () => {
    for (const autopay of [true, false]) {
      expect(r({ autopay } as never).text).not.toContain('do nothing and no payment will be taken');
    }
  });

  test('still tells every member how to stop, so this is a changed default and not a trap', () => {
    for (const autopay of [true, false]) {
      expect(r({ autopay } as never).text).toMatch(/reply and tell me/i);
    }
  });
});

describe('names, which are free text', () => {
  test('greets by first name', () => {
    expect(r().text.startsWith('Firas,')).toBe(true);
  });

  test.each([
    ['Emmanuel Sane', 'Emmanuel'],
    ["O'Brien Smith", "O'Brien"],
    ['  Ali   Muwwakkil ', 'Ali'],
  ])('%s greets as %s', (fullName, expected) => {
    expect(firstName(fullName as string, 'x@y.com')).toBe(expected);
  });

  test.each([['', 'student'], [null, 'student'], ['12345', 'student'], ['(unknown)', 'student']])(
    'an unusable name (%s) falls back to the address local part', (fullName) => {
      expect(firstName(fullName as any, 'student@example.com')).toBe('student');
    });

  test('with neither name nor address it still greets somebody', () => {
    expect(firstName(null, null)).toBe('there');
  });
});

describe('renewalSubject', () => {
  test('states the fact rather than the ask', () => {
    expect(renewalSubject({ plan: 'monthly', kind: 'advance_7d', period_end: BASE.period_end }))
      .toBe('Your Colaberry membership payment is due August 18');
  });

  test('an unparseable date still yields a subject line', () => {
    const s = renewalSubject({ plan: 'monthly', kind: 'advance_7d', period_end: 'x' });
    expect(s).toContain('membership payment is due');
    expect(s).not.toContain('undefined');
  });
});

describe('the style gate itself', () => {
  test('catches an em-dash', () => {
    expect(findStyleViolations('Managing Director — hello', 'Managing Director — hello').length).toBeGreaterThan(0);
  });

  test('catches a missing signature', () => {
    expect(findStyleViolations('<p>hi</p>', 'hi')).toEqual(
      expect.arrayContaining([expect.stringContaining('missing the branded signature')]));
  });

  test('catches an unresolved template value', () => {
    const m = r();
    const broken = m.text.replace('$199.00', 'undefined');
    expect(findStyleViolations(m.html, broken)).toEqual(
      expect.arrayContaining([expect.stringContaining('unresolved value')]));
  });

  test('throws a ContractViolation, not a bare Error', () => {
    try {
      validateRenewalEmailStyle('nope', 'nope');
      throw new Error('should have thrown');
    } catch (e: any) {
      expect(e.error_class).toBe('ContractViolation');
    }
  });
});
