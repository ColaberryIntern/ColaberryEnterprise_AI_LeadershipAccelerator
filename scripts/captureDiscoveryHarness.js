/**
 * Screenshot the Phase 5 discovery surfaces from their OWN rendered output.
 *
 * WHAT THIS IS AND IS NOT. It is a real capture of the real components: the DOM
 * was produced by mounting ProjectWizard and the project banners
 * (discoveryHarness.dump.test.tsx), then dressed in the app's real stylesheets
 * here. It is NOT a production screenshot: the preview payload is a fixture and
 * no student session was involved. What it proves is that the surfaces lay out
 * at 1440 and 390, which is a real and separate question the unit suites cannot
 * answer. Production behaviour needs an authenticated capture against the live
 * app after deploy (scripts/captureProductionScreenshots.js).
 *
 * Usage:
 *   node scripts/captureDiscoveryHarness.js <dump-dir> <out-dir>
 *
 * Writes <out-dir>/<name>-<width>.png for every *.html in <dump-dir>, at 1440
 * and 390, and prints one line per capture with the page-error count.
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const [, , dumpDir, outDir] = process.argv;
if (!dumpDir || !outDir) {
  console.error('usage: node scripts/captureDiscoveryHarness.js <dump-dir> <out-dir>');
  process.exit(1);
}

const FRONTEND = path.join(__dirname, '..', 'frontend');
const cssFiles = [
  // Bootstrap is hoisted to the root workspace on this repo.
  path.join(__dirname, '..', 'node_modules', 'bootstrap', 'dist', 'css', 'bootstrap.min.css'),
  path.join(FRONTEND, 'src', 'styles', 'tokens.css'),
  path.join(FRONTEND, 'src', 'styles', 'global.css'),
  path.join(FRONTEND, 'src', 'styles', 'responsive.css'),
  path.join(FRONTEND, 'src', 'pages', 'portal', 'today', 'TodayShell.css'),
  path.join(FRONTEND, 'src', 'pages', 'portal', 'projects', 'projects.css'),
];

function readIfPresent(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    console.warn(`[capture] missing stylesheet, continuing without it: ${p}`);
    return '';
  }
}

const css = cssFiles.map(readIfPresent).join('\n');
const WIDTHS = [1440, 390];

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const dumps = fs.readdirSync(dumpDir).filter((f) => f.endsWith('.html')).sort();
  if (dumps.length === 0) {
    console.error(`[capture] no .html dumps in ${dumpDir}`);
    process.exit(1);
  }

  for (const file of dumps) {
    const body = fs.readFileSync(path.join(dumpDir, file), 'utf8');
    for (const width of WIDTHS) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

      // The portal's page gutter: 24px on desktop, 16px on a phone, matching
      // what the shell gives the pj-root column.
      const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${css}</style>
<style>
  body { margin: 0; padding: ${width < 600 ? 16 : 24}px; background: var(--surface-page, #f7f7f6); }
  .pj-root { max-width: 860px; }
</style>
</head><body>${body}</body></html>`;

      await page.setContent(html, { waitUntil: 'load' });
      await page.waitForTimeout(200);
      const out = path.join(outDir, `${path.basename(file, '.html')}-${width}.png`);
      await page.screenshot({ path: out, fullPage: true });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      await page.close();
      console.log(`[capture] ${path.basename(out)} width=${width} horizontalOverflow=${overflow} pageErrors=${errors.length}`);
      for (const e of errors) console.log(`  - ${e}`);
    }
  }
  await browser.close();
})().catch((err) => {
  console.error('[capture] failed:', err);
  process.exit(1);
});
