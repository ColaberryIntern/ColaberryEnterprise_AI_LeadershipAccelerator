/**
 * hire.refactored.ai - three levels, one click each (PROMPT §1.5), and the new tab.
 *
 *   Directory --click a card--> Portfolio (SAME tab) --click a project--> Case study (NEW tab)
 *
 * The new tab must open ON THE SAME CLICK, natively (target=_blank), so popup blockers
 * cannot kill it; the source card must play the launch; the new tab must boot.
 */
const L = require('./lib');

async function run() {
  L.build();
  const { server, base } = await L.serve();
  const browser = await L.launch();
  const { check, report } = L.scorer('drill-through');
  try {
    const ctx = await browser.newContext();
    await L.routeApi(ctx, {
      '/api/public/hire/talent': L.directory([L.person('ann-lee', 'Ann Lee')]),
      '/api/public/portfolios/ann-lee': L.portfolio('ann-lee', 'Ann Lee'),
      '/api/public/case-studies/ann-lee-case': L.caseStudy('ann-lee-case', 'ann-lee', 'Ann Lee'),
      '/api/public/case-studies': { items: [] },
    });
    const page = await ctx.newPage();
    await page.goto(`${base}/`);
    await page.waitForSelector('.tcard a.tcard-link', { timeout: 10000 });

    // Level 1 -> 2, same tab.
    const pagesBefore = ctx.pages().length;
    await page.click('.tcard a.tcard-link');
    await page.waitForURL(`${base}/talent/ann-lee/`, { timeout: 10000 });
    check('a card opens the portfolio in the SAME tab', ctx.pages().length === pagesBefore && page.url().endsWith('/talent/ann-lee/'));
    await page.waitForSelector('.p-head h1', { timeout: 10000 });
    check('the portfolio renders the person', (await page.textContent('.p-head h1')) === 'Ann Lee');
    check('the signature case study leads, marked as a launch link', !!(await page.$('a.sig[target="_blank"][rel="noopener"][data-launch]')));
    check('an unpublished project says "Case study in review" and is not a link', (await page.$$eval('.proj.pending', (els) => els.map((e) => e.tagName))).join() === 'DIV');

    // Level 2 -> 3, new tab on the same click. The launch lasts 700ms and removes itself on
    // animationend, which can be over before the new tab reports in - so record it as it
    // happens rather than inspecting the card afterwards.
    await page.evaluate(() => {
      const el = document.querySelector('a.sig');
      window.__launched = false;
      new MutationObserver(() => { if (el.classList.contains('launch')) window.__launched = true; })
        .observe(el, { attributes: true, attributeFilter: ['class'] });
    });
    const [popup] = await Promise.all([ctx.waitForEvent('page', { timeout: 5000 }), page.click('a.sig')]);
    check('the case study opens in a NEW tab on the same click', !!popup);
    check('the source card plays the launch', await page.evaluate(() => window.__launched === true));
    check('the toast says it is opening', (await page.textContent('#toast')).includes('Opening case study'));
    await popup.waitForLoadState('domcontentloaded');
    check('the new tab is the case study', popup.url().endsWith('/case-studies/ann-lee-case/'));
    const booted = await popup.waitForSelector('.boot', { timeout: 3000 }).then(() => true).catch(() => false);
    check('the new tab boots (the case study verifies itself)', booted);
    await popup.waitForSelector('.boot', { state: 'detached', timeout: 6000 }).catch(() => null);
    check('the boot overlay leaves within the 4s cap', !(await popup.$('.boot')));
    check('the record reveals with the builder chip linked to the portfolio', !!(await popup.$('a.builder[href="/talent/ann-lee/"]')));
    check('focus starts on the h1 after boot', await popup.evaluate(() => document.activeElement && document.activeElement.id === 'cs-title'));

    // Replays: ten fast clicks do not stack (one .launch at a time, never two).
    const replay = await page.evaluate(() => {
      const el = document.querySelector('a.sig');
      el.addEventListener('click', (e) => e.preventDefault(), { once: false }); // stop ten real tabs in the test only
      let max = 0;
      for (let i = 0; i < 10; i += 1) { el.click(); max = Math.max(max, document.querySelectorAll('.launch').length); }
      return max;
    });
    check('ten fast clicks replay the launch without stacking', replay === 1, `max .launch = ${replay}`);
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
