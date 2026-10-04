import * as fs from 'fs';
import * as path from 'path';

/**
 * A backend route that serves a FILENAME must have a `^~` location, or nginx answers it
 * from the static root.
 *
 * WHY THIS EXISTS. In nginx a regex location beats a prefix location unless the prefix
 * carries `^~`. `nginx.conf` declares `location ~* \.vtt$` and
 * `location ~* \.(mp4|webm|m4a)$` (plus an image set), so ANY backend path ending in one of
 * those extensions is captured by the regex and answered `try_files $uri =404` out of the
 * static root, with a `public` cache header, before the proxy is ever considered.
 *
 * This has already cost one production incident: `/m/` shipped as a plain prefix location
 * and the public host 404'd every signed image on 2026-09-15, while the backend route
 * answered correctly when reached directly. `/m/` was then given `^~`.
 *
 * It nearly cost a second. `/bm/` (signed replay playback, added 2026-10-04) shipped with no
 * nginx location at all; an independent verifier caught it before the first deploy. Nothing
 * in the build, `nginx -t`, or any test would have failed - the breakage is purely a
 * consequence of location-matching precedence.
 *
 * So this suite is driven by the ROUTES, not by the config: it discovers every public
 * non-`/api` prefix the backend registers and requires each to be classified. A new public
 * file route therefore fails here until someone decides, in writing, whether it needs `^~`.
 */

const ROUTES_DIR = path.resolve(__dirname, '..', 'routes');
const NGINX = path.resolve(__dirname, '..', '..', '..', 'nginx', 'nginx.conf');

/**
 * Prefixes whose final path segment is a FILENAME, so a request under them can end in an
 * extension a regex location claims. These must carry `^~`.
 */
const FILENAME_BEARING: Record<string, string> = {
  '/m/': 'mediaFetchRoutes - /m/:brand/:file, e.g. /m/<brand>/<sha256>.png',
  '/bm/': 'broadcastMediaRoutes - /bm/broadcast/:occurrenceId/:asset, e.g. .../replay.mp4',
};

/**
 * Prefixes whose segments are slugs, tags or codes and never carry an extension. They still
 * need a location so they reach the backend at all, but `^~` is not load-bearing for them.
 */
const EXTENSIONLESS: Record<string, string> = {
  '/api/': 'the whole JSON API',
  '/health/': 'healthRoutes - /health/full',
  '/i/': 'openclawShortLinkRoutes - /i/:tag',
  '/qr/': 'qrRedirectRoutes - /qr/:slug',
  '/r/': 'trackedLinkRedirectRoutes - /r/:shortCode',
};

/** Every `/<prefix>/` a router registers outside the /api namespace. */
function discoveredPrefixes(): string[] {
  const found = new Set<string>();
  for (const file of fs.readdirSync(ROUTES_DIR).filter((f) => f.endsWith('.ts'))) {
    const src = fs.readFileSync(path.join(ROUTES_DIR, file), 'utf8');
    for (const m of src.matchAll(/router\.(?:get|post|put|patch|delete)\(\s*'(\/[a-z0-9-]+)\//g)) {
      found.add(`${m[1]}/`);
    }
  }
  return [...found].sort();
}

const nginxConf = fs.readFileSync(NGINX, 'utf8');

/** `location ^~ /bm/ {` — the prefix form that outranks a regex. */
function hasGuardedLocation(prefix: string): boolean {
  const bare = prefix.replace(/\/$/, '');
  return new RegExp(`location\\s+\\^~\\s+${bare}/?\\s*\\{`).test(nginxConf);
}

/** Any location at all for this prefix, guarded or not. */
function hasAnyLocation(prefix: string): boolean {
  const bare = prefix.replace(/\/$/, '');
  return new RegExp(`location\\s+(?:\\^~\\s+)?${bare}/?\\s*\\{`).test(nginxConf);
}

describe('the discovery itself is working', () => {
  // A green run over an empty list proves nothing. These two assertions are the positive
  // control for every assertion below.
  it('finds the public route prefixes', () => {
    const found = discoveredPrefixes();
    expect(found.length).toBeGreaterThanOrEqual(5);
    expect(found).toContain('/m/');
    expect(found).toContain('/bm/');
  });

  it('finds the regex locations that make `^~` necessary', () => {
    // If these ever disappear, the `^~` requirement below becomes vacuous and this suite
    // should be re-read rather than quietly kept passing.
    expect(nginxConf).toMatch(/location\s+~\*\s+\\\.\(mp4\|webm\|m4a\)\$/);
    expect(nginxConf).toMatch(/location\s+~\*\s+\\\.vtt\$/);
  });
});

describe('every public route prefix is classified', () => {
  it('leaves no prefix undecided — a new public file route must choose', () => {
    const undecided = discoveredPrefixes().filter(
      (p) => !(p in FILENAME_BEARING) && !(p in EXTENSIONLESS),
    );
    // If this fails, add the prefix to FILENAME_BEARING (and give it a `^~` nginx location)
    // or to EXTENSIONLESS, with a one-line reason. Do not delete the assertion.
    expect(undecided).toEqual([]);
  });

  it('classifies nothing that no longer exists', () => {
    const found = new Set(discoveredPrefixes());
    const stale = [...Object.keys(FILENAME_BEARING), ...Object.keys(EXTENSIONLESS)]
      .filter((p) => !found.has(p));
    expect(stale).toEqual([]);
  });
});

describe('filename-bearing prefixes carry `^~`', () => {
  for (const [prefix, why] of Object.entries(FILENAME_BEARING)) {
    it(`${prefix} has a \`^~\` location — ${why}`, () => {
      expect(hasGuardedLocation(prefix)).toBe(true);
    });

    it(`${prefix} proxies to the backend`, () => {
      const bare = prefix.replace(/\/$/, '');
      const block = new RegExp(
        `location\\s+\\^~\\s+${bare}/?\\s*\\{([^}]*)\\}`,
      ).exec(nginxConf);
      expect(block).not.toBeNull();
      expect(block![1]).toMatch(/proxy_pass\s+http:\/\/accelerator-backend:3001\s*;/);
    });

    it(`${prefix} streams instead of spooling — a seek must not wait on a temp file`, () => {
      const bare = prefix.replace(/\/$/, '');
      const block = new RegExp(`location\\s+\\^~\\s+${bare}/?\\s*\\{([^}]*)\\}`).exec(nginxConf);
      expect(block![1]).toMatch(/proxy_buffering\s+off\s*;/);
      expect(block![1]).toMatch(/proxy_max_temp_file_size\s+0\s*;/);
    });
  }
});

describe('extensionless prefixes still reach the backend', () => {
  for (const [prefix, why] of Object.entries(EXTENSIONLESS)) {
    it(`${prefix} has a location — ${why}`, () => {
      expect(hasAnyLocation(prefix)).toBe(true);
    });
  }
});
