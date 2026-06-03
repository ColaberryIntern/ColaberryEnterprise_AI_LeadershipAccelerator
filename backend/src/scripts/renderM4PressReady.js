#!/usr/bin/env node
// Render M4 V8 (locked finalist) as a press-ready PDF for David to send to
// RE Magazine's printer. Strips all surrounding mockup-doc chrome (header,
// nav, feedback widgets, M1/M2/M3/M5 mockups, ad-meta-strips, doc-footer)
// and renders just the M4 ad at the 1.54:1 half-page horizontal trim with
// a 0.125" bleed.
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.resolve(__dirname, '../../../node_modules/playwright'));

const REPO = path.resolve(__dirname, '../../..');
const HTML_IN = path.join(REPO, 'docs/coop-ad-mockups-2026-06-02.html');
const HTML_OUT = path.join(REPO, 'tmp/m4-pressready.html');
const PDF_OUT = path.join(REPO, 'docs/m4-pressready-2026-06-03.pdf');

(async () => {
  const src = fs.readFileSync(HTML_IN, 'utf8');

  // Extract <style> blocks
  const styleMatches = [...src.matchAll(/<style>([\s\S]*?)<\/style>/g)];
  const styles = styleMatches.map(m => m[1]).join('\n');

  // Extract the M4 mockup block (just the .ad-mockup.m4.* div)
  const m4Match = src.match(/<div class="ad-mockup m4 m4-v5 m4-v7 m4-v8">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/);
  if (!m4Match) throw new Error('Could not find M4 V8 block in source HTML');
  // Trim to just the .ad-mockup div (we matched 2 extra closing divs to be safe; back off)
  let m4Html = m4Match[0];
  // Find the matched closing div by counting opens/closes
  // Walk forward from index 0, counting div nesting until depth returns to 0
  function isolateDiv(s) {
    const openRe = /<div\b[^>]*>/gi;
    const closeRe = /<\/div>/gi;
    let depth = 0;
    let i = 0;
    while (i < s.length) {
      openRe.lastIndex = i;
      closeRe.lastIndex = i;
      const o = openRe.exec(s);
      const c = closeRe.exec(s);
      if (!o && !c) break;
      const nextO = o ? o.index : Infinity;
      const nextC = c ? c.index : Infinity;
      if (nextO < nextC) {
        depth++;
        i = openRe.lastIndex;
      } else {
        depth--;
        i = closeRe.lastIndex;
        if (depth === 0) return s.slice(0, i);
      }
    }
    return s;
  }
  m4Html = isolateDiv(m4Html);

  // Build standalone HTML at print dimensions. RE Magazine half-page
  // horizontal trim ≈ 7" x 4.55" (1.54:1). Add 0.125" bleed each side.
  const pageHtml = `<!doctype html><html><head><meta charset="utf-8"><base href="file:///${path.dirname(HTML_IN).replace(/\\/g, '/')}/">
<style>
  @page { size: 7.25in 4.8in; margin: 0; }
  body { margin: 0; padding: 0; font-family: 'Inter', Arial, sans-serif; background: white; }
  .press-wrapper { width: 7.25in; height: 4.8in; padding: 0.125in; box-sizing: border-box; background: white; }
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
  console.log('Standalone HTML:', HTML_OUT, '(' + (fs.statSync(HTML_OUT).size / 1024).toFixed(1) + ' KB)');

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto('file:///' + HTML_OUT.replace(/\\/g, '/'));
  await page.waitForLoadState('networkidle');
  await page.pdf({
    path: PDF_OUT,
    width: '7.25in',
    height: '4.8in',
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
  });
  console.log('PDF:', PDF_OUT, '(' + (fs.statSync(PDF_OUT).size / 1024).toFixed(1) + ' KB)');
  await browser.close();
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
