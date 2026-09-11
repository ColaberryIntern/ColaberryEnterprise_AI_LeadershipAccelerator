/**
 * The email as sent, fetched from Mandrill for mail this platform never stored.
 * Shapes here mirror the live API as probed on 2026-09-11 (search hit with
 * clicks_detail; content with html/text/to; Unknown_Message past retention).
 */
import {
  fetchMessageAsSent,
  maskSecrets,
  pickMessage,
  type MandrillPost,
  type MandrillSearchHit,
} from '../mandrillMessageContent';

const AT = new Date('2026-09-07T22:35:01Z'); // the poll recorded the click here
const PERSON = 'bfglz@yahoo.com';
const LINK = 'https://enterprise.colaberry.ai/portal/verify?token=350f8ee5abc';

const hit = (over: Partial<MandrillSearchHit>): MandrillSearchHit => ({
  _id: 'aaaa1111', ts: Math.floor(new Date('2026-09-07T22:18:32Z').getTime() / 1000),
  subject: '[Accelerator] Your Portal Access Link', email: PERSON, sender: 'info@colaberry.com',
  opens: 3, clicks: 1, clicks_detail: [{ url: LINK, ts: 1 }], ...over,
});

function fakeMandrill(opts: { hits?: MandrillSearchHit[]; content?: unknown; calls?: Array<{ path: string; body: Record<string, unknown> }> }): MandrillPost {
  return async (path, body) => {
    opts.calls?.push({ path, body });
    if (path === 'messages/search.json') return opts.hits ?? [];
    if (path === 'messages/content.json') return opts.content ?? { status: 'error', code: 11, name: 'Unknown_Message' };
    throw new Error(`unexpected ${path}`);
  };
}

describe('maskSecrets', () => {
  it('blanks token-like query values and nothing else, idempotently', () => {
    expect(maskSecrets(LINK)).toBe('https://enterprise.colaberry.ai/portal/verify?token=***');
    expect(maskSecrets('https://x/y?utm_source=a&token=abc&sig=def#frag')).toBe('https://x/y?utm_source=a&token=***&sig=***#frag');
    expect(maskSecrets(maskSecrets(LINK))).toBe(maskSecrets(LINK));
    expect(maskSecrets('<a href="https://x/?token=zz">go</a>')).toBe('<a href="https://x/?token=***">go</a>');
    expect(maskSecrets('no url here')).toBe('no url here');
  });
});

describe('pickMessage', () => {
  it('chooses the latest same-subject message sent at or before the outcome, case-insensitively', () => {
    const earlier = hit({ _id: 'early', ts: 1_000 });
    const later = hit({ _id: 'late', ts: Math.floor(AT.getTime() / 1000) - 60 });
    const after = hit({ _id: 'after', ts: Math.floor(AT.getTime() / 1000) + 3600 });
    const other = hit({ _id: 'other', subject: 'SQL After Dark (1 hr out)', ts: Math.floor(AT.getTime() / 1000) - 10 });
    expect(pickMessage([earlier, after, other, later], '  [accelerator] your portal access link ', AT)?._id).toBe('late');
  });

  it('falls back to the nearest same-subject message when none precedes the outcome', () => {
    const after = hit({ _id: 'after', ts: Math.floor(AT.getTime() / 1000) + 3600 });
    expect(pickMessage([after], '[Accelerator] Your Portal Access Link', AT)?._id).toBe('after');
    expect(pickMessage([after], 'Something else', AT)).toBeNull();
  });
});

describe('fetchMessageAsSent', () => {
  it('finds the message by recipient + subject + time, fetches its content, masks secrets, and names the clicked link', async () => {
    const calls: Array<{ path: string; body: Record<string, unknown> }> = [];
    const post = fakeMandrill({
      calls,
      hits: [hit({})],
      content: { ts: hit({}).ts, subject: '[Accelerator] Your Portal Access Link', from_email: 'info@colaberry.com',
        to: { email: PERSON }, html: `<p>Hi</p><a href="${LINK}">Open the portal</a>`, text: `Open: ${LINK}` },
    });
    const r = await fetchMessageAsSent({ email: PERSON, subject: '[Accelerator] Your Portal Access Link', at: AT }, post);
    expect(r.found).toBe(true);
    if (!r.found) return;
    expect(r.mandrillId).toBe('aaaa1111');
    expect(r.from).toBe('info@colaberry.com');
    expect(r.sentAt).toBe('2026-09-07T22:18:32.000Z');
    expect(r.html).toContain('href="https://enterprise.colaberry.ai/portal/verify?token=***"');
    expect(r.html).not.toContain('350f8ee5abc');
    expect(r.text).not.toContain('350f8ee5abc');
    expect(r.clickedUrls).toEqual(['https://enterprise.colaberry.ai/portal/verify?token=***']);
    // The search is scoped to THIS recipient, over the outcome's neighbourhood.
    expect(calls[0].body.query).toBe(`email:${PERSON}`);
    expect(calls[0].body.date_from).toBe('2026-09-05');
    expect(calls[0].body.date_to).toBe('2026-09-08');
    expect(calls[1]).toEqual({ path: 'messages/content.json', body: { id: 'aaaa1111' } });
  });

  it('uses a known Mandrill id when the row carries one, still through the recipient-scoped search', async () => {
    const post = fakeMandrill({
      hits: [hit({ _id: 'wrong-subject-newer', subject: 'X', ts: 9_999_999_999 }), hit({ _id: 'known' })],
      content: { to: { email: PERSON }, html: '<p>x</p>', text: 'x' },
    });
    const r = await fetchMessageAsSent({ email: PERSON, subject: 'irrelevant when id known', at: AT, mandrillId: 'known' }, post);
    expect(r).toMatchObject({ found: true, mandrillId: 'known' });
  });

  it('says content_expired when Mandrill no longer holds the message, and not_in_search when it never matched', async () => {
    const expired = await fetchMessageAsSent(
      { email: PERSON, subject: '[Accelerator] Your Portal Access Link', at: AT },
      fakeMandrill({ hits: [hit({})], content: { status: 'error', code: 11, name: 'Unknown_Message', message: 'No message exists' } }),
    );
    expect(expired).toEqual({ found: false, reason: 'content_expired' });

    const missing = await fetchMessageAsSent(
      { email: PERSON, subject: 'Never sent', at: AT },
      fakeMandrill({ hits: [hit({})] }),
    );
    expect(missing).toEqual({ found: false, reason: 'not_in_search' });
  });

  it("refuses content addressed to someone else, even when a hit's id matches", async () => {
    const post = fakeMandrill({ hits: [hit({})], content: { to: { email: 'someone.else@example.com' }, html: '<p>secret</p>' } });
    const r = await fetchMessageAsSent({ email: PERSON, subject: '[Accelerator] Your Portal Access Link', at: AT }, post);
    expect(r).toEqual({ found: false, reason: 'recipient_mismatch' });
  });

  it('never throws: Mandrill down, non-array search, or no key each become a stated reason', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const down: MandrillPost = async () => { throw new Error('ECONNRESET'); };
    expect(await fetchMessageAsSent({ email: PERSON, subject: 's', at: AT }, down)).toEqual({ found: false, reason: 'mandrill_unavailable' });
    // The warning names the class and the subject, never the recipient.
    expect(warn.mock.calls[0][0]).toContain('"error_class":"Error"');
    expect(warn.mock.calls[0][0]).not.toContain(PERSON);
    warn.mockRestore();

    const weird: MandrillPost = async () => ({ status: 'error', name: 'Invalid_Key' });
    expect(await fetchMessageAsSent({ email: PERSON, subject: 's', at: AT }, weird)).toEqual({ found: false, reason: 'mandrill_unavailable' });

    expect(await fetchMessageAsSent({ email: PERSON, subject: 's', at: AT }, null)).toEqual({ found: false, reason: 'not_configured' });
  });
});
