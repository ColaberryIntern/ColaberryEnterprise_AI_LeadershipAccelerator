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
const fs = require('fs');
const path = require('path');
const { validateBrandConfig } = require('../brand-system');

const TRACKER_SOURCE = path.join(__dirname, '..', 'tracking-sdk', 'track-v2.js');

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

  console.log(`[${config.appSlug}] built to ${path.relative(process.cwd(), distDir)}`);
  return distDir;
}

module.exports = { buildApp };
