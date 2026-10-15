import { readFileSync } from 'fs';
import { join } from 'path';
import { metaPixelCspAdditions } from '../landingPagePixel';

/**
 * TWO policies reach the browser, and a script has to satisfy BOTH.
 *
 * This is the bug this file exists to prevent, and it shipped: the backend set a per-response
 * CSP for /lp/ that allowed `connect.facebook.net`, nginx added its own app-wide policy with
 * `always`, and a browser enforces the intersection. The Meta host was in one policy and not the
 * other, so `fbevents.js` was refused.
 *
 * WHY IT LOOKED FINE. Every observable except the actual network request said yes. The markup
 * carried the right pixel ID. The inline bootstrap ran, because both policies admitted it. The
 * page defined `window.fbq`, and `fbq.loaded` was `true` - the bootstrap sets that itself,
 * before the script it is bootstrapping has loaded. Events queued silently and were never sent.
 * A curl of the page and a grep for `fbq('init'` both passed while nothing was being tracked.
 *
 * So this test reads the nginx config as text and checks the one property that matters: every
 * host the pixel needs is present in BOTH policies. It cannot catch every CSP interaction, and
 * it is not trying to - it catches this one, which cost a deploy to find.
 */

const NGINX_CSP = join(__dirname, '..', '..', '..', '..', '..', 'nginx', 'security-headers.conf');

/** The `script-src` list out of the nginx `add_header Content-Security-Policy` line. */
function nginxScriptSrc(): string {
  const conf = readFileSync(NGINX_CSP, 'utf8');
  // Comment lines start with '#'. A host mentioned only in a comment is not in the policy, and
  // matching one would make this test pass on an explanation of the fix rather than the fix.
  const line = conf
    .split('\n')
    .find((l) => !l.trimStart().startsWith('#') && l.includes('add_header Content-Security-Policy'));
  if (!line) throw new Error('no Content-Security-Policy add_header in the nginx config');
  const match = /script-src ([^;]+);/.exec(line);
  if (!match) throw new Error('no script-src in the nginx Content-Security-Policy');
  return match[1];
}

describe('every host the pixel needs is in BOTH policies', () => {
  const NONCE = 'test-nonce-value';
  const PIXEL = '2250748725203240';

  it('the nginx policy parsed, otherwise every check below is vacuous', () => {
    const src = nginxScriptSrc();
    expect(src).toContain("'self'");
    expect(src.length).toBeGreaterThan(20);
  });

  it('the backend policy names connect.facebook.net', () => {
    const scriptSrc = metaPixelCspAdditions(PIXEL, NONCE).find(([d]) => d === 'script-src')?.[1] ?? '';
    expect(scriptSrc).toContain('https://connect.facebook.net');
  });

  it('and so does nginx, which is the half that was missing', () => {
    expect(nginxScriptSrc()).toContain('https://connect.facebook.net');
  });

  it('the host is in the policy itself, not only in a comment explaining it', () => {
    // The parser above skips comment lines; this asserts the skipping actually happened, so a
    // future edit that only documents the host cannot satisfy the test above.
    const conf = readFileSync(NGINX_CSP, 'utf8');
    const inComments = conf
      .split('\n')
      .filter((l) => l.trimStart().startsWith('#'))
      .join('\n');
    expect(inComments).toContain('connect.facebook.net');
    expect(nginxScriptSrc()).toContain('connect.facebook.net');
  });
});
