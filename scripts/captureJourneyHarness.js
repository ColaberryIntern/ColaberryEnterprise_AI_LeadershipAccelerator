/**
 * Screenshot the Outreach Journey Flow from its OWN rendered output.
 *
 * WHAT THIS IS AND IS NOT. It is a real capture of the real component: the DOM was
 * produced by mounting OutreachJourneyFlow and letting recharts run its actual
 * Sankey layout (see renderHarness.dump.test.tsx), then dressed in the app's real
 * stylesheets here.
 *
 * It is NOT a production screenshot. The payload is a fixture shaped after
 * production's funnel, and no admin session was involved. Anything claiming to
 * prove production BEHAVIOUR has to come from an authenticated capture against the
 * live app; what this proves is that the component lays out correctly at a given
 * width and theme, which is a real and separate question that unit assertions
 * cannot answer.
 *
 * ONE DUMP IN, ONE IMAGE OUT. Theme is baked into the SVG at render time, so a
 * dark image must come from a dark-rendered dump — restyling a light dump with
 * dark CSS would recolour the chrome and leave every band light.
 *
 * Usage:
 *   node scripts/captureJourneyHarness.js <body.html> <out.png> <theme> <viewportWidth>
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const [, , bodyPath, outPath, themeArg, widthArg] = process.argv;
if (!bodyPath || !outPath) {
  console.error(
    'usage: node scripts/captureJourneyHarness.js <body.html> <out.png> [theme] [viewportWidth]',
  );
  process.exit(1);
}

const theme = themeArg === 'dark' ? 'dark' : 'light';
const viewportWidth = Number(widthArg) || 1440;

const FRONTEND = path.join(__dirname, '..', 'frontend');
const cssFiles = [
  path.join(FRONTEND, 'node_modules', 'bootstrap', 'dist', 'css', 'bootstrap.min.css'),
  path.join(FRONTEND, 'src', 'styles', 'tokens.css'),
  path.join(FRONTEND, 'src', 'styles', 'global.css'),
  path.join(FRONTEND, 'src', 'styles', 'admin-shell.css'),
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
const body = fs.readFileSync(bodyPath, 'utf8');

(async () => {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: viewportWidth, height: 1000 },
    deviceScaleFactor: 1,
  });

  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });

  const html = `<!doctype html><html lang="en" data-theme="${theme}"><head><meta charset="utf-8">
<style>${css}</style>
<style>
  body { margin: 0; padding: 24px; background: var(--color-bg, ${theme === 'dark' ? '#16181d' : '#f7f7f6'}); }
</style>
</head><body>${body}</body></html>`;

  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForTimeout(300);
  await page.screenshot({ path: outPath, fullPage: true });

  const ribbons = await page.locator('path.journey-ribbon').count();
  const labels = await page.locator('svg text').count();
  await browser.close();

  console.log(
    `[capture] ${path.basename(outPath)} — theme=${theme} viewport=${viewportWidth} ` +
      `ribbons=${ribbons} svgLabels=${labels} pageErrors=${errors.length}`,
  );
  if (errors.length) {
    console.log('[capture] errors:');
    for (const e of errors) console.log(`  - ${e}`);
  }
})().catch((err) => {
  console.error('[capture] failed:', err);
  process.exit(1);
});
