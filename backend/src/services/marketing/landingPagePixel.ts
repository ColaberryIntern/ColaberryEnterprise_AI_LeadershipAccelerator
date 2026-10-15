/**
 * The Meta Pixel for a hosted landing page, built from the brand's ID.
 *
 * WHY THIS IS A MODULE AND NOT A PASTE. Sohail sent a snippet and asked for it on one page
 * (Basecamp todo 10361643851). The snippet is the standard Meta bootstrap with one value that
 * differs per advertiser - the Pixel ID - so pasting it would hard-code one brand's ID into a
 * renderer that serves eight brands. Here the ID comes from `brands.meta_pixel_id` and the
 * markup is generated, which is what makes "the user just passes the ID" true.
 *
 * WHAT IT EMITS is Meta's own bootstrap, unchanged in behaviour: the queue shim, the async
 * `fbevents.js` load, `init` with the brand's ID, and one `PageView`. Plus the `<noscript>`
 * tracking image, which is the half most people drop and which is the only signal from a visitor
 * with scripting off.
 *
 * TWO THINGS THIS DOES THAT A PASTE DOES NOT:
 *
 *   1. NONCE. The page's CSP is `script-src 'self'` with no inline script anywhere - deliberate,
 *      because the page renders operator-supplied copy and an XSS there would run on our own
 *      origin. Meta's bootstrap is inline, and the lazy way to admit it is `'unsafe-inline'`,
 *      which would admit every OTHER inline script too and undo that protection for a marketing
 *      tag. A per-response nonce admits exactly this one block and nothing else.
 *
 *   2. THE ID IS VALIDATED HERE TOO, not only in the database. The column has a digits-only
 *      CHECK, but this function is what interpolates into a script tag, and a renderer that
 *      trusts its input because something upstream promised to check is how injection arrives.
 *      A value that is not a plain run of digits yields NO pixel rather than a broken one.
 */

/** Meta's IDs are 15-16 digit numerics; the range matches the column's CHECK constraint. */
const PIXEL_ID = /^[0-9]{8,20}$/;

export function isValidPixelId(value: string | null | undefined): boolean {
  return typeof value === 'string' && PIXEL_ID.test(value);
}

/**
 * The `<head>` block: bootstrap, init, PageView, and the noscript image.
 *
 * Returns '' when the brand has no pixel, which is the normal case for seven of eight brands -
 * a page for an unadvertised brand should carry no third-party script at all.
 */
export function metaPixelHead(pixelId: string | null | undefined, nonce: string): string {
  if (!isValidPixelId(pixelId)) return '';
  const id = String(pixelId);
  return [
    '<!-- Meta Pixel Code -->',
    `<script nonce="${nonce}">`,
    "!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?",
    'n.callMethod.apply(n,arguments):n.queue.push(arguments)};',
    "if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';",
    'n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;',
    's=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,',
    "'script','https://connect.facebook.net/en_US/fbevents.js');",
    `fbq('init','${id}');fbq('track','PageView');`,
    // REMEMBER WHICH PIXEL SAW THIS PERSON, so the signup page can report the Lead against
    // the same one.
    //
    // The portal cannot work this out for itself. It resolves a pixel from its HOSTNAME, and
    // the hostname belongs to a different brand than the page: /lp/colaberry-training/... is
    // served on www.refactored.ai, which brand_domains maps to the `refactored` brand, which
    // has no pixel. So the host lookup returns null and the Lead never fires - which is
    // exactly what it did on 2026-10-15, with the pixel correctly installed on this page.
    //
    // Same origin, so localStorage is readable by the portal. Wrapped because a browser with
    // storage disabled must still get a working pixel - it only loses the carry-forward.
    `try{localStorage.setItem('cb.meta.pixel','${id}')}catch(e){}`,
    '</script>',
    '<noscript><img height="1" width="1" style="display:none" alt=""',
    ` src="https://www.facebook.com/tr?id=${id}&ev=PageView&noscript=1"></noscript>`,
    '<!-- End Meta Pixel Code -->',
  ].join('\n');
}

/**
 * The CSP additions a pixel needs, as `[directive, value]` pairs to merge into the base policy.
 *
 * Returns [] when there is no pixel, so a page that is not advertised keeps the strictest policy
 * it has always had. That is the whole reason this returns additions rather than a finished
 * header: the relaxation is scoped to pages that actually carry a tag.
 *
 * `img-src` and `connect-src` already allow `https:` in the base policy, so the noscript image
 * and the event beacons are covered without change; only the script source and the nonce are new.
 */
export function metaPixelCspAdditions(
  pixelId: string | null | undefined,
  nonce: string,
): Array<[string, string]> {
  if (!isValidPixelId(pixelId)) return [];
  return [
    ['script-src', `https://connect.facebook.net 'nonce-${nonce}'`],
  ];
}
