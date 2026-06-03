#!/usr/bin/env node
// Measure the M4 ad's actual rendered height at the press-ready content
// width (7" minus bleed). Outputs height in inches so we can compute the
// fit-scale needed to make it fit a half-page horizontal trim.
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.resolve(__dirname, '../../../node_modules/playwright'));

const REPO = path.resolve(__dirname, '../../..');
const HTML_IN = path.join(REPO, 'docs/coop-ad-mockups-2026-06-02.html');

(async () => {
  const src = fs.readFileSync(HTML_IN, 'utf8');
  const styleMatches = [...src.matchAll(/<style>([\s\S]*?)<\/style>/g)];
  const styles = styleMatches.map(m => m[1]).join('\n');
  const m4Match = src.match(/<div class="ad-mockup m4 m4-v5 m4-v7 m4-v8">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/);
  function isolateDiv(s) {
    const openRe = /<div\b[^>]*>/gi, closeRe = /<\/div>/gi;
    let depth = 0, i = 0;
    while (i < s.length) {
      openRe.lastIndex = i; closeRe.lastIndex = i;
      const o = openRe.exec(s); const c = closeRe.exec(s);
      if (!o && !c) break;
      const nextO = o ? o.index : Infinity, nextC = c ? c.index : Infinity;
      if (nextO < nextC) { depth++; i = openRe.lastIndex; }
      else { depth--; i = closeRe.lastIndex; if (depth === 0) return s.slice(0, i); }
    }
    return s;
  }
  const m4Html = isolateDiv(m4Match[0]);

  // Measure at 7" wide (the standard half-page horizontal trim width)
  // 1 inch = 96 CSS pixels (CSS unit standard)
  const CONTENT_W_PX = 7 * 96; // 672px

  const measureHtml = `<!doctype html><html><head><meta charset="utf-8"><base href="file:///${path.dirname(HTML_IN).replace(/\\/g, '/')}/">
<style>
  body { margin: 0; padding: 0; font-family: 'Inter', Arial, sans-serif; background: white; }
  .press-wrapper { width: ${CONTENT_W_PX}px; }
${styles}
  /* Mirror the press-fit overrides from renderM4PressReadyDim.js so the measurement matches what the PDF renders */
  .press-wrapper .ad-mockup { aspect-ratio: auto !important; overflow: visible !important; height: auto !important; }
  .press-wrapper .m4-bar-v5 { padding: 11px 24px !important; font-size: 16px !important; }
  .press-wrapper .m4-v8 .m4-hero-strip-v8 { padding: 9px 24px 11px !important; }
  .press-wrapper .m4-v8 .m4-headline-block-v8 { padding: 10px 28px 8px !important; }
  .press-wrapper .m4-v8 .m4-headline-block-v8 .m4-headline { font-size: 19px !important; margin: 0 0 4px !important; line-height: 1.18 !important; }
  .press-wrapper .m4-v8 .m4-headline-block-v8 .m4-subhead { font-size: 9.5px !important; line-height: 1.3 !important; }
  .press-wrapper .m4-v5 .m4-tile { padding: 9px 8px 6px !important; }
  .press-wrapper .m4-v7 .m4-tile { padding: 9px 8px 6px !important; }
  .press-wrapper .m4-v7 .m4-tile .name { min-height: 28px !important; }
  .press-wrapper .m4-v7 .m4-tile .desc { min-height: 38px !important; }
  .press-wrapper .m4-v5 .m4-roi-strip-v5 { padding: 8px 22px !important; }
  .press-wrapper .m4-v5 .m4-footer-v5 { padding: 9px 22px !important; }
</style></head><body>
<div class="press-wrapper">${m4Html}</div>
</body></html>`;

  const tmpPath = path.join(REPO, 'tmp/m4-measure.html');
  fs.writeFileSync(tmpPath, measureHtml);

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('file:///' + tmpPath.replace(/\\/g, '/'));
  await page.waitForLoadState('networkidle');
  const box = await page.locator('.ad-mockup.m4').boundingBox();
  await browser.close();

  console.log('M4 rendered at 7" wide:');
  console.log('  width:  ' + box.width.toFixed(1) + 'px = ' + (box.width / 96).toFixed(3) + '"');
  console.log('  height: ' + box.height.toFixed(1) + 'px = ' + (box.height / 96).toFixed(3) + '"');
  const heightIn = box.height / 96;
  console.log('\nFit-scale needed for each half-page horizontal trim:');
  for (const [name, h] of [['7"x4.5" (canonical)', 4.5], ['7"x4.625" (alt)', 4.625], ['7"x4.55" (current)', 4.55]]) {
    const scale = (h / heightIn).toFixed(4);
    console.log('  ' + name + ': ' + scale + ' (content height ' + heightIn.toFixed(3) + '" -> page ' + h + '")');
  }
})().catch(e => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
