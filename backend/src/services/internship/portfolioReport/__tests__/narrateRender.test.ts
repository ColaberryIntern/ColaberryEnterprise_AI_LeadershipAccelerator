import { composeInternshipPortfolio } from '../compose';
import { narrateAsks, parseAsks, type ChatClient } from '../narrate';
import { renderInternshipPortfolio, esc } from '../render';
import { NOW, collected, daysAgo } from './fixtures';

const withMail = () => composeInternshipPortfolio(collected({
  emails: [{ email: 'kal@example.com', subject: 'Read route needed', snippet: 'Can you add a read route?', received_at: daysAgo(1) }],
}), { now: NOW });

const stub = (reply: () => Promise<unknown>): ChatClient => ({ chat: { completions: { create: () => reply() } } });

describe('narrate: the email-asks digest', () => {
  it('accepts a well-formed reply', () => {
    expect(parseAsks('{"asks":["Add a read route for page events"]}')).toEqual(['Add a read route for page events']);
  });

  it('rejects malformed replies rather than repairing them', () => {
    expect(parseAsks('not json')).toBeNull();
    expect(parseAsks('{"asks":"one"}')).toBeNull();
    expect(parseAsks(undefined)).toBeNull();
  });

  it('drops gendered items and em-dashes, caps at 4', () => {
    const out = parseAsks(JSON.stringify({ asks: ['She wants access', 'Access — now', 'a', 'b', 'c', 'd'] }));
    expect(out).toEqual(['Access - now', 'a', 'b', 'c']);
  });

  it('fills asks from the model on success', async () => {
    const r = withMail();
    const res = await narrateAsks(r, stub(async () => ({ choices: [{ message: { content: '{"asks":["A read route"]}' } }] })));
    expect(res).toEqual({ narrated: 1, total: 1 });
    expect(r.groups[0].interns[0].asks).toEqual(['A read route']);
  });

  it('an upstream failure leaves asks empty and does not throw', async () => {
    const r = withMail();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const res = await narrateAsks(r, stub(async () => { throw new Error('429'); }));
    expect(res.narrated).toBe(0);
    expect(r.groups[0].interns[0].asks).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('no client means no calls and no digest', async () => {
    expect(await narrateAsks(withMail(), null)).toEqual({ narrated: 0, total: 1 });
  });
});

describe('render', () => {
  it('escapes intern-supplied text (subjects, commit messages) so it cannot inject HTML', () => {
    const r = composeInternshipPortfolio(collected({
      emails: [{ email: 'kal@example.com', subject: '<script>alert(1)</script>', snippet: '', received_at: daysAgo(1) }],
    }), { now: NOW });
    const { html } = renderInternshipPortfolio(r);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(esc('"a" & <b>')).toBe('&quot;a&quot; &amp; &lt;b&gt;');
  });

  it('has a stable per-day subject (the send ledger keys on it) and no em/en-dashes anywhere', () => {
    const data = collected();
    data.projects[0].commits = [{ date: daysAgo(1), author: 'kal', message: 'fix — dash' }];
    const { subject, html, text } = renderInternshipPortfolio(composeInternshipPortfolio(data, { now: NOW }));
    expect(subject).toBe('[Internship Report] Mon, Nov 9, 2026');
    expect(/[—–]/.test(html + text + subject)).toBe(false);
  });

  it('renders every intern card and the Your move list', () => {
    const { html, text } = renderInternshipPortfolio(withMail());
    expect(html).toContain('Kalkidan Bezabeh');
    expect(html).toContain('Your move');
    expect(text).toContain('INTERNSHIP REPORT');
  });
});

describe('render: timeline order', () => {
  it('reads from today down: TODAY first, then the newest row, then older rows', () => {
    const data = collected();
    data.projects[0].commits = [
      { date: daysAgo(10), author: 'kal', message: 'OLDEST work' },
      { date: daysAgo(1), author: 'kal', message: 'NEWEST work' },
    ];
    const { html } = renderInternshipPortfolio(composeInternshipPortfolio(data, { now: NOW }));
    const card = html.slice(html.indexOf('Kalkidan Bezabeh</div>'));
    const today = card.indexOf('TODAY');
    const newest = card.indexOf('NEWEST work');
    const oldest = card.indexOf('OLDEST work');
    expect(today).toBeGreaterThan(-1);
    expect(today).toBeLessThan(newest);
    expect(newest).toBeLessThan(oldest);
  });
});
