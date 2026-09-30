/**
 * storyHeroMeasure.js — the one number Checkpoint B is trying to move.
 *
 * `STORY_FORMAT_V1.md` section 2.3 records the masthead at 1166px on desktop and
 * 2309px on mobile, and calls that the single most important constraint on the
 * proposed rhythm: any change that ADDS to the hero is moving the wrong way.
 * That figure was measured once and written into a comment. This makes it
 * repeatable, so "the hero got smaller" is an observation rather than a claim.
 *
 * It measures rather than asserts, on purpose. There is no pass threshold here
 * because the honest before/after comparison is between two runs of this script
 * against two builds, not between one run and a number somebody guessed.
 *
 * Usage:
 *   BASE_URL=https://enterprise.colaberry.ai PW_PATH=playwright \
 *     node tests/systemV2/storyHeroMeasure.js
 *   SLUG=<slug>   which record to measure (default: the pilot)
 *   OUT=<file>    where the JSON lands
 *
 * Exit 0 = both viewports measured. Exit 1 = the page never rendered, which is
 * reported as a failure rather than as a zero-height hero.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PW_PATH || 'playwright');

const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const SLUG = process.env.SLUG || 'ai-systems-architect-training-system';
const OUT = process.env.OUT || path.resolve(__dirname, '../../.loop-architect/hero-measure.json');

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'mobile', width: 390, height: 844 },
];

/**
 * Read in the page. Every selector is optional and reports `null` when absent,
 * because a band this pass MOVES is expected to be missing from its old parent —
 * a missing node is the result, not an error.
 */
function probe() {
  const box = (selector) => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { height: Math.round(r.height), top: Math.round(r.top + window.scrollY) };
  };
  const hero = document.querySelector('.cbv2-story .cbv2-pagehero');
  return {
    heroHeight: hero ? Math.round(hero.getBoundingClientRect().height) : null,
    documentHeight: Math.round(document.documentElement.scrollHeight),
    viewportHeight: window.innerHeight,
    // Where the reader meets the first sentence of the story, which is what the
    // hero height is a proxy for.
    firstSectionTop: box('.cbv2-story__section') ? box('.cbv2-story__section').top : null,
    factsInHero: !!document.querySelector('.cbv2-pagehero .cbv2-story__facts'),
    indicatorsInHero: !!document.querySelector('.cbv2-pagehero .cbv2-story__indicators'),
    metricsInHero: !!document.querySelector('.cbv2-pagehero .cbv2-story__metrics'),
    sections: Array.from(document.querySelectorAll('[data-section]'))
      .map((el) => {
        const r = el.getBoundingClientRect();
        return {
          key: el.getAttribute('data-section'),
          top: Math.round(r.top + window.scrollY),
          height: Math.round(r.height),
          tone: el.className.includes('--sunken') ? 'sunken' : 'default',
        };
      }),
    // A figure band's own box, and the distance from the bottom of whatever
    // precedes it to its top. The second number is the one that shows a hole:
    // the band pays no padding of its own, so a large gap is coming from the
    // sections either side and is not visible in the band's own height.
    figureBands: Array.from(document.querySelectorAll('.cbv2-story-figures'))
      .map((el) => {
        const r = el.getBoundingClientRect();
        const prev = el.previousElementSibling;
        const prevBottom = prev
          ? Math.round(prev.getBoundingClientRect().bottom + window.scrollY)
          : null;
        return {
          top: Math.round(r.top + window.scrollY),
          height: Math.round(r.height),
          gapAbove: prevBottom === null ? null : Math.round(r.top + window.scrollY - prevBottom),
        };
      }),
  };
}

async function main() {
  const browser = await chromium.launch();
  const result = { base: BASE, slug: SLUG, measuredAt: new Date().toISOString(), viewports: {} };
  let failed = false;

  for (const viewport of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BASE}/stories/${SLUG}`, { waitUntil: 'networkidle', timeout: 45000 });
      await page.waitForSelector('.cbv2-story h1', { timeout: 20000 });
      result.viewports[viewport.name] = await page.evaluate(probe);
    } catch (err) {
      failed = true;
      result.viewports[viewport.name] = { error: String(err && err.message ? err.message : err) };
    }
    await ctx.close();
  }

  await browser.close();
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
  console.log(failed ? 'verdict:  FAIL — a viewport never rendered' : 'verdict:  MEASURED');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
