/**
 * Screenshot the REAL story renderer against a projection you hand it.
 *
 * WHY. The detail page's layout can only be judged with real content in it -
 * a fixture with two-word metric values hides exactly the defect this exists to
 * check (a methodology paragraph wrapping at forty characters inside a narrow
 * card). So the projection comes from production, and only the parts under
 * review are substituted.
 *
 * It intercepts the public API call in the browser rather than writing anything,
 * so nothing here can change a published record. Images are rewritten to the dev
 * server's own origin so a capture that is not deployed yet still renders.
 *
 * Usage:
 *   node scripts/previewStoryLayout.js --origin http://127.0.0.1:4321 \
 *     --slug <slug> --payload <file.json> --out <file.png> [--width 1440]
 */
const fs = require('fs');
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const argOf = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const ORIGIN = argOf('--origin', 'http://127.0.0.1:4321');
const SLUG = argOf('--slug', null);
const PAYLOAD = argOf('--payload', null);
const OUT = argOf('--out', null);
const WIDTH = Number(argOf('--width', 1440));
if (!SLUG || !PAYLOAD || !OUT) {
  console.error('need --slug <slug> --payload <file.json> --out <file.png>');
  process.exit(1);
}

const body = fs.readFileSync(PAYLOAD, 'utf8');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: 1400 },
    deviceScaleFactor: 2,
  });
  const problems = [];
  page.on('pageerror', (e) => problems.push('JS ' + String(e.message).slice(0, 140)));
  page.on('requestfailed', (r) => problems.push('REQ ' + r.url().slice(0, 100)));

  // The one interception. Everything else - CSS, fonts, images - loads for real.
  await page.route('**/api/public/case-studies/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body }),
  );

  await page.goto(`${ORIGIN}/stories/${SLUG}`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('[data-testid="story-article"]', { timeout: 30000 });
  await page.waitForTimeout(1200);

  /* `--clip <selector>` photographs one band at full resolution. A full-page
     capture of this page is ~12000px tall, which is the right artefact for
     "does it hold together" and useless for "is this card readable". */
  const CLIP = argOf('--clip', null);
  if (CLIP) {
    const el = await page.$(CLIP);
    if (!el) { console.error(`no element matches ${CLIP}`); process.exit(1); }
    await el.screenshot({ path: OUT });
  } else {
    await page.screenshot({ path: OUT, fullPage: argOf('--viewport', null) === null });
  }

  const shape = await page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const box = (s) => {
      const el = q(s);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    };
    return {
      cover: box('.cbv2-story__cover img'),
      facts: box('.cbv2-story__facts'),
      factRows: q('.cbv2-story__facts')
        ? new Set(
            [...q('.cbv2-story__facts').children].map((c) =>
              Math.round(c.getBoundingClientRect().top),
            ),
          ).size
        : null,
      metricHeights: [...document.querySelectorAll('.cbv2-story__metric')].map((el) =>
        Math.round(el.getBoundingClientRect().height),
      ),
      pageScrollW: document.documentElement.scrollWidth,
      viewportW: document.documentElement.clientWidth,
    };
  });
  console.log(JSON.stringify({ ...shape, problems: problems.slice(0, 6) }, null, 1));
  await browser.close();
})().catch((e) => { console.error('PREVIEW_FAILED', e && e.message); process.exit(1); });
