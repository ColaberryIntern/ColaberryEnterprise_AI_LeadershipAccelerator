import { isValidPixelId, metaPixelHead, metaPixelCspAdditions } from '../landingPagePixel';
import { renderLandingPage } from '../landingPageRenderer';
import { parseLandingPageContent } from '../../../schemas/landingPageContentSchema';

/**
 * The pixel is a third-party script on a public page, so the tests that matter are the ones about
 * what CANNOT happen:
 *
 *   1. A brand with no pixel gets NO third-party script and NO relaxed policy. Seven of eight
 *      brands are in that state, and a marketing tag on a page nobody is advertising is both a
 *      privacy cost and a request to an outside host for no return.
 *   2. An ID that is not a plain run of digits never reaches a script tag. The value is
 *      operator-supplied and lands inside `fbq('init', ...)`; the database has a CHECK, and this
 *      is the second end of the same validation, because a row can be written by a path that
 *      bypassed it.
 *   3. The nonce in the markup is the nonce in the policy. If those two ever disagree the script
 *      is silently blocked, the page looks perfect, and the ads run untracked - the worst kind of
 *      failure, because the symptom appears on a dashboard days later.
 */

const CONTENT = (() => {
  const r = parseLandingPageContent({ sections: [{ type: 'hero', headline: 'Start learning AI' }] });
  if (!r.ok) throw new Error('fixture invalid');
  return r.content;
})();

const NONCE = 'r4nd0mN0nc3VaLu3==';
const REAL_ID = '2250748725203240'; // Sohail's, from Basecamp todo 10361643851

function render(meta_pixel_id: string | null, cspNonce: string = NONCE): string {
  return renderLandingPage({
    content: CONTENT,
    brand: { name: 'Colaberry Training', default_theme_key: 'training', meta_pixel_id },
    siteSlug: 'colaberry-training',
    pageUrl: 'https://www.refactored.ai/lp/colaberry-training/ai-learning-platform',
    cspNonce,
  }).html;
}

describe('a brand with no pixel carries no tracking at all', () => {
  it.each([null, undefined, ''])('%p emits nothing', (id) => {
    expect(metaPixelHead(id as string | null, NONCE)).toBe('');
    expect(metaPixelCspAdditions(id as string | null, NONCE)).toEqual([]);
  });

  it('the rendered page contains no facebook request of any kind', () => {
    const html = render(null);
    expect(html).not.toMatch(/facebook/i);
    expect(html).not.toContain('fbq');
    // And no inline script, which is what the strict policy is protecting.
    expect(html).not.toMatch(/<script(?![^>]*\ssrc=)/);
  });
});

describe('an id that is not digits never reaches a script tag', () => {
  const EVIL = [
    "123');alert(1);//",
    '<script>alert(1)</script>',
    '2250748725203240" onload="alert(1)',
    'abc123',
    '123',                    // too short to be a Meta ID
    '1'.repeat(21),           // too long
    ' 2250748725203240',      // leading space
  ];

  it.each(EVIL)('%p is rejected', (id) => {
    expect(isValidPixelId(id)).toBe(false);
    expect(metaPixelHead(id, NONCE)).toBe('');
  });

  it.each(EVIL)('%p produces a page with no pixel rather than a broken one', (id) => {
    const html = render(id);
    expect(html).not.toContain('fbq');
    expect(html).not.toContain('alert(1)');
  });

  it('the real id IS accepted, so the rejections above are not vacuous', () => {
    expect(isValidPixelId(REAL_ID)).toBe(true);
    expect(metaPixelHead(REAL_ID, NONCE)).toContain(REAL_ID);
  });
});

describe('what a configured brand actually emits', () => {
  const html = render(REAL_ID);

  it.each([
    ['the bootstrap', 'connect.facebook.net/en_US/fbevents.js'],
    ['init with the brand id', `fbq('init','${REAL_ID}')`],
    ['a PageView', "fbq('track','PageView')"],
    ['the noscript image', `https://www.facebook.com/tr?id=${REAL_ID}&ev=PageView&noscript=1`],
  ])('%s', (_name, needle) => {
    expect(html).toContain(needle);
  });

  it('sits inside <head>, which is where Sohail asked for it', () => {
    const head = html.slice(0, html.indexOf('</head>'));
    expect(head).toContain('fbq(');
  });

  it('the inline block carries the nonce, or the browser silently drops it', () => {
    expect(html).toContain(`<script nonce="${NONCE}">`);
  });

  it('the policy admits exactly that nonce and that host', () => {
    const additions = metaPixelCspAdditions(REAL_ID, NONCE);
    const scriptSrc = additions.find(([d]) => d === 'script-src')?.[1] ?? '';
    expect(scriptSrc).toContain('https://connect.facebook.net');
    expect(scriptSrc).toContain(`'nonce-${NONCE}'`);
    // Never the blanket escape hatch: that would admit an injected inline script too.
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });
});

describe('without a nonce there is no pixel', () => {
  it('a caller that supplies no nonce gets no tracking rather than a blocked script', () => {
    // The preview route and the fixture script render without one. Emitting an inline script
    // they cannot authorise would render a page whose console is full of CSP violations.
    //
    // Calls the renderer DIRECTLY rather than the helper above: a default parameter
    // (`cspNonce = NONCE`) also fires for an explicitly passed `undefined`, so the helper
    // rendered WITH a nonce and this test failed against correct code. A default is not a way
    // to express "the caller omitted it".
    const html = renderLandingPage({
      content: CONTENT,
      brand: { name: 'Colaberry Training', default_theme_key: 'training', meta_pixel_id: REAL_ID },
      siteSlug: 'colaberry-training',
      pageUrl: 'https://www.refactored.ai/lp/colaberry-training/ai-learning-platform',
    }).html;
    expect(html).not.toContain('fbq');
  });
});
