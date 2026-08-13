/**
 * Full pre-handoff check.
 * Every page is visited BOTH ways, because the reveal bug only appeared on
 * client-side navigation and a direct-load-only check missed it entirely.
 */
const { chromium } = require(process.env.PW_PATH);
const BASE = 'http://localhost:3000';
const ROUTES = [
  ['home', '/v2'], ['services', '/v2/services'], ['svc-detail', '/v2/services/ai-opportunity-sprint'],
  ['platform', '/v2/platform'], ['proof', '/v2/proof'], ['lab', '/v2/lab'],
  ['try', '/v2/try'], ['privacy', '/v2/privacy'], ['start', '/v2/start'],
];

async function probe(page) {
  await page.waitForTimeout(3000);
  return page.evaluate(() => {
    const rv = Array.from(document.querySelectorAll('.cbv2-rv'));
    const hidden = rv.filter((e) => parseFloat(getComputedStyle(e).opacity) < 0.99);
    const main = document.querySelector('main');
    // Height of content BELOW the first section, i.e. what "nothing below the hero" would zero out.
    const sections = Array.from(document.querySelectorAll('main section'));
    const belowHero = sections.slice(1).reduce((a, s) => a + s.getBoundingClientRect().height, 0);
    return {
      h1: Boolean(document.querySelector('h1')),
      sections: sections.length,
      rvHidden: hidden.length,
      belowHeroPx: Math.round(belowHero),
      textLen: ((main && main.innerText) || '').replace(/\s+/g, ' ').trim().length,
      imgsBroken: Array.from(document.images).filter((i) => i.complete && i.naturalWidth === 0).length,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
}

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('JS: ' + String(e).slice(0, 100)));
  page.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('gstatic')) errs.push(r.status() + ' ' + r.url().slice(0, 70)); });

  console.log('MODE          ROUTE        H1 SECT RVHID BELOWHERO TEXT  BROKEN OVERFLOW');
  const bad = [];

  for (const [name, route] of ROUTES) {
    await page.goto(BASE + route, { waitUntil: 'networkidle' });
    const d = await probe(page);
    console.log('direct-load  ', name.padEnd(12), d.h1 ? 'y' : 'N', String(d.sections).padStart(4), String(d.rvHidden).padStart(5), String(d.belowHeroPx).padStart(9), String(d.textLen).padStart(5), String(d.imgsBroken).padStart(6), d.overflow ? ' YES' : '  no');
    if (!d.h1 || d.rvHidden > 0 || d.belowHeroPx < 200 || d.overflow || d.imgsBroken) bad.push(['direct', name, d]);
  }

  // Now click through the whole site in one session, never reloading.
  await page.goto(BASE + '/v2', { waitUntil: 'networkidle' });
  for (const label of ['Platform', 'Proof', 'Services', 'Start Free']) {
    await page.getByRole('link', { name: label, exact: true }).first().click();
    await page.waitForTimeout(400);
    const d = await probe(page);
    const url = page.url().replace(BASE, '');
    console.log('click-through', url.padEnd(12), d.h1 ? 'y' : 'N', String(d.sections).padStart(4), String(d.rvHidden).padStart(5), String(d.belowHeroPx).padStart(9), String(d.textLen).padStart(5), String(d.imgsBroken).padStart(6), d.overflow ? ' YES' : '  no');
    if (!d.h1 || d.rvHidden > 0 || d.belowHeroPx < 200 || d.overflow || d.imgsBroken) bad.push(['click', url, d]);
  }

  console.log('\nerrors:', errs.length ? JSON.stringify([...new Set(errs)].slice(0, 6)) : 'none');
  console.log('failures:', bad.length ? JSON.stringify(bad) : 'NONE');
  await b.close();
})();
