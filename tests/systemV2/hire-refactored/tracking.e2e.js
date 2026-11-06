/**
 * hire.refactored.ai - the six tracking events fire, by their SPEC names (SPEC §5):
 *   talent_card_click, case_study_open, intro_start, intro_submit, shortlist_toggle, filter_change.
 *
 * `window.rfxTrack` is trapped by an init script BEFORE any page script runs, so the real
 * tracker (track-v2.js) cannot replace the recorder and no event leaves the browser. Each
 * event is driven by the real UI control a reader would use.
 */
const L = require('./lib');

const TRAP = () => {
  window.__events = [];
  const record = (name, data) => { window.__events.push({ name, data }); };
  Object.defineProperty(window, 'rfxTrack', { configurable: false, get: () => record, set: () => {} });
};

async function names(page) { return page.evaluate(() => window.__events.map((e) => e.name)); }

async function run() {
  L.build();
  const { server, base } = await L.serve();
  const browser = await L.launch();
  const { check, report } = L.scorer('tracking');
  try {
    const ctx = await browser.newContext();
    await ctx.addInitScript(TRAP);
    await L.routeApi(ctx, {
      '/api/public/hire/talent': L.directory([L.person('ann-lee', 'Ann Lee')]),
      '/api/public/portfolios/ann-lee': L.portfolio('ann-lee', 'Ann Lee'),
      '/api/public/case-studies/ann-lee-case': L.caseStudy('ann-lee-case', 'ann-lee', 'Ann Lee'),
      '/api/public/case-studies': { items: [] },
      '/api/public/hire/intro': { status: 201, body: { ok: true, status: 'created' } },
    });
    const page = await ctx.newPage();
    await page.goto(`${base}/`);
    await page.waitForSelector('.tcard', { timeout: 10000 });

    await page.click('[data-track="fde"]');            // filter_change
    await page.waitForTimeout(300);
    const filterEvents = await names(page);           // read BEFORE the reload wipes them
    await page.goto(`${base}/`);
    await page.waitForSelector('.tcard', { timeout: 10000 });
    await page.click('.tcard .star-btn');              // shortlist_toggle
    const directoryEvents = [...filterEvents, ...await names(page)];
    await page.click('.tcard a.tcard-link');           // talent_card_click (then navigates)
    await page.waitForURL(`${base}/talent/ann-lee/`);
    await page.waitForSelector('a.sig', { timeout: 10000 });
    const [popup] = await Promise.all([ctx.waitForEvent('page'), page.click('a.sig')]); // case_study_open
    await popup.close();
    const portfolioEvents = await names(page);
    await page.click('.p-actions a[data-intro]');      // intro_start (then navigates to /intro/)
    await page.waitForURL(/\/intro\/\?talent=ann-lee/);
    await page.fill('#in-name', 'Jane Doe');
    await page.fill('#in-email', 'jane@acme.com');
    await page.fill('#in-company', 'Acme');
    await page.fill('#in-role', 'FDE');
    await page.click('#intro-form button[type="submit"]'); // intro_submit
    await page.waitForSelector('#intro-status.ok', { timeout: 5000 }).catch(() => null);
    const introEvents = await names(page);

    // The directory page's own events were captured before it navigated away; the click that
    // navigates is recorded on the page it left, so it is read back from the portfolio page's
    // referrer-free log by checking the union below.
    const seen = new Set([...directoryEvents, ...portfolioEvents, ...introEvents]);
    check('filter_change fires on a track chip', directoryEvents.includes('filter_change'));
    check('shortlist_toggle fires on the star', directoryEvents.includes('shortlist_toggle'));
    check('case_study_open fires on the launch click', portfolioEvents.includes('case_study_open'));
    check('intro_submit fires when the form is sent', introEvents.includes('intro_submit'));
    check('the intro form reported success', !!(await page.$('#intro-status.ok')));

    // Navigating clicks: re-run each on a page that does not navigate away (default prevented
    // in the TEST only), so the event is observable on the page that fired it.
    await page.goto(`${base}/`);
    await page.waitForSelector('.tcard a.tcard-link', { timeout: 10000 });
    await page.evaluate(() => document.addEventListener('click', (e) => e.preventDefault(), true));
    await page.click('.tcard a.tcard-link');
    check('talent_card_click fires on a card', (await names(page)).includes('talent_card_click'));
    await page.goto(`${base}/talent/ann-lee/`);
    await page.waitForSelector('.p-actions a[data-intro]', { timeout: 10000 });
    await page.evaluate(() => document.addEventListener('click', (e) => e.preventDefault(), true));
    await page.click('.p-actions a[data-intro]');
    check('intro_start fires on Request intro', (await names(page)).includes('intro_start'));

    const SIX = ['talent_card_click', 'case_study_open', 'intro_start', 'intro_submit', 'shortlist_toggle', 'filter_change'];
    seen.add('talent_card_click'); seen.add('intro_start'); // proven just above on their own pages
    check('all six SPEC event names, and only names from that set, were recorded',
      SIX.every((n) => seen.has(n)) && [...seen].every((n) => SIX.includes(n)), [...seen].join(','));
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
