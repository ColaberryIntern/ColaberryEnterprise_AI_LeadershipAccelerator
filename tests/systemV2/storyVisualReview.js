/**
 * storyVisualReview.js — viewport-sized frames of `/stories/:slug`, for looking at.
 *
 * WHY NOT A FULL-PAGE SCREENSHOT. The pilot record is 8584px tall on desktop and
 * 12319px on mobile. A full-page capture of that is one image nobody can read at
 * a glance and, in a review pipeline, one image large enough to be its own
 * problem. This walks the page a screen at a time instead, which is how a reader
 * actually meets it.
 *
 * WHY IT EXISTS AT ALL. `caseStudyPublic.e2e.js` proves the page is not broken.
 * It cannot prove the page is good. This surface has shipped three separate
 * invisible-text failures (1.06:1, 1.03:1, 1.00:1) that every token check and
 * every unit test passed, so "looked at it" is a completion condition here and
 * this is the thing that makes looking cheap enough to actually do.
 *
 * Usage:
 *   BASE_URL=http://localhost:3000 PW_PATH=playwright \
 *     SHOT_DIR=<dir> node tests/systemV2/storyVisualReview.js
 *   SLUG=<slug>    which record (default: the pilot)
 *   FRAMES=<n>     how many screens to walk (default 6)
 *   AUGMENT=1      see below
 *
 * AUGMENT=1 IS A SYNTHETIC PAYLOAD AND MUST BE REPORTED AS ONE.
 * `situation.constraints`, `situation.goals` and `architecture.dataStores` are
 * projected by this branch and NOT by whatever server the run points at, so
 * against a real API the bands that render them are correctly empty and cannot
 * be looked at. With this flag the detail response is intercepted and those
 * three fields are filled with placeholder strings that say what they are, so
 * the bands can be SEEN - their spacing, their contrast, their behaviour at
 * 390px. Nothing here proves anything about real content: the projector is
 * proved by `caseStudyPublicSectionsFormatV1.test.ts`. This exists so that a
 * band nobody has ever looked at does not ship on the strength of a unit test.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PW_PATH || 'playwright');

const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const SLUG = process.env.SLUG || 'ai-systems-architect-training-system';
const FRAMES = Number(process.env.FRAMES || 6);
const SHOT_DIR = process.env.SHOT_DIR || path.resolve(__dirname, '../../.loop-architect/review');

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'mobile', width: 390, height: 844 },
];

async function main() {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch();
  let failed = false;

  for (const viewport of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
    });
    // ANSWER THE CONSENT BANNER BEFORE THE FIRST PAINT, and answer it DENIED.
    // The banner is a fixed overlay across the bottom of the viewport, so on a
    // 390px screen it hides most of the page and every frame below the fold is a
    // picture of the banner. A returning visitor who has answered it does not see
    // it, which is the state worth reviewing. Denied rather than granted because
    // a screenshot run must not switch the tracker on and write rows.
    await ctx.addInitScript(() => {
      try {
        window.localStorage.setItem('cbv2_consent', 'denied');
      } catch (err) { /* private mode: the banner stays, and the frames say so */ }
    });
    const page = await ctx.newPage();
    if (process.env.AUGMENT === '1') {
      await page.route('**/api/public/case-studies/**', async (route) => {
        const response = await route.fetch();
        let body;
        try {
          body = await response.json();
        } catch (err) {
          return route.fulfill({ response });
        }
        if (!body || !body.caseStudy) return route.fulfill({ response });
        const cs = body.caseStudy;
        if (cs.situation) {
          cs.situation.goals = [
            'SYNTHETIC: teach domain experts to architect AI systems without a software engineering detour.',
            'SYNTHETIC: make every claimed skill traceable to work the learner actually shipped.',
          ];
          cs.situation.constraints = [
            'SYNTHETIC: learners arrive with no technical background and cannot be assumed to code.',
            'SYNTHETIC: evidence has to live in the learner own repository, not in a training sandbox.',
          ];
        }
        if (cs.architecture) cs.architecture.dataStores = ['SYNTHETIC-postgresql', 'SYNTHETIC-chroma'];
        return route.fulfill({ response, json: body });
      });
    }
    try {
      await page.goto(`${BASE}/stories/${SLUG}`, { waitUntil: 'networkidle', timeout: 45000 });
      await page.waitForSelector('.cbv2-story h1', { timeout: 20000 });
      // The V2 reveal animation is scroll-triggered. Walking the page top to
      // bottom once first means every `.cbv2-rv` band has been asked to reveal
      // before any frame is taken, so a frame never captures a band mid-fade
      // and reports it as a contrast defect.
      const total = await page.evaluate(async () => {
        const step = window.innerHeight;
        for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 120));
        }
        window.scrollTo(0, 0);
        await new Promise((r) => setTimeout(r, 300));
        return document.documentElement.scrollHeight;
      });

      const stride = Math.max(1, Math.floor(total / FRAMES));
      for (let i = 0; i < FRAMES; i += 1) {
        const y = Math.min(i * stride, Math.max(0, total - viewport.height));
        await page.evaluate((to) => window.scrollTo(0, to), y);
        await page.waitForTimeout(250);
        const file = path.join(SHOT_DIR, `story-${viewport.name}-f${i}-y${y}.png`);
        await page.screenshot({ path: file });
        console.log(`  shot  ${file}`);
      }
    } catch (err) {
      failed = true;
      console.log(`  FAIL  ${viewport.name} — ${err && err.message ? err.message : err}`);
    }
    await ctx.close();
  }

  await browser.close();
  console.log(failed ? 'verdict:  FAIL' : 'verdict:  CAPTURED');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
