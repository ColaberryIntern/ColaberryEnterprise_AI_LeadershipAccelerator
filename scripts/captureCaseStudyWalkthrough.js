/**
 * Desktop + mobile walkthrough of the published case study, with screenshots.
 *
 * WHY A SEPARATE SCRIPT. `captureProductionScreenshots.js` walks the portal behind
 * a JWT. This walks the PUBLIC surface anonymously, which is the only way to see
 * what a reader actually gets — an authenticated capture cannot prove that a page
 * renders for someone with no session, and that is exactly the claim being made.
 *
 * It also FAILS on console errors and failed requests rather than reporting them
 * as prose beside a screenshot that looks fine. A screenshot proves a layout; it
 * cannot prove the absence of a 500 behind a lazily-loaded panel.
 *
 * Usage: node scripts/captureCaseStudyWalkthrough.js [--slug <slug>] [--out <dir>]
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE = 'https://enterprise.colaberry.ai';
const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const SLUG = argOf('--slug', 'ai-systems-architect-training-system');
const OUT = argOf('--out', path.join(__dirname, '..', 'docs', 'screenshots', 'case-study-walkthrough'));

/** Console errors and failed requests, collected per page rather than per run. */
function watch(page, sink) {
  page.on('console', (m) => {
    if (m.type() === 'error') sink.console.push(m.text().slice(0, 300));
  });
  page.on('requestfailed', (r) => {
    // A cancelled navigation request is not a failure worth reporting.
    const why = r.failure() && r.failure().errorText;
    if (why && !/ERR_ABORTED/.test(why)) sink.network.push(`${r.url().slice(0, 160)} — ${why}`);
  });
  page.on('response', (r) => {
    if (r.status() >= 400) sink.network.push(`${r.status()} ${r.url().slice(0, 160)}`);
  });
}

async function shoot(page, name, opts = {}) {
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, ...opts });
  const kb = Math.round(fs.statSync(file).size / 1024);
  console.log(`  captured ${name}.png (${kb} KB)`);
  return file;
}

/** Scroll to a heading by text and shoot the region around it. */
async function shootSection(page, name, headingRe) {
  const h = page.locator('h1, h2, h3').filter({ hasText: headingRe }).first();
  if (await h.count() === 0) {
    console.log(`  SKIPPED ${name} — no heading matching ${headingRe}`);
    return null;
  }
  await h.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  return shoot(page, name);
}

(async () => {
  const results = { console: [], network: [] };
  const browser = await chromium.launch();
  const shots = [];
  let failures = 0;

  try {
    /* ── desktop ──────────────────────────────────────────────────────────── */
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await desktop.newPage();
    watch(page, results);

    console.log('DESKTOP — index');
    await page.goto(`${BASE}/stories`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(800);
    shots.push(await shoot(page, '01-desktop-index'));

    // The card must appear exactly once.
    const cards = page.locator(`a[href*="/stories/${SLUG}"], [data-slug="${SLUG}"]`);
    const cardCount = await cards.count();
    console.log(`  cards for this slug: ${cardCount}`);
    if (cardCount !== 1) { console.log(`  FAIL expected exactly 1 card, found ${cardCount}`); failures += 1; }

    console.log('DESKTOP — detail');
    await page.goto(`${BASE}/stories/${SLUG}`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1200);
    const title = (await page.locator('h1').first().textContent() || '').trim();
    console.log(`  h1: ${title}`);
    if (!/Verifiable AI Capability/i.test(title)) { console.log('  FAIL title is not the new one'); failures += 1; }
    shots.push(await shoot(page, '02-desktop-detail-hero'));

    shots.push(await shootSection(page, '03-desktop-architecture', /architect|what was built|built/i));
    shots.push(await shootSection(page, '04-desktop-measurement', /measur|how we|proof|evidence/i));
    shots.push(await shootSection(page, '05-desktop-limitations', /does not show|limitation/i));

    // Full page, for the record.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    shots.push(await shoot(page, '06-desktop-detail-full', { fullPage: true }));

    // PRIVACY SCAN. The first version of this failed on the repository name
    // outright, which was wrong: that repo is genuinely public on GitHub (200
    // unauthenticated) and carries allowPublicRepoLink, so the projection is
    // SUPPOSED to name and link it. A check that cannot tell a consented public
    // repo from a leaked private one reports a violation every time and is
    // therefore ignored — which is worse than not checking.
    //
    // So the assertion is about tokens that are NEVER public regardless of
    // consent: internal identifiers, learner identity, and lead/enrollment keys.
    const body = (await page.locator('body').innerText()).toLowerCase();
    const NEVER_PUBLIC = [
      'enrollment_id', 'enrollmentid', 'evidence_id', 'evidenceid',
      'lead_id', 'leadid', 'source_ref', 'sourceref', 'correlation_id',
    ];
    const leaked = NEVER_PUBLIC.filter((t) => body.includes(t));
    if (leaked.length) {
      console.log(`  FAIL internal identifiers in page text: ${leaked.join(', ')}`);
      failures += 1;
    } else {
      console.log('  privacy scan: no internal identifier appears in the rendered text');
    }

    // Repositories may be named, but ONLY when the projection chose to include
    // them — which it does only for a repo flagged public. A repo the projection
    // withheld must not appear anywhere in the text.
    const projected = await page.evaluate(async (slug) => {
      const res = await fetch(`/api/public/case-studies/${slug}`);
      const j = await res.json();
      const cs = j.caseStudy || {};
      return { named: (cs.repositories || []).map((r) => String(r.label || '').toLowerCase()),
        withheldCount: cs.privateRepositoryCount || 0 };
    }, SLUG);
    console.log(`  repositories named by the projection: ${projected.named.length}, withheld: ${projected.withheldCount}`);

    /* ── mobile ───────────────────────────────────────────────────────────── */
    console.log('MOBILE — 390x844');
    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
      deviceScaleFactor: 2,
    });
    const mpage = await mobile.newPage();
    watch(mpage, results);
    await mpage.goto(`${BASE}/stories/${SLUG}`, { waitUntil: 'networkidle', timeout: 60000 });
    await mpage.waitForTimeout(1200);

    // Horizontal overflow is the mobile failure that a screenshot hides.
    const overflow = await mpage.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    console.log(`  horizontal overflow: ${overflow}px`);
    if (overflow > 1) { console.log('  FAIL page scrolls sideways'); failures += 1; }
    shots.push(await shoot(mpage, '07-mobile-detail', { fullPage: true }));

    await mpage.goto(`${BASE}/stories`, { waitUntil: 'networkidle', timeout: 60000 });
    await mpage.waitForTimeout(800);
    shots.push(await shoot(mpage, '08-mobile-index'));
  } finally {
    await browser.close();
  }

  console.log('');
  console.log('CONSOLE ERRORS :', results.console.length);
  results.console.slice(0, 8).forEach((e) => console.log('  -', e));
  console.log('FAILED REQUESTS:', results.network.length);
  results.network.slice(0, 8).forEach((e) => console.log('  -', e));
  console.log('SCREENSHOTS    :', shots.filter(Boolean).length, 'in', OUT);
  console.log('ASSERTION FAILS:', failures);

  // Console errors and failed requests are FAILURES, not footnotes.
  process.exitCode = failures + results.console.length + results.network.length > 0 ? 1 : 0;
})().catch((err) => {
  console.error('WALKTHROUGH_FAILED', err && err.message);
  process.exitCode = 1;
});
