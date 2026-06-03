#!/usr/bin/env node
// Render M4 V9 to a press-ready PDF at parameterized dimensions. Used to
// roll multiple half-page horizontal trim variants for David to pick from.
//
// Usage: node renderM4PressReadyDim.js <trim-w-in> <trim-h-in> <bleed-in> <out-pdf-path>
// Example: node renderM4PressReadyDim.js 7 4.5 0.125 docs/m4-v9-7x4.5.pdf
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.resolve(__dirname, '../../../node_modules/playwright'));

const [trimW, trimH, bleed, outPath] = process.argv.slice(2);
if (!trimW || !trimH || !bleed || !outPath) {
  console.error('Usage: node renderM4PressReadyDim.js <trim-w-in> <trim-h-in> <bleed-in> <out-pdf-path>');
  process.exit(1);
}
const TRIM_W = parseFloat(trimW);
const TRIM_H = parseFloat(trimH);
const BLEED  = parseFloat(bleed);
const PAGE_W = TRIM_W + 2 * BLEED;
const PAGE_H = TRIM_H + 2 * BLEED;

const REPO = path.resolve(__dirname, '../../..');
const HTML_IN = path.join(REPO, 'docs/coop-ad-mockups-2026-06-02.html');
const HTML_OUT = path.join(REPO, `tmp/m4-pressready-${TRIM_W}x${TRIM_H}.html`);
const PDF_OUT = path.resolve(REPO, outPath);

(async () => {
  const src = fs.readFileSync(HTML_IN, 'utf8');
  const styleMatches = [...src.matchAll(/<style>([\s\S]*?)<\/style>/g)];
  const styles = styleMatches.map(m => m[1]).join('\n');
  const m4Match = src.match(/<div class="ad-mockup m4 m4-v5 m4-v7 m4-v8">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/);
  if (!m4Match) throw new Error('M4 V8 block not found');
  function isolateDiv(s) {
    const openRe = /<div\b[^>]*>/gi;
    const closeRe = /<\/div>/gi;
    let depth = 0, i = 0;
    while (i < s.length) {
      openRe.lastIndex = i; closeRe.lastIndex = i;
      const o = openRe.exec(s); const c = closeRe.exec(s);
      if (!o && !c) break;
      const nextO = o ? o.index : Infinity;
      const nextC = c ? c.index : Infinity;
      if (nextO < nextC) { depth++; i = openRe.lastIndex; }
      else { depth--; i = closeRe.lastIndex; if (depth === 0) return s.slice(0, i); }
    }
    return s;
  }
  const m4Html = isolateDiv(m4Match[0]);

  const pageHtml = `<!doctype html><html><head><meta charset="utf-8"><base href="file:///${path.dirname(HTML_IN).replace(/\\/g, '/')}/">
<style>
  @page { size: ${PAGE_W}in ${PAGE_H}in; margin: 0; }
  body { margin: 0; padding: 0; font-family: 'Inter', Arial, sans-serif; background: white; }
  .press-wrapper { width: ${PAGE_W}in; height: ${PAGE_H}in; padding: ${BLEED}in; box-sizing: border-box; background: white; }
  .ad-mockup { box-shadow: none !important; border: 1px solid #ddd !important; }
${styles}
</style>
</head><body>
<div class="press-wrapper">
${m4Html}
</div>
</body></html>`;

  fs.mkdirSync(path.dirname(HTML_OUT), { recursive: true });
  fs.writeFileSync(HTML_OUT, pageHtml);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto('file:///' + HTML_OUT.replace(/\\/g, '/'));
  await page.waitForLoadState('networkidle');
  await page.pdf({
    path: PDF_OUT,
    width: `${PAGE_W}in`,
    height: `${PAGE_H}in`,
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
  });
  console.log(`  ${TRIM_W}"x${TRIM_H}" trim (${PAGE_W}"x${PAGE_H}" bleed): ${PDF_OUT} (${(fs.statSync(PDF_OUT).size / 1024).toFixed(1)} KB)`);
  await browser.close();
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
