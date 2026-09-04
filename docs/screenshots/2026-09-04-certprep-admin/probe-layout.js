/**
 * What each main portal page actually does when you scroll: is there a condensed
 * "next step" bar in the header, and is there a sticky secondary column between
 * the main content and the contacts rail? Measured, not read off the source.
 */
const { chromium } = require('playwright');
const fs = require('fs');

const APP = 'http://localhost:3095';
const ROUTES = ['/portal/today', '/portal/projects', '/portal/classroom', '/portal/community',
  '/portal/cert-prep', '/portal/schedule', '/portal/points', '/portal/rooms', '/portal/events'];

(async () => {
  const b = await chromium.launch();
  // A short viewport on purpose: several pages are taller than 900px only when
  // a fixture has data, and a page that cannot scroll reads as 'no condensed bar'
  // when the truth is 'nothing to scroll'. 560px makes every page scrollable.
  const ctx = await b.newContext({ viewport: { width: 1600, height: 560 } });
  const page = await ctx.newPage();
  await page.goto(`${APP}/dev-enter?who=w11`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const rows = [];
  for (const route of ROUTES) {
    await page.goto(APP + route, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1800);
    // Scroll to the bottom rather than a fixed offset: a page shorter than the
    // offset would otherwise read as "no condensed bar" when the truth is
    // "nothing to scroll", which is a different finding entirely.
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(900);
    const r = await page.evaluate(() => {
      const slot = document.querySelector('.te-condensed-slot');
      const condensed = !!slot && slot.classList.contains('is-visible') && slot.getBoundingClientRect().width > 40;
      // any element that is a secondary column inside the main area
      const cands = [...document.querySelectorAll('.te-side, .tl-side, aside')]
        .filter((el) => el.getBoundingClientRect().width > 100 && !el.closest('.te-contacts'));
      const side = cands[0];
      return {
        condensed,
        condensedText: slot ? (slot.innerText || '').replace(/\s+/g, ' ').slice(0, 60) : '',
        sideClass: side ? side.className : null,
        sidePosition: side ? getComputedStyle(side).position : null,
        sideWidth: side ? Math.round(side.getBoundingClientRect().width) : 0,
        sideTop: side ? Math.round(side.getBoundingClientRect().top) : null,
        scrolled: Math.round(window.scrollY),
        scrollable: document.documentElement.scrollHeight - window.innerHeight,
      };
    });
    rows.push({ route, ...r });
    console.log(
      route.padEnd(22),
      'condensed:', String(r.condensed).padEnd(6),
      '| side:', (r.sideClass || 'none').slice(0, 22).padEnd(24),
      r.sidePosition || '', r.sideWidth ? `w=${r.sideWidth} top=${r.sideTop}` : '',
      '| scrollY', String(r.scrolled).padEnd(5),
      r.scrollable < 120 ? '(page too short to judge)' : '',
    );
  }
  fs.writeFileSync('layout-probe.json', JSON.stringify(rows, null, 2));
  await b.close();
})();
