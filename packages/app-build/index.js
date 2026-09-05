/**
 * Minimal static build for the skeleton public applications.
 *
 * WHY NOT VITE / WEBPACK / CRA: the skeleton apps exist to prove ecosystem plumbing —
 * domain resolution, tracking, lead ingest, tenant context — not to be marketing sites.
 * A bundler would add a dependency tree to each app, and this repository's rules are
 * explicit that new dependencies are a deliberate add, never a drive-by install. When
 * these apps become real sites they can adopt whatever toolchain they want; that choice
 * belongs to the product project, and leaving it open is part of being extraction-ready.
 *
 * What it does: copies `src/` to `dist/`, inlines the v2 tracker, and substitutes
 * `{{brand.*}}` tokens from the app's validated brand config.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { validateBrandConfig } = require('../brand-system');

/** Anything with a scheme, a fragment, or a protocol-relative host is not ours to touch. */
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

/** href="…", src="…", and CSS url(…) — the three ways this codebase references an asset. */
const REFERENCE = /(href=["']|src=["']|url\(["']?)([^"')?#]+)(\?v=[0-9a-f]+)?/gi;

const TRACKER_SOURCE = path.join(__dirname, '..', 'tracking-sdk', 'track-v2.js');
/*
 * The case-study shell: ONE renderer for the published-records index and the
 * record page, shipped to every brand app that wants them.
 *
 * A package rather than a file per app because this repeats - AI Flotation has
 * it now and training.colaberry.com is next, and three hand-written copies of
 * the same screens drift apart within a month. Structure lives here; every
 * colour comes from CSS custom properties the host app maps to its own palette,
 * so each page looks like its brand without the logic being rewritten.
 */
const SHELL_JS = path.join(__dirname, '..', 'case-study-shell', 'case-studies.js');
const SHELL_RECORD = path.join(__dirname, '..', 'case-study-shell', 'case-study-record.js');
const SHELL_CSS = path.join(__dirname, '..', 'case-study-shell', 'case-studies.css');

function copyTree(from, to, transform) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copyTree(source, target, transform);
    } else if (path.extname(entry.name) === '.html') {
      fs.writeFileSync(target, transform(fs.readFileSync(source, 'utf8')), 'utf8');
    } else {
      fs.copyFileSync(source, target);
    }
  }
}

/** Every file under `dir`, as dist-relative POSIX paths. */
function walk(dir, base = dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, base, out);
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

/**
 * Stamp every asset reference with a content hash: `/assets/site.css?v=1a2b3c4d`.
 *
 * WHY THIS EXISTS
 *
 * On 2026-09-02 an accessibility fix was deployed to production and stayed invisible.
 * The container served the corrected CSS, but Cloudflare held the old copy at the edge
 * (`cf-cache-status: HIT`, `max-age=14400`) and kept serving it to real visitors for
 * hours. A deploy that cannot be seen is not a deploy, and "purge the cache by hand
 * afterwards" is a step someone will forget on the deploy that matters most.
 *
 * The page HTML is never edge-cached (`cf-cache-status: DYNAMIC`), so fresh HTML pointing
 * at a URL that has never existed before is guaranteed to miss the cache. Content
 * addressing gets that for free: change the file, change the URL.
 *
 * Rewriting runs to a fixed point because assets reference each other - site.css imports
 * design/colors.css, so colors.css must be stamped before site.css's own hash is final.
 * Existing `?v=` stamps are matched and replaced rather than appended to, which is what
 * makes re-running safe.
 */
function fingerprintAssets(distDir) {
  const assets = walk(distDir).filter((f) => !f.endsWith('.html'));
  const rewritable = walk(distDir).filter((f) => /\.(html|css)$/i.test(f));

  for (let pass = 0; pass < 5; pass += 1) {
    const hashes = new Map();
    for (const asset of assets) {
      const digest = crypto.createHash('sha256').update(fs.readFileSync(path.join(distDir, asset))).digest('hex');
      hashes.set(asset, digest.slice(0, 8));
    }

    let changed = false;
    for (const file of rewritable) {
      const full = path.join(distDir, file);
      const before = fs.readFileSync(full, 'utf8');
      const after = before.replace(REFERENCE, (match, prefix, url) => {
        if (EXTERNAL.test(url)) return match;
        // Absolute URLs are dist-relative; everything else resolves against this file.
        const resolved = url.startsWith('/')
          ? url.slice(1)
          : path.posix.normalize(path.posix.join(path.posix.dirname(file), url));
        const hash = hashes.get(resolved);
        if (!hash) return match; // a page link, or something that is not a built asset
        return `${prefix}${url}?v=${hash}`;
      });
      if (after !== before) { fs.writeFileSync(full, after, 'utf8'); changed = true; }
    }
    if (!changed) return;
  }
  throw new Error('asset fingerprinting did not converge after 5 passes');
}

/**
 * @param {{appDir: string, config: object}} options
 */
function buildApp(options) {
  const config = validateBrandConfig(options.config);
  const srcDir = path.join(options.appDir, 'src');
  const distDir = path.join(options.appDir, 'dist');

  if (!fs.existsSync(srcDir)) throw new Error(`no src/ directory in ${options.appDir}`);
  fs.rmSync(distDir, { recursive: true, force: true });

  const substitutions = {
    '{{brand.appSlug}}': config.appSlug,
    '{{brand.sourceSlug}}': config.sourceSlug,
    '{{brand.brandSlug}}': config.brandSlug,
    '{{brand.publicUrl}}': config.publicUrl,
    '{{brand.platformApiBase}}': config.platformApiBase,
    '{{brand.supportEmail}}': config.supportEmail || '',
  };

  copyTree(srcDir, distDir, (html) => {
    let out = html;
    for (const [token, value] of Object.entries(substitutions)) {
      out = out.split(token).join(value);
    }
    return out;
  });

  // The tracker ships with the app rather than being fetched from the platform origin,
  // so an extracted app keeps working when it no longer shares a host with the platform.
  fs.mkdirSync(path.join(distDir, 'assets'), { recursive: true });
  fs.copyFileSync(TRACKER_SOURCE, path.join(distDir, 'assets', 'track-v2.js'));

  // Same reasoning as the tracker: it ships WITH the app, so an app that stops
  // sharing a host with the platform keeps working.
  for (const [source, name] of [[SHELL_JS, 'case-studies.js'], [SHELL_RECORD, 'case-study-record.js'], [SHELL_CSS, 'case-studies.css']]) {
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(distDir, 'assets', name));
  }

  // Last, so the tracker and every copied asset are on disk and hashable.
  fingerprintAssets(distDir);

  console.log(`[${config.appSlug}] built to ${path.relative(process.cwd(), distDir)}`);
  return distDir;
}

// fingerprintAssets is exported for its test: the dependency chain it has to get right
// (html -> css -> imported css) is not observable from buildApp's return value.
module.exports = { buildApp, fingerprintAssets };
