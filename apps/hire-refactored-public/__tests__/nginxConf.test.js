/**
 * nginx/hire-refactored.conf and its wiring, read as text. The real `nginx -t` runs on the
 * built image; this pins the rules a reviewer would otherwise have to re-derive: the
 * hostname, the always-live fall-through shells, the retired legacy API, and the
 * add_header inheritance trap.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const conf = fs.readFileSync(path.join(ROOT, 'nginx', 'hire-refactored.conf'), 'utf8');
const code = conf.replace(/#.*$/gm, '');
const block = (pattern) => {
  const at = code.search(pattern);
  assert.ok(at >= 0, `no location matching ${pattern}`);
  // A location's own closing brace is the first `}` that starts a line: the JSON body
  // returned by the 410 blocks contains a `}` of its own.
  const end = code.slice(at).search(/\n\s*\}\s*\n/);
  return code.slice(at, at + end + 3);
};

describe('hire-refactored.conf', () => {
  test('answers hire.refactored.ai on plain 80 (the host nginx terminates TLS)', () => {
    assert.match(code, /listen 80;/);
    assert.match(code, /server_name hire\.refactored\.ai;/);
    assert.doesNotMatch(code, /listen 443|ssl_certificate/);
    assert.match(code, /root \/usr\/share\/nginx\/hire-refactored;/);
  });

  test('falls every unknown portfolio and case-study path through to its shell', () => {
    assert.match(block(/location \^~ \/talent\//), /try_files \$uri \/talent\/record\/index\.html;/);
    assert.match(block(/location \^~ \/case-studies\//), /try_files \$uri \/case-studies\/record\/index\.html;/);
  });

  test('never answers with nginx\'s own 403 or 404 page (production verification, 2026-11-09)', () => {
    // `$uri/` matched the bare /talent/ directory, found no index and returned a plain 403.
    assert.doesNotMatch(code, /try_files[^;]*\$uri\/[ ;][^;]*record/);
    assert.match(code, /error_page 404 \/404\.html;/);
    assert.match(block(/location = \/404\.html/), /internal;/);
    // Read from the raw file: `code` strips `#...` as a comment, anchors included. The
    // targets are quoted so nginx never reads the `#` as one either.
    assert.match(conf, /location = \/talent\/ \{\s*return 302 "\/#talent";/);
    assert.match(conf, /location = \/case-studies\/ \{\s*return 302 "\/#published";/);
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'src', '404.html')), 'the branded page ships with the app');
  });

  test('redirects are relative, so they never send a visitor to http:// (production verification, 2026-11-10)', () => {
    assert.match(code, /absolute_redirect off;/);
  });

  test('answers the legacy /ws-* API and /api/ with 410 JSON, never the HTML shell', () => {
    for (const loc of [/location ~ \^\/ws- \{/, /location \^~ \/api\/ \{/]) {
      const b = block(loc);
      assert.match(b, /default_type application\/json;/);
      assert.match(b, /return 410 '\{"error":"retired"\}';/);
    }
  });

  test('re-includes the security headers in every location that sets add_header', () => {
    assert.match(code, /server \{[\s\S]*?include \/etc\/nginx\/security-headers\.conf;/);
    for (const m of code.matchAll(/location[^{]*\{[\s\S]*?\n\s*\}\s*\n/g)) {
      if (/add_header|return 410/.test(m[0])) assert.match(m[0], /include \/etc\/nginx\/security-headers\.conf;/, m[0]);
    }
  });
});

describe('wiring', () => {
  test('the nginx image builds the app and ships the conf', () => {
    const df = fs.readFileSync(path.join(ROOT, 'nginx', 'Dockerfile'), 'utf8');
    assert.match(df, /COPY apps\/hire-refactored-public\/ \.\/apps\/hire-refactored-public\//);
    assert.match(df, /node apps\/hire-refactored-public\/build\.js/);
    // A real line continuation, never a literal "\n" (which sh would pass to the previous
    // app's build as a stray argument - shipped once, caught by the H7.1 verifier).
    assert.doesNotMatch(df, /build\.js \\n /);
    assert.match(df, /cpn-public\/build\.js \\\r?\n && node apps\/hire-refactored-public\/build\.js/);
    assert.match(df, /COPY --from=builder \/app\/apps\/hire-refactored-public\/dist \/usr\/share\/nginx\/hire-refactored/);
    assert.match(df, /COPY nginx\/hire-refactored\.conf\s+\/etc\/nginx\/conf\.d\/hire-refactored\.conf/);
  });

  test('the design-system sync rebuilds this app, and build:apps includes it', () => {
    const wf = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'design-system-sync.yml'), 'utf8');
    assert.match(wf, /for app in [^;]*\bhire-refactored-public\b/);
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    assert.match(pkg.scripts['build:apps'], /apps\/hire-refactored-public\/build\.js/);
  });
});
