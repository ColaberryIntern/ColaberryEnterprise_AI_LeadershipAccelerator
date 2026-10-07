import { buildHtmlBody, buildPlainTextBody, buildSubject, likelySourceFile } from '../bugReportEmail';
import { decodeScreenshot } from '../../../routes/admin/marketingBugReportRoutes';

/**
 * The email IS the product here.
 *
 * Ali, 2026-10-07: "Make sure the email that comes through has all the specifics so claude code
 * has everything it needs to know to make the changes." So these tests are about one question -
 * could somebody act on this without writing back to ask? Each assertion names the detail whose
 * absence would force that round trip.
 */

const base = {
  summary: 'The campaign list shows email campaigns',
  whatHappened: 'Opened the composer and the campaign dropdown listed 44 campaigns, most of them paused email sequences.',
  whatExpected: 'Only marketing campaigns for this brand.',
  stepsToReproduce: '1. Open New post  2. Pick Colaberry Training  3. Open the Campaign dropdown',
  pageUrl: '/admin/marketing/composer?draft=12',
  routePath: '/admin/marketing/composer',
  brandLabel: 'Colaberry Training',
  reportedAtCentral: 'Oct 7, 2026, 10:42:00 AM CDT',
  browser: 'Mozilla/5.0 Chrome/131',
  viewport: '1512x982 @ 2x',
  reporterName: 'sohail',
  reporterEmail: 'sohail@colaberry.com',
  hasScreenshot: true,
};

describe('the subject can be triaged without opening it', () => {
  it('carries the summary and the route', () => {
    const s = buildSubject(base);
    expect(s).toContain('The campaign list shows email campaigns');
    expect(s).toContain('/admin/marketing/composer');
  });

  it('truncates a rambling summary rather than producing an unreadable subject line', () => {
    expect(buildSubject({ ...base, summary: 'x'.repeat(400) }).length).toBeLessThan(160);
  });
});

describe('the body answers the questions that would otherwise need a reply', () => {
  const text = buildPlainTextBody(base);

  it('says where - route, url and brand', () => {
    // Brand is part of "where" on these pages: the same screen behaves differently per brand.
    expect(text).toContain('/admin/marketing/composer');
    expect(text).toContain('Colaberry Training');
  });

  it('points at the likely file, and labels it as inferred rather than known', () => {
    expect(text).toContain('AdminContentComposerPage.tsx');
    expect(text).toMatch(/inferred from the route/i);
  });

  it('keeps what happened and what was expected apart', () => {
    expect(text).toContain('WHAT HAPPENED');
    expect(text).toContain('WHAT THEY EXPECTED');
    expect(text).toContain('Only marketing campaigns for this brand.');
  });

  it('names who reported it and when, in Central', () => {
    expect(text).toContain('sohail@colaberry.com');
    expect(text).toContain('Oct 7, 2026, 10:42:00 AM CDT');
  });

  it('says whether a screenshot is attached, either way', () => {
    expect(buildPlainTextBody(base)).toContain('attached to this email');
    expect(buildPlainTextBody({ ...base, hasScreenshot: false })).toContain('NOT provided');
  });
});

describe('evidence captured before the report was opened', () => {
  it('lists console errors with their kind', () => {
    const text = buildPlainTextBody({
      ...base,
      errors: [{ at: 't', kind: 'console.error', message: 'Cannot read properties of null' }],
    });
    expect(text).toContain('CONSOLE ERRORS (1)');
    expect(text).toContain('Cannot read properties of null');
  });

  it('lists failed requests with method, path and status', () => {
    const text = buildPlainTextBody({
      ...base,
      failedRequests: [{ at: 't', method: 'POST', url: '/api/admin/landing-pages', status: 500, ms: 120 }],
    });
    expect(text).toContain('POST /api/admin/landing-pages -> 500');
  });

  it('says explicitly that nothing was captured, rather than showing an empty heading', () => {
    // An empty section reads as "we did not look". It matters that the reader can tell the
    // difference between no errors and no recording.
    const text = buildPlainTextBody(base);
    expect(text).toContain('CONSOLE ERRORS (0)');
    expect(text).toMatch(/None captured/);
  });
});

describe('the route-to-file map covers the Marketing section', () => {
  it.each([
    ['/admin/marketing', 'AdminMarketingOverviewPage'],
    ['/admin/marketing/composer', 'AdminContentComposerPage'],
    ['/admin/marketing/landing-pages', 'AdminLandingPagesPage'],
    ['/admin/marketing/content', 'AdminContentQueuePage'],
    ['/admin/marketing/calendar', 'AdminMarketingCalendarPage'],
    ['/admin/marketing/publishing', 'AdminPublishingQueuePage'],
    ['/admin/marketing/performance', 'AdminMarketingPerformancePage'],
    ['/admin/marketing/brands', 'AdminBrandsPage'],
  ])('%s -> %s', (route, file) => {
    expect(likelySourceFile(route)).toContain(file);
  });

  it('returns null for a route it does not know, instead of guessing', () => {
    expect(likelySourceFile('/admin/revenue')).toBeNull();
    expect(buildPlainTextBody({ ...base, routePath: '/admin/revenue' })).not.toContain('Likely file');
  });
});

describe('operator text cannot become markup in the HTML part', () => {
  it('escapes a summary that looks like a tag', () => {
    const html = buildHtmlBody({ ...base, summary: '<img src=x onerror=alert(1)>' });
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toMatch(/<img[^>]*\ssrc=x/);
  });

  it('escapes it in the console block too', () => {
    const html = buildHtmlBody({ ...base, errors: [{ at: 't', kind: 'console.error', message: '</pre><script>bad()</script>' }] });
    expect(html).not.toContain('<script>bad()');
    expect(html).toContain('&lt;/pre&gt;');
  });
});

describe('the screenshot becomes a real attachment, not an inline data URI', () => {
  // Gmail does not render base64 data: URIs at all, so an inlined screenshot would silently
  // show nothing in the one client that matters here. The data URI is only how the browser
  // ships the bytes; what leaves the server is a file.
  const onePixelPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  it('decodes a png into a buffer with a filename', () => {
    const out = decodeScreenshot(onePixelPng);
    expect(out).not.toBeNull();
    expect(Buffer.isBuffer(out!.buffer)).toBe(true);
    expect(out!.buffer.length).toBeGreaterThan(0);
    expect(out!.filename).toBe('screenshot.png');
  });

  it.each([
    ['nothing at all', undefined],
    ['a plain string', 'not a data url'],
    ['a script disguised as one', 'data:text/html;base64,PHNjcmlwdD4='],
    ['an svg, which can carry script', 'data:image/svg+xml;base64,PHN2Zz4='],
  ])('refuses %s rather than attaching it', (_label, value) => {
    expect(decodeScreenshot(value as string | undefined)).toBeNull();
  });

  it('refuses an image too large to email', () => {
    const huge = `data:image/png;base64,${'A'.repeat(9 * 1024 * 1024)}`;
    expect(decodeScreenshot(huge)).toBeNull();
  });
});
