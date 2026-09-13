/**
 * LinkedInAdapter — the first adapter that would touch a real network, tested entirely without
 * one through its injected HTTP function.
 *
 * The cases worth having are the ones that decide whether a scheduled post is lost, duplicated
 * or silently wrong: which failures retry, whether the post URN is read from the right place,
 * and whether a token can escape into a receipt or a log.
 */

import { LinkedInAdapter, LINKEDIN_API_VERSION, type LinkedInHttp } from '../linkedInAdapter';
import { ProviderPublishError, AdapterUnsupportedError, type PublishPayload } from '../socialProviderAdapter';

const TOKEN = ['AQV', 'x1y2z3A4B5C6D7E8F9G0', 'hIjKlMnOpQrStUvWxYz'].join('');
const POST_URN = 'urn:li:share:7123456789012345678';

function payload(over: Partial<PublishPayload> = {}): PublishPayload {
  return {
    jobId: 'job-1', provider: 'linkedin_member', contentItemId: 'ci-1', variantId: 'cv-1',
    accountId: 'acc-1', text: 'Join our free AI class Thursday at 6pm CT.', mediaRefs: [],
    linkUrl: null, disclosureText: null, scheduledFor: '2026-09-14T18:00:00.000Z',
    contentRevision: 3, ...over,
  };
}

function adapter(http: LinkedInHttp, author = 'urn:li:person:abc123') {
  return new LinkedInAdapter({
    provider: 'linkedin_member',
    getToken: async () => TOKEN,
    getAuthorUrn: async () => author,
    http,
    clock: () => new Date('2026-09-14T18:00:05.000Z'),
  });
}

const ok = (headers: Record<string, string> = { 'x-restli-id': POST_URN }): LinkedInHttp =>
  jest.fn(async () => ({ status: 201, headers, body: {} }));

describe('publish', () => {
  it('sends the required version header, the escaped commentary and the author URN', async () => {
    const http = ok();
    await adapter(http).publish(payload({ text: 'Free class (limited seats) #AI' }), 'idem-1');

    const call = (http as jest.Mock).mock.calls[0][0];
    expect(call.url).toBe('https://api.linkedin.com/rest/posts');
    // Without this header every call fails; there is no default.
    expect(call.headers['LinkedIn-Version']).toBe(LINKEDIN_API_VERSION);
    expect(call.headers['x-li-idempotency-key']).toBe('idem-1');
    expect(call.body.author).toBe('urn:li:person:abc123');
    // Reserved characters escaped, or LinkedIn 422s the whole post.
    expect(call.body.commentary).toBe('Free class \\(limited seats\\) \\#AI');
  });

  it('reads the post URN from the HEADER, which is the only place it appears', async () => {
    const receipt = await adapter(ok()).publish(payload(), 'idem-1');
    expect(receipt.externalId).toBe(POST_URN);
    expect(receipt.permalink).toBe(`https://www.linkedin.com/feed/update/${POST_URN}/`);
    expect(receipt.mode).toBe('live');
  });

  it('accepts the alternate header name and matches case-insensitively', async () => {
    const receipt = await adapter(ok({ 'X-LinkedIn-Id': POST_URN })).publish(payload(), 'idem-1');
    expect(receipt.externalId).toBe(POST_URN);
  });

  it('appends the disclosure to the body, escaped with it', async () => {
    const http = ok();
    await adapter(http).publish(payload({ text: 'Sponsored post', disclosureText: '#ad (paid)' }), 'idem-1');
    const { commentary } = (http as jest.Mock).mock.calls[0][0].body;
    expect(commentary).toContain('Sponsored post');
    expect(commentary).toContain('\\#ad \\(paid\\)');
  });

  it('posts as an organization when the author URN says so, same code path', async () => {
    const http = ok();
    const a = adapter(http, 'urn:li:organization:98765');
    const receipt = await a.publish(payload({ provider: 'linkedin_member' }), 'idem-1');
    expect((http as jest.Mock).mock.calls[0][0].body.author).toBe('urn:li:organization:98765');
    expect(receipt.requestMetadata.author_type).toBe('organization');
  });

  it('NEVER puts the token in the receipt', async () => {
    const receipt = await adapter(ok()).publish(payload(), 'idem-1');
    expect(JSON.stringify(receipt)).not.toContain(TOKEN);
    // What it does carry is countable, non-secret detail.
    expect(receipt.requestMetadata).toMatchObject({ api_version: LINKEDIN_API_VERSION, author_type: 'person' });
  });

  it('refuses without a connected account instead of calling out with no token', async () => {
    const http = ok();
    await expect(adapter(http).publish(payload({ accountId: null }), 'idem-1'))
      .rejects.toMatchObject({ permanent: true, providerCode: 'NoAccount' });
    expect(http).not.toHaveBeenCalled();
  });
});

describe('failure classification - which errors cost a post', () => {
  const failing = (status: number, body: unknown = {}): LinkedInHttp =>
    jest.fn(async () => ({ status, headers: {}, body }));

  it.each([[401], [403], [422], [400]])('treats HTTP %s as PERMANENT, so attempts are not burned', async (status) => {
    await expect(adapter(failing(status)).publish(payload(), 'idem-1'))
      .rejects.toMatchObject({ permanent: true, httpStatus: status });
  });

  it.each([[429], [500], [503]])('treats HTTP %s as TRANSIENT, so the post is not lost', async (status) => {
    // 429 is the one that looks permanent and is not: it means slow down, not stop.
    await expect(adapter(failing(status)).publish(payload(), 'idem-1'))
      .rejects.toMatchObject({ permanent: false, httpStatus: status });
  });

  it('names the constant to change when the API version is retired', async () => {
    // A 426 is a scheduled outage with no deploy behind it. The dead-letter row has to say so,
    // or somebody spends a morning looking for a code change that never happened.
    await expect(adapter(failing(426)).publish(payload(), 'idem-1')).rejects.toThrow(/LINKEDIN_API_VERSION/);
    await expect(adapter(failing(426)).publish(payload(), 'idem-1')).rejects.toMatchObject({ permanent: true });
  });

  it('surfaces the provider message and code when there is one', async () => {
    const err = await adapter(failing(422, { message: 'commentary is malformed', serviceErrorCode: 100 }))
      .publish(payload(), 'idem-1').catch((e) => e as ProviderPublishError);
    expect(err.message).toBe('commentary is malformed');
    expect(err.providerCode).toBe('100');
  });

  it('a 2xx with no post URN is PERMANENT and says the post may exist', async () => {
    // Retrying here would duplicate a post that probably succeeded. The honest move is to stop
    // and tell a person to look.
    await expect(adapter(ok({})).publish(payload(), 'idem-1'))
      .rejects.toMatchObject({ permanent: true, providerCode: 'MissingPostUrn' });
  });
});

describe('validate - failing in the composer instead of at 6am', () => {
  it('passes ordinary text', async () => {
    await expect(adapter(ok()).validate(payload())).resolves.toEqual({ ok: true });
  });

  it('refuses empty text and over-long text', async () => {
    await expect(adapter(ok()).validate(payload({ text: '   ' }))).resolves.toMatchObject({ ok: false, permanent: true });
    const long = await adapter(ok()).validate(payload({ text: 'x'.repeat(3001) }));
    expect(long).toMatchObject({ ok: false });
    expect((long as { reasons: string[] }).reasons[0]).toMatch(/3000 characters/);
  });

  it('does NOT count escape characters against the limit', async () => {
    // 2,000 brackets escape to 4,000 wire characters but are 2,000 to a reader. A naive check
    // would refuse legal copy.
    await expect(adapter(ok()).validate(payload({ text: '('.repeat(2000) }))).resolves.toEqual({ ok: true });
  });

  it('names SVG specifically, because the upload endpoint rejects it at step two', async () => {
    const r = await adapter(ok()).validate(payload({ mediaRefs: ['brand/logo.svg'] }));
    expect((r as { reasons: string[] }).reasons.join(' ')).toMatch(/does not accept SVG/);
  });

  it('says image posting is not implemented rather than publishing text and dropping the image', async () => {
    const r = await adapter(ok()).validate(payload({ mediaRefs: ['brand/hero.png'] }));
    expect((r as { reasons: string[] }).reasons.join(' ')).toMatch(/not implemented/);
  });
});

describe('what this adapter refuses to pretend it can do', () => {
  it('refuses connect, because the OAuth flow is not built', async () => {
    await expect(adapter(ok()).connect({ provider: 'linkedin_member', code: 'c', state: 's', redirectUri: 'r' }))
      .rejects.toBeInstanceOf(AdapterUnsupportedError);
  });

  it('refuses refreshCredential rather than no-opping a connection into silent death', async () => {
    await expect(adapter(ok()).refreshCredential('acc-1')).rejects.toBeInstanceOf(AdapterUnsupportedError);
  });

  it('refuses metrics rather than returning an empty page that reads as zero engagement', async () => {
    // ESC-002 is open precisely because a fabricated zero is worse than a stated gap.
    await expect(adapter(ok()).fetchOrganicMetrics({ start: '2026-09-01', end: '2026-09-13' }))
      .rejects.toBeInstanceOf(AdapterUnsupportedError);
  });

  it('reports publication status as unknown, not a guessed live', async () => {
    await expect(adapter(ok()).getPublication(POST_URN)).resolves.toMatchObject({ status: 'unknown' });
  });
});
