/**
 * Render the Repo2Reputation case study on every surface that publishes it and report the
 * measurements that catch layout defects an API response cannot.
 *
 * Usage: node scripts/captureRepo2ReputationStory.js --out <dir>
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const SLUG = 'your-repositories-already-wrote-your-resume';
const OUT = (() => {
  const i = process.argv.indexOf('--out');
  return i > -1 ? process.argv[i + 1] : path.join(__dirname, '..', 'docs', 'screenshots', 'repo2reputation');
})();

const STOPS = [
  { name: 'enterprise-detail', url: `https://enterprise.colaberry.ai/stories/${SLUG}`, waitFor: 'h1' },
  { name: 'enterprise-index', url: 'https://enterprise.colaberry.ai/stories', waitFor: 'body' },
  { name: 'aiflotation-results', url: 'https://aiflotation.com/results/', waitFor: 'body' },
  { name: 'training-student-projects', url: 'https://training.colaberry.com/student-projects', waitFor: 'body' },
];

const WIDTHS = [1440, 390];

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const report = [];

  for (const stop of STOPS) {
    for (const width of WIDTHS) {
      const ctx = await browser.newContext({ viewport: { width, height: 1000 }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      const problems = [];
      page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
      page.on('requestfailed', (r) => problems.push('requestfailed: ' + r.url().slice(0, 120)));
      page.on('response', (r) => { if (r.status() >= 400) problems.push(`http ${r.status()}: ${r.url().slice(0, 120)}`); });

      let loaded = true;
      try {
        await page.goto(stop.url, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForSelector(stop.waitFor, { timeout: 20000 });
      } catch (e) { loaded = false; problems.push('navigation: ' + e.message.split('\n')[0]); }

      // The shells fetch client-side; give the render a beat after network idle.
      await page.waitForTimeout(2500);

      const m = await page.evaluate((slug) => {
        const txt = document.body.innerText || '';
        return {
          viewportW: window.innerWidth,
          pageScrollW: document.documentElement.scrollWidth,
          title: (document.querySelector('h1') || {}).innerText || null,
          mentionsRecord: txt.toLowerCase().includes('repositories already wrote'),
          hasSlugLink: !!document.querySelector(`a[href*="${slug}"]`),
          coverImg: (() => {
            const i = Array.from(document.images).find((x) => /shot-repo2reputation/.test(x.src));
            return i ? { src: i.src, w: i.naturalWidth, h: i.naturalHeight } : null;
          })(),
          brokenImages: Array.from(document.images).filter((i) => i.complete && i.naturalWidth === 0)
            .map((i) => i.src.slice(0, 110)),
        };
      }, SLUG);

      const file = path.join(OUT, `${stop.name}-${width}.png`);
      await page.screenshot({ path: file, fullPage: width === 1440 });
      report.push({ stop: stop.name, width, loaded, ...m, problems: problems.slice(0, 6), file });
      await ctx.close();
    }
  }

  await browser.close();
  console.log(JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
}

main().catch((e) => { console.error('CAPTURE_FAILED', e.message); process.exit(1); });
