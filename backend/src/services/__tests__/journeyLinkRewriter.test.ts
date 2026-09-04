/**
 * A journey token goes on our own links, and nowhere else.
 *
 * The property worth testing here is a security one, and it fails silently in the
 * dangerous direction. If the allowlist stops working, tokens are appended to third-party
 * URLs — handing our visitor and lead identifiers to whoever runs that host, in a query
 * string that lands in their access logs. Nothing throws. The email still sends. The links
 * still work.
 *
 * The second property is that tokens are PER RECIPIENT. The obvious implementation mints
 * one link per campaign, which puts one person's identity into everybody's email and lets
 * any recipient bind their browser to another's journey. Two recipients getting the same
 * token is the whole bug, so it is asserted directly.
 */
jest.mock('../../models', () => ({ BrandDomain: { findAll: jest.fn() } }));

import { BrandDomain } from '../../models';
import { verifyJourneyToken } from '../../modules/attribution/journeyLinkService';
import { rewriteLinksWithJourneyToken, __resetLinkableHostnameCache } from '../journeyLinkRewriter';

const findAllMock = BrandDomain.findAll as unknown as jest.Mock;

function jxOf(html: string): string | null {
  const m = html.match(/[?&]jx=([^"&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

beforeEach(() => {
  __resetLinkableHostnameCache();
  findAllMock.mockReset();
  findAllMock.mockResolvedValue([
    { hostname: 'aiflotation.com', purpose: 'web' },
    { hostname: 'opportunitylift.org', purpose: 'web' },
    { hostname: 'enterprise.colaberry.ai', purpose: 'app' },
  ]);
});

describe('only our own hostnames are touched', () => {
  it('appends a token to a brand link', async () => {
    const out = await rewriteLinksWithJourneyToken(
      '<a href="https://aiflotation.com/pricing">Pricing</a>',
      { leadId: 42 },
    );
    expect(out).toContain('jx=');
    const payload = verifyJourneyToken(jxOf(out));
    expect(payload?.l).toBe(42);
  });

  it('leaves third-party links completely alone', async () => {
    // The failure that matters. A token here leaks identifiers into somebody else's logs.
    const html =
      '<a href="https://calendly.com/book">Book</a>' +
      '<a href="https://docs.google.com/x">Doc</a>' +
      '<a href="https://aiflotation.com.evil.test/phish">Lookalike</a>';
    const out = await rewriteLinksWithJourneyToken(html, { leadId: 42 });
    expect(out).toBe(html);
    expect(out).not.toContain('jx=');
  });

  it('is not fooled by a hostname that merely contains ours', async () => {
    // `aiflotation.com.evil.test` and `notaiflotation.com` both contain the string but
    // are other people's hosts. Matching must be on the parsed hostname, not substring.
    const html = '<a href="https://notaiflotation.com/x">x</a>';
    expect(await rewriteLinksWithJourneyToken(html, { leadId: 42 })).toBe(html);
  });

  it('leaves mailto, tel and relative links alone', async () => {
    const html =
      '<a href="mailto:build@aiflotation.com">mail</a>' +
      '<a href="tel:+15551234">call</a>' +
      '<a href="/pricing">relative</a>';
    expect(await rewriteLinksWithJourneyToken(html, { leadId: 42 })).toBe(html);
  });

  it('never rewrites the unsubscribe link', async () => {
    // It carries its own signature, and one-click unsubscribe has to keep working under
    // RFC 8058. Someone leaving is also not a journey worth attributing.
    const html = '<a href="https://enterprise.colaberry.ai/api/unsubscribe?lid=1&sig=abc">Unsubscribe</a>';
    expect(await rewriteLinksWithJourneyToken(html, { leadId: 42 })).toBe(html);
  });

  it('does not replace a token that is already there', async () => {
    const html = '<a href="https://aiflotation.com/x?jx=already">x</a>';
    expect(await rewriteLinksWithJourneyToken(html, { leadId: 42 })).toBe(html);
  });
});

describe('tokens are per recipient', () => {
  it('mints a different token for each lead', async () => {
    // The bug this exists to prevent: one link per campaign, so every recipient carries
    // the same identity and any of them can claim another's journey.
    const html = '<a href="https://aiflotation.com/pricing">p</a>';
    const a = jxOf(await rewriteLinksWithJourneyToken(html, { leadId: 1 }));
    const b = jxOf(await rewriteLinksWithJourneyToken(html, { leadId: 2 }));
    expect(a).not.toBe(b);
    expect(verifyJourneyToken(a)?.l).toBe(1);
    expect(verifyJourneyToken(b)?.l).toBe(2);
  });

  it('mints a verifiable token, not an opaque string that merely looks like one', async () => {
    const out = await rewriteLinksWithJourneyToken(
      '<a href="https://opportunitylift.org/">home</a>',
      { leadId: 7, campaignId: 'camp-1' },
    );
    const payload = verifyJourneyToken(jxOf(out));
    expect(payload).not.toBeNull();
    expect(payload?.l).toBe(7);
    expect(payload?.c).toBe('camp-1');
    // A tampered token must not verify.
    expect(verifyJourneyToken((jxOf(out) as string).replace(/.$/, 'X'))).toBeNull();
  });
});

describe('it declines to act rather than guessing', () => {
  it('returns the html untouched when there is nobody to mint for', async () => {
    const html = '<a href="https://aiflotation.com/x">x</a>';
    expect(await rewriteLinksWithJourneyToken(html, {})).toBe(html);
    expect(await rewriteLinksWithJourneyToken(html, { leadId: null })).toBe(html);
    // No lookup should even be attempted when there is nothing to bind.
    expect(findAllMock).not.toHaveBeenCalled();
  });

  it('fails to an EMPTY allowlist when the lookup errors, never a permissive one', async () => {
    findAllMock.mockRejectedValue(new Error('db down'));
    const html = '<a href="https://aiflotation.com/x">x</a>';
    expect(await rewriteLinksWithJourneyToken(html, { leadId: 42 })).toBe(html);
  });

  it('handles an empty body without throwing', async () => {
    expect(await rewriteLinksWithJourneyToken('', { leadId: 42 })).toBe('');
  });
});
