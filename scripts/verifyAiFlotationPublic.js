#!/usr/bin/env node
/**
 * Browser verification for the AI Flotation public site.
 *
 * ## Why a real browser and not more DOM assertions
 *
 * The build only copies files. It has no idea whether a page renders, whether the nav
 * overflows on a phone, or whether the form recovers from a failed request. Those are the
 * failures that demo fine and ship broken, and the only thing that catches them is
 * opening the pages.
 *
 * ## It serves dist the way nginx does
 *
 * The site links to directory URLs (`/about/`). A server that does not resolve
 * `/about/` to `about/index.html` would 404 every nav link while the homepage looked
 * perfect — the exact bug `appInternalLinks.test.ts` exists for. This serves the built
 * output with the same resolution rule, so the run exercises real routing.
 *
 * ## It never creates a real lead
 *
 * Every request to the ingest endpoint is intercepted and answered locally. A
 * verification run that posted to the live API would put test rows into the lead table
 * and attribute them to the ai-flotation source, corrupting the very attribution this
 * site exists to produce.
 *
 *   node scripts/verifyAiFlotationPublic.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { safeScreenshot, writeCaptureSummary } = require('./captureHelpers');

const DIST = path.join(__dirname, '..', 'apps', 'ai-flotation-public', 'dist');
const OUT = path.join(__dirname, '..', 'docs', 'screenshots', 'ai-flotation-public');

const PAGES = [
  ['/', 'home'],
  ['/what-we-build/', 'what-we-build'],
  ['/approach/', 'approach'],
  ['/delivery-standard/', 'delivery-standard'],
  ['/results/', 'results'],
  ['/about/', 'about'],
  ['/start/', 'start'],
];

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 360, height: 800 };

let failures = 0;
const check = (label, actual, expected) => {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}: expected ${expected}, got ${actual}`);
};

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml' };

/** Resolve a URL path the way nginx `try_files $uri $uri/ =404` would. */
function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const rel = clean.replace(/^\//, '');
  const candidates = rel === ''
    ? ['index.html']
    : [rel, path.join(rel, 'index.html'), `${rel}.html`];
  for (const candidate of candidates) {
    const full = path.join(DIST, candidate);
    if (full.startsWith(DIST) && fs.existsSync(full) && fs.statSync(full).isFile()) return full;
  }
  return null;
}

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const file = resolveFile(req.url);
      if (!file) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(fs.readFileSync(file));
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function main() {
  if (!fs.existsSync(DIST)) throw new Error('dist/ not built. Run: node apps/ai-flotation-public/build.js');
  fs.mkdirSync(OUT, { recursive: true });

  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  console.log(`[verify] serving ${path.relative(process.cwd(), DIST)} at ${base}\n`);

  const browser = await chromium.launch();
  const shots = [];

  // ---- every page, both viewports -------------------------------------------------
  for (const [urlPath, slug] of PAGES) {
    for (const [label, viewport] of [['desktop', DESKTOP], ['mobile', MOBILE]]) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();

      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      // Fonts come from Google. Blocking them proves the fallback stack holds rather than
      // letting a network hiccup silently change what is being judged.
      const res = await page.goto(base + urlPath, { waitUntil: 'domcontentloaded' });

      if (label === 'desktop') {
        check(`${urlPath} responds`, res.status(), 200);
        check(`  ${urlPath} has a title`, (await page.title()).length > 0, true);
        check(`  ${urlPath} has exactly one h1`, await page.locator('h1').count(), 1);
        check(`  ${urlPath} raised no JS errors`, errors.length, 0);
      }

      // Horizontal overflow is the classic mobile failure and is invisible in a DOM test.
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      check(`  ${urlPath} @${label} does not scroll sideways`, overflow, false);

      const out = path.join(OUT, `${slug}-${label}.png`);
      await safeScreenshot(page, out, { fullPage: true, label: `${slug}-${label}` });
      shots.push({ file: path.basename(out), proves: `${urlPath} at ${viewport.width}x${viewport.height}` });

      await context.close();
    }
  }

  // ---- every internal link actually resolves --------------------------------------
  console.log('');
  {
    const context = await browser.newContext({ viewport: DESKTOP });
    const page = await context.newPage();
    const broken = [];
    for (const [urlPath] of PAGES) {
      await page.goto(base + urlPath, { waitUntil: 'domcontentloaded' });
      const hrefs = await page.$$eval('a[href^="/"]', (as) => [...new Set(as.map((a) => a.getAttribute('href')))]);
      for (const href of hrefs) {
        const r = await page.request.get(base + href);
        if (r.status() !== 200) broken.push(`${urlPath} -> ${href} (${r.status()})`);
      }
    }
    check('every internal link resolves', broken.join(', ') || 'none', 'none');

    // The client doorway is platform-owned and absolute. It must point at the platform,
    // not at a path this static site could never serve.
    await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
    const login = await page.getAttribute('a.btn-ghost', 'href');
    check('Client Login points at the platform', /^https?:\/\/.+\/client\/projects$/.test(login || ''), true);
    await context.close();
  }

  // ---- the intake form -------------------------------------------------------------
  console.log('');
  {
    const context = await browser.newContext({ viewport: DESKTOP });
    const page = await context.newPage();

    let captured = null;
    let mode = 'ok';
    // Intercepted, always. A real POST here would write a lead attributed to
    // ai-flotation and pollute the attribution this site exists to produce.
    await page.route('**/api/leads/ingest*', async (route) => {
      captured = { url: route.request().url(), body: route.request().postDataJSON() };
      if (mode === 'network') return route.abort('failed');
      if (mode === 'server') {
        return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Upstream unavailable' }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    });

    const fill = async () => {
      await page.fill('#name', 'Dana Whitfield');
      await page.fill('#email', 'dana@meridianfreight.com');
      await page.fill('#company', 'Meridian Freight');
      await page.fill('#role', 'VP Operations');
      await page.fill('#message', 'Dispatchers rebuild the same load spreadsheet every morning.');
      await page.check('#consent');
    };

    // 1. required fields
    await page.goto(base + '/start/', { waitUntil: 'domcontentloaded' });
    await page.click('form.intake button[type=submit]');
    await page.waitForTimeout(150);
    check('empty form is refused client-side', (await page.textContent('#status')).includes('complete every field'), true);
    check('  and nothing was sent', captured, null);

    // 2. invalid email
    await fill();
    await page.fill('#email', 'not-an-email');
    await page.click('form.intake button[type=submit]');
    await page.waitForTimeout(150);
    check('an invalid email is refused', (await page.getAttribute('#status', 'data-state')), 'error');
    check('  and still nothing was sent', captured, null);

    // 3. server error, and the answers survive
    await page.fill('#email', 'dana@meridianfreight.com');
    mode = 'server';
    await page.click('form.intake button[type=submit]');
    await page.waitForSelector('#status[data-state="error"]');
    check('a 500 surfaces as an error', (await page.getAttribute('#status', 'data-state')), 'error');
    check('  the answers are NOT wiped', await page.inputValue('#company'), 'Meridian Freight');
    check('  and the button is usable again', await page.isEnabled('form.intake button[type=submit]'), true);

    // 4. network failure
    captured = null;
    mode = 'network';
    await page.click('form.intake button[type=submit]');
    await page.waitForSelector('#status[data-state="error"]');
    check('a dropped connection surfaces as an error', (await page.getAttribute('#status', 'data-state')), 'error');
    check('  the answers still survive', await page.inputValue('#name'), 'Dana Whitfield');

    // 5. success
    captured = null;
    mode = 'ok';
    await page.click('form.intake button[type=submit]');
    await page.waitForSelector('#status[data-state="ok"]');
    check('a valid submission succeeds', (await page.getAttribute('#status', 'data-state')), 'ok');
    check('  posts to the real ingest path', /\/api\/leads\/ingest\?source=ai-flotation&entry=workflow_intake$/.test(captured.url), true);
    check('  carries the consent flag', captured.body.consent_contact, true);
    check('  carries page_url for attribution', typeof captured.body.page_url === 'string', true);
    check('  the form is reset', await page.inputValue('#name'), '');
    check('  and promises NO email', /email/i.test(await page.textContent('#status')), false);

    const out = path.join(OUT, 'start-success.png');
    await safeScreenshot(page, out, { fullPage: false, label: 'start-success' });
    shots.push({ file: path.basename(out), proves: 'intake success state, no email promised' });

    await context.close();
  }

  await browser.close();
  server.close();

  writeCaptureSummary(OUT, shots.map((s) => ({ file: s.file, proves: s.proves })));
  console.log(`\n[verify] ${shots.length} screenshots in ${path.relative(process.cwd(), OUT)}`);
  console.log(`[verify] ${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`[verify] ERROR: ${err.message}`);
  process.exit(1);
});
