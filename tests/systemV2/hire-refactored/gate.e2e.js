/**
 * hire.refactored.ai - the gate, as a reader meets it.
 *
 *   - a payload's people render as real anchor cards with the gold ring;
 *   - an EMPTY directory renders the honest "Nobody is listed yet";
 *   - the API DOWN renders that same honest state - no sample data, no spinner, no console spam loop.
 *
 * Self-test (`--self-test`): the FIRST step is served a deliberately broken directory payload
 * (no `ok: true`, so the shell must refuse it) while the checks still expect two listed
 * people. The script MUST then exit 1. The quality gate runs it both ways: plain must exit
 * 0, `--self-test` must exit 1 - a check that cannot go red proves nothing.
 */
const L = require('./lib');

async function run() {
  L.build();
  const { server, base } = await L.serve();
  const browser = await L.launch();
  const { check, report } = L.scorer('gate');
  const selfTest = process.argv.includes('--self-test');
  try {
    // 1. Listed people render.
    let ctx = await browser.newContext();
    const good = L.directory([L.person('ann-lee', 'Ann Lee'), L.person('bo-chen', 'Bo Chen')]);
    const broken = { ...good, ok: undefined }; // malformed: the shell must not render it
    await L.routeApi(ctx, { '/api/public/hire/talent': selfTest ? broken : good });
    let page = await ctx.newPage();
    await page.goto(`${base}/`);
    await page.waitForSelector('.tcard', { timeout: 10000 }).catch(() => null);
    const cards = await page.$$eval('.tcard a.tcard-link', (as) => as.map((a) => a.getAttribute('href')));
    check('listed people render as anchor cards to their portfolios', cards.length === 2 && cards[0] === '/talent/ann-lee/', JSON.stringify(cards));
    check('every listed person wears the gold ring and star', (await page.$$('.tcard .ava .ring')).length === 2 && (await page.$$('.tcard .ava .badge')).length === 2);
    check('the ledger prints the API totals', /2/.test(await page.textContent('.ledger')));
    await ctx.close();

    // 2. Nobody listed.
    ctx = await browser.newContext();
    await L.routeApi(ctx, { '/api/public/hire/talent': L.directory([]) });
    page = await ctx.newPage();
    await page.goto(`${base}/`);
    await page.waitForTimeout(800);
    check('an empty directory says "Nobody is listed yet"', (await page.textContent('main')).includes('Nobody is listed yet'));
    await ctx.close();

    // 3. API down.
    ctx = await browser.newContext();
    await L.routeApi(ctx, { '/api/public/hire/talent': 'abort' });
    page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`${base}/`);
    await page.waitForTimeout(1500);
    const main = await page.textContent('main');
    const noSample = (text) => !/Ann Lee|Bo Chen|sample/i.test(text);
    check('API down keeps the honest empty state', main.includes('Nobody is listed yet'));
    check('API down shows no sample data', noSample(main));
    check('API down does not loop errors into the console', errors.length <= 2, `${errors.length} console errors`);
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
