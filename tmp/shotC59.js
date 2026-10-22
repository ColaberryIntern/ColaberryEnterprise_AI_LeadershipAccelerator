/** Screenshot the C5.9 one-pager at the PDF's real usable size, so it can be looked at. */
const path = require('path');
const { chromium } = require('playwright');
const R = require(path.join(__dirname, '..', 'scripts', 'artifacts', 'tickets', 'c59Render'));

// Letter landscape at a 10mm margin leaves roughly 980 x 740 CSS pixels.
const W = 980;
const H = 740;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: W, height: H } });
  await p.setContent(R.buildVisual(), { waitUntil: 'networkidle' });

  const h = await p.evaluate(() => {
    const kids = [...document.body.children];
    return kids.length ? Math.ceil(Math.max(...kids.map((n) => n.getBoundingClientRect().bottom))) : 0;
  });
  await p.screenshot({ path: path.join(__dirname, 'c59-visual.png'), fullPage: true });
  await b.close();

  console.log(`content ${h}px against ${H}px usable`);
  console.log(h > H ? '  OVERFLOWS' : `  fits, ${H - h}px spare`);
})();
