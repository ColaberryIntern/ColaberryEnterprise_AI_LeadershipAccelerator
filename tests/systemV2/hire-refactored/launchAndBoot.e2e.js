/**
 * hire.refactored.ai - the launch and boot details the motion contract names (MOTION §5-6):
 *
 *   launch   a second toast RESETS the 2200ms timer (it does not stack or cut short);
 *            under reduced motion the card never gets `.launch`, and the tab still opens.
 *   boot     on API failure the last line reads "case study not available" and the overlay
 *            is gone within the 4s cap (+ the 520ms removal); a second visit to the same slug
 *            in the same session never mounts it; Esc skips it.
 */
const L = require('./lib');

const ROUTES = {
  '/api/public/hire/talent': L.directory([L.person('ann-lee', 'Ann Lee')]),
  '/api/public/portfolios/ann-lee': L.portfolio('ann-lee', 'Ann Lee'),
  '/api/public/case-studies/ann-lee-case': L.caseStudy('ann-lee-case', 'ann-lee', 'Ann Lee'),
  '/api/public/case-studies': { items: [] },
};

async function run() {
  L.build();
  const { server, base } = await L.serve();
  const browser = await L.launch();
  const { check, report } = L.scorer('launch + boot');
  try {
    // ---- toast reset --------------------------------------------------------------
    let ctx = await browser.newContext();
    await L.routeApi(ctx, ROUTES);
    let page = await ctx.newPage();
    await page.goto(`${base}/talent/ann-lee/`);
    await page.waitForSelector('a.sig', { timeout: 10000 });
    const toast = await page.evaluate(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      window.HirePage.toast('first');
      await wait(1500);
      window.HirePage.toast('second');           // resets the 2200ms timer
      await wait(1500);                           // 3000ms after the first: the first timer would have hidden it
      const shownLate = document.getElementById('toast').classList.contains('show');
      await wait(1000);                           // 2500ms after the second: now it must be gone
      const goneAfter = !document.getElementById('toast').classList.contains('show');
      return { shownLate, goneAfter, text: document.getElementById('toast').textContent };
    });
    check('a second toast resets the timer (still visible 3s after the first)', toast.shownLate);
    check('and it then hides 2200ms after the second', toast.goneAfter);
    check('the second toast replaced the first, not stacked', toast.text === 'second');
    await ctx.close();

    // ---- reduced motion: no flex, no sweep, tab still opens -----------------------
    ctx = await browser.newContext({ reducedMotion: 'reduce' });
    await L.routeApi(ctx, ROUTES);
    page = await ctx.newPage();
    await page.goto(`${base}/talent/ann-lee/`);
    await page.waitForSelector('a.sig', { timeout: 10000 });
    await page.evaluate(() => {
      const el = document.querySelector('a.sig');
      window.__launched = false;
      new MutationObserver(() => { if (el.classList.contains('launch')) window.__launched = true; })
        .observe(el, { attributes: true, attributeFilter: ['class'] });
    });
    const [popup] = await Promise.all([ctx.waitForEvent('page', { timeout: 5000 }), page.click('a.sig')]);
    check('under reduced motion the card never gets .launch', await page.evaluate(() => window.__launched === false));
    check('under reduced motion the case study still opens in a new tab', !!popup);
    await ctx.close();

    // ---- boot: API failure, cap, failure line ---------------------------------------
    ctx = await browser.newContext();
    await L.routeApi(ctx, { ...ROUTES, '/api/public/case-studies/ann-lee-case': 'abort' });
    page = await ctx.newPage();
    const t0 = Date.now();
    await page.goto(`${base}/case-studies/ann-lee-case/`);
    await page.waitForSelector('.boot', { timeout: 3000 });
    const failureLine = await page.waitForFunction(
      () => (document.querySelector('.boot pre') || {}).textContent?.includes('case study not available'),
      null, { timeout: 4600 },
    ).then(() => true).catch(() => false);
    check('on API failure the boot prints "case study not available"', failureLine);
    await page.waitForSelector('.boot', { state: 'detached', timeout: 5000 }).catch(() => null);
    const gone = Date.now() - t0;
    check('the overlay is gone within the 4s cap plus removal', !(await page.$('.boot')) && gone < 5200, `${gone}ms`);
    check('the honest not-found state is what remains', (await page.textContent('main')).includes("isn't published here"));
    await ctx.close();

    // ---- boot: once per session, and Esc skips -------------------------------------
    ctx = await browser.newContext();
    await L.routeApi(ctx, ROUTES);
    page = await ctx.newPage();
    await page.goto(`${base}/case-studies/ann-lee-case/`);
    await page.waitForSelector('.boot', { timeout: 3000 });
    await page.keyboard.press('Escape');
    await page.waitForSelector('.boot', { state: 'detached', timeout: 1500 }).catch(() => null);
    check('Esc skips the boot sequence at once', !(await page.$('.boot')));
    await page.reload();
    const remounted = await page.waitForSelector('.boot', { timeout: 1200 }).then(() => true).catch(() => false);
    check('a second visit to the same slug in the session never mounts the overlay', remounted === false);
    await page.waitForSelector('.hire-hero h1', { timeout: 6000 });
    check('and the record is there at once', (await page.textContent('.hire-hero h1')).includes('claims triage'));
    await ctx.close();
  } catch (err) {
    check('run completed without an exception', false, err.message);
  } finally {
    await browser.close();
    server.close();
  }
  process.exit(report() ? 0 : 1);
}

run();
