import jwt from 'jsonwebtoken';
import { env } from '../../../../config/env';
import { mintRecapToken, verifyRecapToken, mintOptOutToken, verifyOptOutToken } from '../recapToken';
import { lintText, lintObject } from '../recapLint';
import { planRecipients, isTestGuest, GuestRow } from '../recapRecipients';
import { buildRecapEmail, firstNameOf, recapSubject } from '../recapEmail';
import { RecapSummarySchema, defaultSummary, deckText } from '../recapContent';

const SID = '11111111-1111-4111-8111-111111111111';
const SID2 = '22222222-2222-4222-8222-222222222222';

describe('recap token', () => {
  it('round-trips for the same session', () => {
    expect(verifyRecapToken(mintRecapToken(SID, 'g1'), SID)).toBe('g1');
  });
  it('refuses another session, a tampered token, an expired token, a guest pass and junk', () => {
    const t = mintRecapToken(SID, 'g1');
    expect(verifyRecapToken(t, SID2)).toBeNull();
    expect(verifyRecapToken(t.slice(0, -2) + 'xx', SID)).toBeNull();
    const expired = jwt.sign({ typ: 'recap', sid: SID, gid: 'g1', exp: Math.floor(Date.now() / 1000) - 10 }, env.jwtSecret);
    expect(verifyRecapToken(expired, SID)).toBeNull();
    const guestPass = jwt.sign({ typ: 'guest', sid: SID, gid: 'g1' }, env.jwtSecret);
    expect(verifyRecapToken(guestPass, SID)).toBeNull();
    expect(verifyRecapToken(undefined, SID)).toBeNull();
    expect(verifyRecapToken(['x'], SID)).toBeNull();
  });
  it('opt-out token carries only the email and refuses a recap token', () => {
    expect(verifyOptOutToken(mintOptOutToken('a@b.co'))).toBe('a@b.co');
    expect(verifyOptOutToken(mintRecapToken(SID, 'g1'))).toBeNull();
    expect(verifyOptOutToken('nope')).toBeNull();
  });
});

describe('recap lint', () => {
  it('flags every zero-price form', () => {
    for (const s of ['It is free', 'Start for $0 today', 'no cost to you', 'No-charge class', 'zero cost']) {
      expect(lintText('x', s).map((v) => v.rule)).toContain('zero_price');
    }
  });
  it('does not flag look-alikes', () => {
    expect(lintText('x', 'Freedom to build, $0.99 is not zero, $10 seats')).toEqual([]);
  });
  it('flags a partnership claim and dashes, with field paths', () => {
    const v = lintObject({ ideas: [{ title: 'Official Anthropic partner' }], quote: 'one — two' });
    expect(v).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'ideas[0].title', rule: 'partnership' }),
      expect.objectContaining({ field: 'quote', rule: 'dash' }),
    ]));
  });
});

describe('recap recipients', () => {
  const g = (id: string, name: string, email: string): GuestRow => ({ id, name, email, email_lower: email.toLowerCase() });
  it('dedupes on email regardless of case and keeps the first check-in', () => {
    const p = planRecipients([g('1', 'Ana', 'Ana@X.com'), g('2', 'Ana B', 'ana@x.com')], new Set(), new Set());
    expect(p.recipients).toHaveLength(1);
    expect(p.recipients[0].guestId).toBe('1');
  });
  it('skips test guests, opt-outs, suppressed leads and invalid emails with a reason', () => {
    const p = planRecipients([
      g('1', 'Test User', 'real@x.com'), g('2', 'Bo', 'bo@example.com'), g('3', 'Cy', 'cy+test@x.com'),
      g('4', 'Di', 'di@x.com'), g('5', 'Ed', 'ed@x.com'), g('6', 'Fa', 'not-an-email'), g('7', 'Gi', 'gi@x.com'),
    ], new Set(['di@x.com']), new Set(['ed@x.com']));
    expect(p.recipients.map((r) => r.guestId)).toEqual(['7']);
    expect(Object.fromEntries(p.skipped.map((s) => [s.guestId, s.reason]))).toEqual({
      1: 'test_guest', 2: 'test_guest', 3: 'test_guest', 4: 'opted_out', 5: 'lead_suppressed', 6: 'invalid_email',
    });
  });
  it('empty class means no recipients', () => {
    expect(planRecipients([], new Set(), new Set())).toEqual({ recipients: [], skipped: [] });
  });
  it('test-guest rule does not catch real names that merely contain the word', () => {
    expect(isTestGuest({ name: 'Contessa', email_lower: 'c@x.com' })).toBe(false);
  });
});

describe('recap email', () => {
  const summary = RecapSummarySchema.parse({
    headline: 'It Works While You Sleep', intro: 'Thanks <b>all</b>',
    ideas: [{ icon: '🌙', title: 'One skill, one job', text: 'Sort, draft, brief' }],
    steps: ['Sort', 'Draft', 'Brief'], quote: 'It drafts. You decide.', homework: 'Pick one overnight task',
  });
  const mail = buildRecapEmail({ summary, firstName: 'Ana', classTitle: 'Weekly Live Ep 2', classDate: 'Monday, November 30', recapUrl: 'https://e.x/portal/class-recap/s?t=a&b', nextEventUrl: 'https://eventbrite.com/e/1', unsubscribeUrl: 'https://e.x/api/live/recap/unsubscribe?t=z' });
  it('carries both buttons, the opt-out and the greeting, escaped', () => {
    expect(mail.subject).toBe('Your class recap: It Works While You Sleep');
    expect(mail.html).toContain('Open your class page and chat');
    expect(mail.html).toContain('Save your seat for the next class');
    expect(mail.html).toContain('https://e.x/portal/class-recap/s?t=a&amp;b');
    expect(mail.html).toContain('Stop class recap emails');
    expect(mail.html).toContain('Thanks &lt;b&gt;all&lt;/b&gt;');
    expect(mail.html).not.toContain('<img');
    expect(mail.text).toContain('Your class page and chat: https://e.x/portal/class-recap/s?t=a&b');
    expect(mail.text).toContain('Hi Ana,');
  });
  it('passes the content rules and has no dashes', () => {
    expect(lintText('html', mail.html)).toEqual([]);
    expect(lintText('text', mail.text)).toEqual([]);
  });
  it('subject is capped', () => {
    expect(recapSubject({ ...summary, headline: 'x'.repeat(120) }).length).toBeLessThanOrEqual(150);
  });
  it('first name: first word, letters only, capitalized; junk gives empty', () => {
    expect(firstNameOf('ana maria')).toBe('Ana');
    expect(firstNameOf('  ')).toBe('');
    expect(firstNameOf('<script>')).toBe('');
  });
});

describe('recap content', () => {
  it('default summary is valid', () => {
    expect(RecapSummarySchema.safeParse(defaultSummary('Ep 2')).success).toBe(true);
  });
  it('deck text strips scripts, styles and tags and is capped', () => {
    const t = deckText({ customDeck: { html: '<style>.a{}</style><script>var x=1</script><h1>Hello</h1><p>World &amp; more</p>' } }, 8);
    expect(t).toBe('Hello Wo');
    expect(deckText(null)).toBe('');
  });
});
