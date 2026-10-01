#!/usr/bin/env node
/**
 * Screenshot the Presentation Studio's real emitted DOM at desktop and phone widths,
 * in light and dark.
 *
 * WHAT THESE IMAGES ARE, PRECISELY. The DOM is produced by the REAL components — it is
 * dumped by `frontend/src/pages/portal/projects/__tests__/PresentationStudio.domDump.test.tsx`
 * running under jsdom, which executes effects, so the fetched lesson / assignment /
 * prompt states are the genuine rendered output rather than loading skeletons. The
 * stylesheet below is the real `presentationStudio.css`, read from disk, not a copy.
 *
 * WHAT THEY ARE NOT: screenshots of the running application against a live backend.
 * That needs the app up with an authenticated student and PRESENTATION_STUDIO_ENABLED
 * on, which belongs to post-deploy verification. Calling these production screenshots
 * would be a lie. Calling them mockups would also be a lie — nothing here is drawn by
 * hand; every pixel comes from the components and the shipped CSS.
 *
 * Usage:
 *   1. cd frontend && PS_DOM_DUMP=1 CI=true node ../node_modules/react-scripts/bin/react-scripts.js \
 *        test --watchAll=false --testPathPattern "PresentationStudio.domDump"
 *   2. node scripts/capturePresentationStudio.js
 *
 * Output: docs/screenshots/2026-10-01-presentation-studio/<stage>-<width>-<theme>.png
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DOM_DIR = path.join(ROOT, '.loop-architect', 'runs', '20261001-presentation-studio', 'dom');
const CSS_FILE = path.join(ROOT, 'frontend', 'src', 'pages', 'portal', 'projects', 'presentation', 'presentationStudio.css');
const OUT_DIR = path.join(ROOT, 'docs', 'screenshots', '2026-10-01-presentation-studio');

// 1440 is the repo's desktop review width; 390 is the iPhone-class width the portal is
// checked at. Both well under captureHelpers' 1800px safe ceiling, so no downscale.
const WIDTHS = [
  { label: '1440', width: 1440, height: 1400 },
  { label: '390', width: 390, height: 1600 },
];
const THEMES = ['light', 'dark'];

function shell(bodyHtml, css, theme) {
  // data-theme on <html> mirrors how ProjectWorkspacePage stamps it
  // (document.documentElement.setAttribute('data-theme', theme)).
  return `<!DOCTYPE html>
<html lang="en" data-theme="${theme}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Presentation Studio — ${theme}</title>
<style>
  body {
    margin: 0;
    padding: 24px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: ${theme === 'dark' ? '#0f1214' : '#ffffff'};
  }
${css}
</style>
</head>
<body>${bodyHtml}</body>
</html>`;
}

(async () => {
  if (!fs.existsSync(DOM_DIR)) {
    console.error(`[capture] No DOM dump at ${DOM_DIR}. Run the domDump test with PS_DOM_DUMP=1 first.`);
    process.exit(1);
  }
  const css = fs.readFileSync(CSS_FILE, 'utf8');
  const stages = fs.readdirSync(DOM_DIR).filter((f) => f.endsWith('.html'));
  if (!stages.length) {
    console.error('[capture] DOM dump directory is empty.');
    process.exit(1);
  }

  const { chromium } = require(process.env.PW_PATH || 'playwright');
  const browser = await chromium.launch();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let written = 0;
  try {
    for (const file of stages) {
      const stage = path.basename(file, '.html');
      const body = fs.readFileSync(path.join(DOM_DIR, file), 'utf8');
      for (const theme of THEMES) {
        for (const w of WIDTHS) {
          const page = await browser.newPage({ viewport: { width: w.width, height: w.height } });
          await page.setContent(shell(body, css, theme), { waitUntil: 'load' });
          const out = path.join(OUT_DIR, `${stage}-${w.label}-${theme}.png`);
          await page.screenshot({ path: out, fullPage: true });
          await page.close();
          written += 1;
          console.log(`[capture] ${path.relative(ROOT, out)}`);
        }
      }
    }
  } finally {
    await browser.close();
  }

  // A count, printed, so a reader can tell a complete run from a truncated one.
  console.log(`[capture] OK — ${written} screenshots from ${stages.length} stages × ${THEMES.length} themes × ${WIDTHS.length} widths`);
})().catch((err) => {
  console.error('[capture] FAILED:', err && err.message ? err.message : err);
  process.exit(1);
});
