/** Screenshot the C7.8 one-pager at the PDF's real usable size, so it can be looked at. */
const path = require('path');
const { chromium } = require('playwright');
const R = require(path.join(__dirname, '..', 'scripts', 'artifacts', 'tickets', 'c78c79Render'));
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 710, height: 940 } });
  await p.setContent(R.buildC78OnePager(), { waitUntil: 'networkidle' });
  await p.screenshot({ path: path.join(__dirname, 'c78-onepager.png'), fullPage: true });
  await b.close();
  console.log('ok');
})();
