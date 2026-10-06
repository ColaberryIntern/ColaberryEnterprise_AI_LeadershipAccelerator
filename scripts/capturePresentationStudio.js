/**
 * capturePresentationStudio.js
 *
 * P2-T8's evidence: real screenshots of the deployed Presentation Studio at the two
 * widths the build spec names — 1440 (desktop) and 390 (iPhone-class).
 *
 * Every capture routes through captureHelpers so no PNG exceeds the width ceiling.
 *
 * WHY IT ASSERTS BEFORE IT SHOOTS. A screenshot of a login redirect, or of a page
 * whose panel never rendered, is a photograph of nothing that still looks like
 * evidence. Each stop names a string that MUST be on the page; a stop whose string is
 * missing is recorded as a failure in the summary rather than quietly saved.
 *
 * Usage:
 *   node scripts/capturePresentationStudio.js
 *
 * Env:
 *   CAPTURE_BASE   default https://www.refactored.ai  (the accelerator's public host)
 *   CAPTURE_TOKEN  default reads scripts/.ali_jwt.txt
 *   CAPTURE_OUT    default docs/screenshots/<date>-studio
 *   PROJECT_ID     the project whose PREP tasks are captured
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { createSafeContext, safeScreenshot, writeCaptureSummary, readDefaultToken } = require('./captureHelpers');

const REPO_ROOT = path.resolve(__dirname, '..');
const BASE = process.env.CAPTURE_BASE || 'https://www.refactored.ai';
const PROJECT_ID = process.env.PROJECT_ID || '6e4bd9da-a22b-4b90-b5b2-55686487f39f';
const OUT_DIR = process.env.CAPTURE_OUT
  || path.join(REPO_ROOT, 'docs', 'screenshots', `${new Date().toISOString().slice(0, 10)}-studio`);

const TOKEN = readDefaultToken();
if (!TOKEN) {
  console.error('[studio] No token at scripts/.ali_jwt.txt and no CAPTURE_TOKEN.');
  console.error('[studio] Every authenticated route would redirect to the login page.');
  process.exit(1);
}

/** One stop: a prep task, and a string that proves the page actually rendered. */
const STOPS = [
  { id: 'prep1-narrative', task: 'PREP-1', must: 'What to do' },
  { id: 'prep2-recording', task: 'PREP-2', must: 'Hand it in' },
  { id: 'prep4-rehearsal', task: 'PREP-4', must: 'What to do' },
  { id: 'prep6-demo-day', task: 'PREP-6', must: 'Demo Day' },
];

const WIDTHS = [
  { label: 'desktop', width: 1440, height: 900 },
  { label: 'mobile', width: 390, height: 844 },
];

/**
 * Expand every inner scroll container to its full height before shooting.
 *
 * The workspace puts its main column in `overflow-y: auto`, so a `fullPage`
 * screenshot captures the viewport-sized BOX and slices the content mid-sentence.
 * The first run of this script produced exactly that and it looked like a mobile
 * layout bug — it was not; a probe showed the container scrolls and a real user can
 * read all of it. A screenshot that misrepresents the page is worse than none.
 */
async function expandScrollers(page) {
  await page.evaluate(() => {
    // The app shell is a 100vh box with its own scroller, so releasing the inner
    // container alone is not enough — the document still cannot grow and fullPage
    // keeps stopping at one viewport. Both have to give.
    for (const el of [document.documentElement, document.body]) {
      el.style.height = 'auto';
      el.style.minHeight = '0';
      el.style.maxHeight = 'none';
      el.style.overflow = 'visible';
    }
    document.querySelectorAll('*').forEach((el) => {
      const cs = getComputedStyle(el);
      const scrolls = cs.overflowY === 'auto' || cs.overflowY === 'scroll' || cs.overflow === 'hidden';
      const vhBound = /vh$/.test(el.style.height || '') || cs.height === `${window.innerHeight}px`;
      if ((scrolls && el.scrollHeight > el.clientHeight + 4) || vhBound) {
        el.style.height = 'auto';
        el.style.maxHeight = 'none';
        el.style.overflow = 'visible';
      }
    });
    // A sticky footer bar that was pinned to the viewport now sits over the content
    // it used to float above. Un-pin it so it does not cover a panel in the shot.
    document.querySelectorAll('*').forEach((el) => {
      const pos = getComputedStyle(el).position;
      if (pos === 'fixed' || pos === 'sticky') el.style.position = 'static';
    });
  });
  // Let the layout settle after the heights change.
  await page.waitForTimeout(800);
}

/** Did the page render the Studio, or did it bounce us to a login? */
async function assertRendered(page, must) {
  const url = page.url();
  if (/\/login/i.test(url)) return { ok: false, why: `redirected to login (${url})` };
  const body = await page.textContent('body').catch(() => '');
  if (!body || body.trim().length < 80) return { ok: false, why: 'page body is empty' };
  if (!body.includes(must)) return { ok: false, why: `expected text not found: "${must}"` };
  return { ok: true, why: null };
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const entries = [];
  let failures = 0;

  for (const vp of WIDTHS) {
    const ctx = await createSafeContext(browser, {
      token: TOKEN,
      viewport: { width: vp.width, height: vp.height, deviceScaleFactor: 1 },
    });
    const page = await ctx.newPage();

    for (const stop of STOPS) {
      const url = `${BASE}/portal/projects/workspace/${PROJECT_ID}/${stop.task}`;
      const file = path.join(OUT_DIR, `${stop.id}-${vp.label}.png`);
      let verdict;
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
        // The Studio hydrates its panels after the first paint; without this the
        // shot is of a skeleton that proves nothing.
        await page.waitForTimeout(2500);
        verdict = await assertRendered(page, stop.must);
        await expandScrollers(page);
      } catch (e) {
        verdict = { ok: false, why: `navigation failed: ${e.message}` };
      }

      await safeScreenshot(page, file, { fullPage: true });
      if (!verdict.ok) failures += 1;
      entries.push({
        name: `${stop.id} @ ${vp.width}`,
        file: path.basename(file),
        url,
        rendered: verdict.ok,
        note: verdict.why || `found "${stop.must}"`,
      });
      console.log(`[studio] ${verdict.ok ? 'OK  ' : 'FAIL'} ${stop.id} @${vp.width}  ${verdict.why || ''}`);
    }

    await ctx.close();
  }

  await browser.close();
  writeCaptureSummary(OUT_DIR, entries);
  console.log(`[studio] ${entries.length} captures, ${failures} failed -> ${OUT_DIR}`);
  // A run where nothing rendered must not exit 0 and look like success.
  process.exit(failures === entries.length ? 1 : 0);
})();
