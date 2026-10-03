import fs from 'fs';
import path from 'path';

/**
 * Every public backend prefix has an nginx proxy block.
 *
 * THE BUG THIS EXISTS FOR. A public route mounted in Express is not reachable from outside
 * unless the container nginx is told to proxy its prefix. Without a block, the SPA catch-all
 * answers `index.html` with a **200** - so the link appears to work, shows the app shell, and
 * records nothing. There is no error anywhere to notice.
 *
 * It has now happened twice. `/r/` (tracked-link redirects) was found on the dev instance on
 * 2026-09-11 and its block carries the note. `/lp/` (hosted landing pages) shipped across three
 * PRs on 2026-10-01/02 and was unreachable on the public host the whole time, which a `curl`
 * against production is what finally revealed. A unit test cannot prove nginx routes correctly -
 * only a request can - but it can prove the block EXISTS, which is the part that was missing
 * both times.
 *
 * Deliberately a plain list rather than something derived from the route files: the thing worth
 * pinning is the human decision "this prefix is public and must be proxied", and a derivation
 * clever enough to find that would be another thing that can be wrong.
 */

const NGINX_CONF = path.resolve(__dirname, '..', '..', '..', 'nginx', 'nginx.conf');

/** Public prefixes served by the BACKEND, each with the route file that owns it. */
const PUBLIC_BACKEND_PREFIXES: Array<{ prefix: string; owner: string }> = [
  { prefix: '/r/', owner: 'routes/trackedLinkRedirectRoutes.ts' },
  { prefix: '/i/', owner: 'routes/openclawShortLinkRoutes.ts' },
  { prefix: '/qr/', owner: 'routes/qrRedirectRoutes.ts' },
  { prefix: '/m/', owner: 'routes/mediaFetchRoutes.ts' },
  { prefix: '/lp/', owner: 'routes/publicLandingPageRoutes.ts' },
];

/** Prefixes that look similar but are FRONTEND routes. A proxy block here would break them. */
const FRONTEND_PREFIXES = ['/p/'];

const conf = fs.readFileSync(NGINX_CONF, 'utf8');

/** The body of the `location <prefix> { ... }` block, or null when there is no such block. */
function locationBody(prefix: string): string | null {
  // `^~ ` is optional; both forms appear in this file.
  const re = new RegExp(`location\\s+(?:\\^~\\s+)?${prefix.replace(/\//g, '\\/')}\\s*\\{`);
  const m = re.exec(conf);
  if (!m) return null;
  let depth = 0;
  let i = m.index + m[0].length - 1;
  const start = i;
  for (; i < conf.length; i += 1) {
    if (conf[i] === '{') depth += 1;
    else if (conf[i] === '}') {
      depth -= 1;
      if (depth === 0) return conf.slice(start + 1, i);
    }
  }
  return null;
}

describe('the config is readable, which every check below depends on', () => {
  it('nginx.conf is where it is expected to be', () => {
    expect(fs.existsSync(NGINX_CONF)).toBe(true);
  });

  it('the block parser works - a positive control, so a broken regex cannot pass everything', () => {
    // If `locationBody` silently returned null for everything, every assertion below would be
    // comparing null to null in whatever direction happened to pass.
    const body = locationBody('/api/');
    expect(body).not.toBeNull();
    expect(body).toMatch(/proxy_pass/);
  });
});

describe('every public backend prefix is proxied', () => {
  it.each(PUBLIC_BACKEND_PREFIXES)('$prefix has a location block ($owner)', ({ prefix }) => {
    expect(locationBody(prefix)).not.toBeNull();
  });

  it.each(PUBLIC_BACKEND_PREFIXES)('$prefix proxies to the backend, not the static root', ({ prefix }) => {
    const body = locationBody(prefix)!;
    expect(body).toMatch(/proxy_pass\s+http:\/\/accelerator-backend:3001/);
    // try_files here would serve the SPA and swallow the route - and it also drops add_header.
    expect(body).not.toMatch(/try_files/);
  });

  it.each(PUBLIC_BACKEND_PREFIXES)('$prefix forwards the headers the route reads', ({ prefix }) => {
    const body = locationBody(prefix)!;
    // publicLandingPageRoutes builds its canonical and OG urls from these.
    expect(body).toMatch(/X-Forwarded-Proto/);
    expect(body).toMatch(/proxy_set_header\s+Host/);
  });
});

describe('the prefix collision that caused this', () => {
  it('/p/ is a FRONTEND route and must not be proxied to the backend', () => {
    // `/p/` is the public career portfolio, served as the SPA shell with a noindex header.
    // Landing pages live at /lp/ precisely because this was already taken.
    const body = locationBody('/p/');
    expect(body).not.toBeNull();
    expect(body).not.toMatch(/proxy_pass/);
  });

  it.each(FRONTEND_PREFIXES)('%s is not in the public-backend list', (prefix) => {
    expect(PUBLIC_BACKEND_PREFIXES.map((p) => p.prefix)).not.toContain(prefix);
  });

  it('/lp/ and /p/ are different blocks, so neither shadows the other', () => {
    expect(locationBody('/lp/')).not.toEqual(locationBody('/p/'));
  });

  it('the landing page route itself uses /lp/, matching the block', () => {
    // The two have to agree. They did not, for three PRs.
    const route = fs.readFileSync(
      path.resolve(__dirname, '..', 'routes', 'publicLandingPageRoutes.ts'), 'utf8',
    );
    expect(route).toMatch(/router\.get\('\/lp\/:brand\/:slug'/);
    // The negative is the point: `/p/` is the career portfolio, and this is what would catch a
    // revert to it. (A blanket /p/ -> /lp/ rename briefly turned this line into a copy of the
    // one above, which asserted nothing - negative assertions do not survive find-and-replace.)
    expect(route).not.toMatch(/router\.get\('\/p\/:brand\/:slug'/);
  });
});

describe('the extension-regex trap', () => {
  it.each(['/m/', '/lp/'])('%s uses ^~ so a dotted slug is not hijacked by a static-file rule', (prefix) => {
    // Without `^~`, the `\.(ico|png|...)$` and `\.(mp4|...)$` locations win on the extension and
    // answer with a static-file 404 - which is what the public host did to /m/ on 2026-09-15.
    const re = new RegExp(`location\\s+\\^~\\s+${prefix.replace(/\//g, '\\/')}\\s*\\{`);
    expect(conf).toMatch(re);
  });
});
