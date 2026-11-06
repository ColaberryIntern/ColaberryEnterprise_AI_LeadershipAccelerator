/**
 * hire.refactored.ai - reduced motion is a first-class mode (MOTION.md §0.4).
 *
 * With `prefers-reduced-motion: reduce`: no animation runs anywhere, every element that
 * animates in is already in its final state, the count-up shows the final number at once,
 * the boot overlay NEVER mounts - and every link, including the new-tab case study, still
 * works. Then the same pages with motion allowed, as the control: the checks below must be
 * able to tell the two modes apart, or they prove nothing.
 */
const L = require('./lib');

const ROUTES = {
  '/api/public/hire/talent': L.directory([L.person('ann-lee', 'Ann Lee')]),
  '/api/public/portfolios/ann-lee': L.portfolio('ann-lee', 'Ann Lee'),
  '/api/public/case-studies/ann-lee-case': L.caseStudy('ann-lee-case', 'ann-lee', 'Ann Lee'),
  '/api/public/case-studies': { items: [] },
};

async function measure(browser, base, reducedMotion) {
  const ctx = await browser.newContext({ reducedMotion });
  await L.routeApi(ctx, ROUTES);
  const page = await ctx.newPage();
  await page.goto(`${base}/`);
  await page.waitForSelector('.ledger b', { timeout: 10000 });
  const firstCount = await page.$eval('.ledger b', (b) => b.textContent);
  const stepOpacity = await page.$eval('.step.anim', (el) => getComputedStyle(el).opacity);
  const runningAnimations = await page.evaluate(() => document.getAnimations().length);
  await page.goto(`${base}/talent/ann-lee/`);
  await page.waitForSelector('a.sig', { timeout: 10000 });
  const [popup] = await Promise.all([ctx.waitForEvent('page', { timeout: 5000 }), page.click('a.sig')]);
  await popup.waitForLoadState('domcontentloaded');
  const bootMounted = await popup.waitForSelector('.boot', { timeout: 1200 }).then(() => true).catch(() => false);
  await popup.waitForSelector('.hire-hero h1', { timeout: 6000 });
  const contentVisible = await popup.$eval('.hire-hero h1', (h) => h.getBoundingClientRect().height > 0);
  await ctx.close();
  return { firstCount, stepOpacity, runningAnimations, bootMounted, contentVisible, opened: !!popup };
}

async function run() {
  L.build();
  const { server, base } = await L.serve();
  const browser = await L.launch();
  const { check, report } = L.scorer('reduced motion');
  try {
    const reduced = await measure(browser, base, 'reduce');
    check('the count-up shows the final number at once', reduced.firstCount === '1', `first read ${reduced.firstCount}`);
    check('the gate rows are already visible (no fade-in left to run)', reduced.stepOpacity === '1', reduced.stepOpacity);
    check('no CSS animation runs on the directory', reduced.runningAnimations === 0, `${reduced.runningAnimations} running`);
    check('the boot overlay never mounts', reduced.bootMounted === false);
    check('the case study still opens in a new tab and its content is visible', reduced.opened && reduced.contentVisible);

    // The control: with motion allowed the same probes must read differently.
    const moving = await measure(browser, base, 'no-preference');
    check('CONTROL: with motion allowed, animations do run', moving.runningAnimations > 0, `${moving.runningAnimations} running`);
    check('CONTROL: with motion allowed, the boot overlay mounts', moving.bootMounted === true);
  } catch (err) {
    check('run completed without an exception', false, err.message);
  } finally {
    await browser.close();
    server.close();
  }
  process.exit(report() ? 0 : 1);
}

run();
