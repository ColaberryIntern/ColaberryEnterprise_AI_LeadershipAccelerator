/** Screenshot the plan at laptop width so it can be LOOKED at, not just built. */
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');

const FILE = path.join(__dirname, '..', 'docs', 'COLABERRY_PATH_TO_PROFITABILITY.html');

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1000, height: 1400 } });
  await p.goto(pathToFileURL(FILE).href, { waitUntil: 'networkidle' });

  const h = await p.evaluate(() => document.body.scrollHeight);
  // Slices rather than one very tall image, which would be unreadable.
  const stops = [0, 0.22, 0.44, 0.66, 0.84].map((f) => Math.round(h * f));
  for (const [i, y] of stops.entries()) {
    await p.evaluate((yy) => window.scrollTo(0, yy), y);
    await p.waitForTimeout(120);
    await p.screenshot({ path: path.join(__dirname, `turnaround-${i + 1}.png`) });
  }
  console.log(`page height ${h}px, ${stops.length} slices written`);
  await b.close();
})();
