/**
 * hire.refactored.ai - a person's name cannot be probed.
 *
 * The API answers "no such person" and "not listed" with the same 404 (pinned in the backend
 * suites). This checks the PAGE does too: an unknown slug and a known-but-unlisted one render
 * byte-identical <main>, and the same holds for case studies. It also checks the host answers
 * the old app's API with 410 JSON, never this site's HTML.
 */
const L = require('./lib');

async function mainOf(browser, base, routes, url) {
  const ctx = await browser.newContext();
  await L.routeApi(ctx, routes);
  const page = await ctx.newPage();
  await page.goto(`${base}${url}`);
  await page.waitForTimeout(1200);
  const html = await page.innerHTML('main');
  const robots = await page.getAttribute('#robots', 'content');
  await ctx.close();
  return { html, robots };
}

async function run() {
  L.build();
  const { server, base } = await L.serve();
  const browser = await L.launch();
  const { check, report } = L.scorer('404 parity');
  try {
    const NOT_FOUND = { status: 404, body: { error: 'Not found' } };
    const unknown = await mainOf(browser, base, { '/api/public/portfolios/nobody-here': NOT_FOUND }, '/talent/nobody-here/');
    const unlisted = await mainOf(browser, base, { '/api/public/portfolios/ann-lee': NOT_FOUND }, '/talent/ann-lee/');
    check('an unknown and an unlisted portfolio render the same page', unknown.html === unlisted.html && unknown.html.includes("This profile isn't listed"));
    check('neither is indexable', unknown.robots === 'noindex, nofollow' && unlisted.robots === 'noindex, nofollow');

    const down = await mainOf(browser, base, { '/api/public/portfolios/ann-lee': 'abort' }, '/talent/ann-lee/');
    check('a portfolio whose API is down reads the same as not listed', down.html === unknown.html);

    const csUnknown = await mainOf(browser, base, { '/api/public/case-studies/nope': NOT_FOUND }, '/case-studies/nope/');
    const csOther = await mainOf(browser, base, { '/api/public/case-studies/elsewhere-only': NOT_FOUND }, '/case-studies/elsewhere-only/');
    check('an unknown case study and one published only elsewhere render the same page',
      csUnknown.html === csOther.html && csUnknown.html.includes("isn't published here"));

    // nginx's own pages leaked through in production (2026-11-09): a plain 404 for an
    // unknown path and a plain 403 for the bare collections.
    const stray = L.resolveFile('/no-such-page/');
    check('an unknown path gets the site\'s branded 404, with a 404 status',
      stray.status === 404 && /404\.html$/.test(stray.file || ''));
    const ctx404 = await browser.newContext();
    const p404 = await ctx404.newPage();
    const r404 = await p404.goto(`${base}/no-such-page/`);
    check('the branded 404 renders and points home',
      r404.status() === 404 && (await p404.textContent('h1')).includes('There is no page here') && (await p404.getAttribute('main a', 'href')) === '/');
    await ctx404.close();
    for (const [p, to] of [['/talent/', '/#talent'], ['/case-studies/', '/#published']]) {
      const r = L.resolveFile(p);
      check(`${p} redirects to ${to}, never a 403`, r.status === 302 && r.location === to);
    }

    for (const p of ['/ws-post-job', '/api/anything']) {
      const r = L.resolveFile(p);
      check(`${p} answers 410 retired JSON, never the HTML shell`, r.status === 410 && r.json === '{"error":"retired"}');
    }
  } catch (err) {
    check('run completed without an exception', false, err.message);
  } finally {
    await browser.close();
    server.close();
  }
  process.exit(report() ? 0 : 1);
}

run();
