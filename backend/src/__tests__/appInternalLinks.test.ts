import * as fs from 'fs';
import * as path from 'path';

/**
 * Every internal link in a public app must resolve to something we actually serve.
 *
 * WHY THIS EXISTS. The refactored.ai port originally wrote pages flat — `individuals.html`
 * — while the captured markup links to `/individuals/`, because the real site serves
 * directory URLs. Nothing resolved: nginx tried `/individuals/`, `/individuals//` and
 * `/individuals/.html` and found none of them. The homepage looked perfect and every
 * navigation link 404'd, which is the worst shape a bug can take: it demos fine.
 *
 * Nothing caught it because the build only copies files — it has no idea what the pages
 * link to. This test closes that gap by resolving each link the way nginx would.
 *
 * Reads the built markup with `fs` rather than importing from `apps/`, so it adds no
 * module coupling and cannot trip the extraction boundary validator.
 */

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const APPS_DIR = path.join(REPO_ROOT, 'apps');

/**
 * Paths served by the legacy origin through the cutover proxy, never by us.
 *
 * This list is the honest inventory of what the rebuilt marketing pages still hand back
 * to the old application: authentication, the social login callbacks, password reset, the
 * course catalogue and the learner dashboard. In the PREVIEW these 404 by design — the
 * preview has no proxy fallback precisely so a missing page is visible rather than
 * silently backfilled by the old site. After cutover the proxy serves every one of them.
 *
 * `/cdn-cgi/` is Cloudflare's own email-obfuscation endpoint, injected into the markup by
 * Cloudflare itself and handled at their edge — never by any origin.
 */
const PROXIED_TO_LEGACY = [
  /^\/signin/, /^\/signup/, /^\/dashboard/,
  /^\/course\//, /^\/learn\//, /^\/register-course\//,
  /^\/auth\b/, /^\/platforms\b/, /^\/social\//, /^\/password\//,
  /^\/sitemap\.xml$/,
  /^\/cdn-cgi\//,
];

/** Resolve a URL path against a built app directory, the way `try_files` would. */
function resolves(appSrc: string, urlPath: string): boolean {
  // Trim first: the captured markup contains `href="/ "` with a trailing space, which a
  // browser treats as "/". Comparing it untrimmed reports a broken link that works fine.
  const clean = urlPath.trim().split('#')[0].split('?')[0];
  if (clean === '/' || clean === '') return fs.existsSync(path.join(appSrc, 'index.html'));

  const rel = clean.replace(/^\//, '').replace(/\/$/, '');
  const candidates = [
    path.join(appSrc, rel, 'index.html'), // directory URL: /individuals/ -> individuals/index.html
    path.join(appSrc, rel + '.html'),     // flat page:      /about        -> about.html
    path.join(appSrc, rel),               // literal asset:  /assets/x.js
  ];
  return candidates.some((c) => fs.existsSync(c));
}

function internalLinks(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/href="(\/[^"]*)"/g)) {
    const href = m[1];
    if (href.startsWith('//')) continue; // protocol-relative = external
    out.push(href);
  }
  return out;
}

function appsWithSrc(): string[] {
  if (!fs.existsSync(APPS_DIR)) return [];
  return fs.readdirSync(APPS_DIR).filter((a) => fs.existsSync(path.join(APPS_DIR, a, 'src')));
}

describe('internal links in the public apps resolve to pages we serve', () => {
  const apps = appsWithSrc();

  it('finds apps and links at all — a green run over nothing proves nothing', () => {
    expect(apps.length).toBeGreaterThan(0);
    const total = apps.reduce((n, app) => {
      const src = path.join(APPS_DIR, app, 'src');
      const files = fs.readdirSync(src, { recursive: true } as never) as unknown as string[];
      return n + files.filter((f) => String(f).endsWith('.html'))
        .reduce((m, f) => m + internalLinks(fs.readFileSync(path.join(src, String(f)), 'utf8')).length, 0);
    }, 0);
    expect(total).toBeGreaterThan(0);
  });

  it.each(appsWithSrc())('%s: every internal link resolves, or is a known proxied path', (app) => {
    const src = path.join(APPS_DIR, app, 'src');
    const files = (fs.readdirSync(src, { recursive: true } as never) as unknown as string[])
      .map(String)
      .filter((f) => f.endsWith('.html'));

    const broken: string[] = [];
    for (const file of files) {
      const html = fs.readFileSync(path.join(src, file), 'utf8');
      for (const href of new Set(internalLinks(html))) {
        // Paths the cutover proxy hands to the legacy origin are not ours to serve. In the
        // PREVIEW they 404 by design, which is why the preview has no proxy fallback: a
        // missing page should be visible, not silently backfilled by the old site.
        if (PROXIED_TO_LEGACY.some((re) => re.test(href.trim()))) continue;
        if (!resolves(src, href)) broken.push(`${file} -> ${href}`);
      }
    }

    expect(broken).toEqual([]);
  });
});
