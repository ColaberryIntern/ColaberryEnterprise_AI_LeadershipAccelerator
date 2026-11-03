#!/usr/bin/env node
/**
 * Find WHAT makes a portal page wider than its viewport, instead of reasoning about it.
 *
 * ## Why this exists rather than a CSS patch
 *
 * Ruth Kumera reported (27 Oct 2026, ticket 10467362457) that the AI builder status page "cuts off
 * the 'your level journey' and the rest of the page content" and "doesn't let you scroll to the
 * right to reveal the content". Diagnosing that from the stylesheets produced three plausible
 * culprits and all three turned out to be working as designed:
 *
 *   - `.pts-lenses` uses `repeat(3, minmax(0,1fr))` and its own comment says that is deliberate
 *     "e.g. the narrower Settings > Points tab" - the tracks are MEANT to shrink.
 *   - `.pts-jtrack` is a real `overflow-x:auto` scroll container, so the 9-rung ladder scrolls
 *     itself and does not push the page.
 *   - `TodayShell.css` already carries a measured `min-width:0` fix, but it was measured at a
 *     390px viewport where `.te-nav` and `.te-contacts` are `display:none` and the shell is a
 *     single column. At desktop width the grid is `248px 1fr 300px`. Same declaration, different
 *     geometry, so that measurement does not transfer.
 *
 * Hoisting `min-width:0` to all widths stops a grid item forcing its track wider, but it does NOT
 * create a scrollbar - so done blind it can trade "the page scrolls sideways" for "the content is
 * clipped inside its column", which is a different bug wearing the same symptom. This script
 * measures which element actually overflows so the fix can be aimed.
 *
 * ## What it does
 *
 * For each route, at each width: find every element whose own content is wider than the viewport,
 * sort by how far it overflows, and report the worst offenders with a usable selector, their
 * computed `overflow-x`, and whether they are a scroll container (which means they are fine). It
 * also walks up from the widest offender naming each ancestor's `min-width` and `overflow-x`,
 * because the culprit is usually an ancestor that refuses to shrink rather than the wide child.
 *
 * ## It fails loudly without a session
 *
 * `scripts/.ali_jwt.txt` expires. An unauthenticated portal route renders a login screen, which
 * has no overflow - so a silent pass would read as "the bug is fixed" when it means "I never
 * loaded the page". This asserts it is signed in before measuring anything, and exits non-zero
 * if not.
 *
 * Refresh the token: open the portal, F12 Console, type `allow pasting`, then
 * `copy(localStorage.getItem('participant_token'))` and paste into `scripts/.ali_jwt.txt`.
 *
 * Usage:
 *   node scripts/diagnoseHorizontalOverflow.js
 *   node scripts/diagnoseHorizontalOverflow.js --widths 1440,1280,1024,390
 *   BASE=https://enterprise.colaberry.ai node scripts/diagnoseHorizontalOverflow.js
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'https://enterprise.colaberry.ai';
const TOKEN_FILE = path.resolve(__dirname, '.ali_jwt.txt');

const ROUTES = [
  { name: 'settings-points-tab', url: '/portal/settings?tab=points' },
  { name: 'points-page', url: '/portal/points' },
];

function parseWidths() {
  const i = process.argv.indexOf('--widths');
  if (i === -1) return [1440, 1280, 1024, 390];
  return String(process.argv[i + 1] || '')
    .split(',')
    .map((w) => parseInt(w.trim(), 10))
    .filter((w) => Number.isFinite(w) && w >= 320);
}

function readToken() {
  if (!fs.existsSync(TOKEN_FILE)) return null;
  const t = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
  return t.length > 40 ? t : null;
}

/**
 * Runs in the page. Returns the offenders plus the ancestor chain of the worst one.
 *
 * `scrollWidth > innerWidth` on an element whose computed `overflow-x` is `visible` is the shape
 * that pushes the document. An element with `auto`/`scroll` is reported but flagged as fine,
 * because scrolling its own content is exactly what it is for.
 */
const PROBE = () => {
  const vw = window.innerWidth;
  const out = [];

  const describe = (el) => {
    const id = el.id ? `#${el.id}` : '';
    const cls = typeof el.className === 'string' && el.className.trim()
      ? `.${el.className.trim().split(/\s+/).slice(0, 3).join('.')}`
      : '';
    return `${el.tagName.toLowerCase()}${id}${cls}`;
  };

  document.querySelectorAll('*').forEach((el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    const overflowX = cs.overflowX;
    const scrolls = overflowX === 'auto' || overflowX === 'scroll';
    const over = el.scrollWidth - vw;
    if (over > 1) {
      out.push({
        selector: describe(el),
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        overflowPx: over,
        overflowX,
        isScrollContainer: scrolls,
        minWidth: cs.minWidth,
      });
    }
  });

  out.sort((a, b) => b.overflowPx - a.overflowPx);

  // The real culprit is usually an ancestor that will not shrink, so walk up from the worst
  // NON-scroll-container offender and report what each ancestor declares.
  const worst = out.find((o) => !o.isScrollContainer) || out[0];
  const chain = [];
  if (worst) {
    const match = Array.from(document.querySelectorAll('*')).find(
      (el) => describe(el) === worst.selector && el.scrollWidth === worst.scrollWidth,
    );
    let node = match;
    while (node && node !== document.documentElement && chain.length < 12) {
      const cs = getComputedStyle(node);
      chain.push({
        selector: describe(node),
        minWidth: cs.minWidth,
        overflowX: cs.overflowX,
        display: cs.display,
        gridTemplateColumns: cs.gridTemplateColumns,
        scrollWidth: node.scrollWidth,
        clientWidth: node.clientWidth,
      });
      node = node.parentElement;
    }
  }

  return {
    viewportWidth: vw,
    documentScrollWidth: document.documentElement.scrollWidth,
    pageOverflows: document.documentElement.scrollWidth > vw + 1,
    journeyPresent: Boolean(
      Array.from(document.querySelectorAll('h3')).find((h) => /level journey/i.test(h.textContent || '')),
    ),
    offenders: out.slice(0, 12),
    worstAncestorChain: chain,
  };
};

(async () => {
  const widths = parseWidths();
  const token = readToken();

  if (!token) {
    console.error('\nNO USABLE TOKEN.');
    console.error(`  Expected a participant JWT in: ${TOKEN_FILE}`);
    console.error('  Refresh it: open the portal, F12 Console, type `allow pasting`, then');
    console.error('  copy(localStorage.getItem(\'participant_token\')) and paste it into that file.');
    console.error('\n  Refusing to measure. An unauthenticated portal route renders a login page,');
    console.error('  which does not overflow, so a "clean" result here would be a lie.\n');
    process.exit(2);
  }

  const browser = await chromium.launch();
  let signedIn = false;
  const findings = [];

  try {
    for (const width of widths) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 } });
      await ctx.addInitScript((t) => {
        try {
          window.localStorage.setItem('participant_token', t);
        } catch (e) { /* private mode */ }
      }, token);
      const page = await ctx.newPage();

      for (const route of ROUTES) {
        const url = `${BASE}${route.url}`;
        // NOT `networkidle`: the portal holds live connections open, so network idle never
        // arrives and every navigation times out at 60s. Wait for the shell to exist instead,
        // and fall through on timeout so a login page is still measured and reported as one.
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page
          .waitForSelector('.te-shell, form input[type="password"]', { timeout: 20000 })
          .catch(() => undefined);
        await page.waitForTimeout(1500);

        const r = await page.evaluate(PROBE);

        // THE GUARD THAT MATTERS, and the first version of it was wrong.
        //
        // v1 asked "does this look like a login page?" by string-matching the body text. Run with
        // an expired token against production it answered "no", so the script reported
        // "measured 2 combinations, 0 overflowing" and exited 0 - a clean bill of health for a
        // page that had never rendered. The tell was sitting in its own output: "Your level
        // journey present: NO".
        //
        // So the guard is now POSITIVE: the page must contain the thing being measured. An
        // absent marker means the measurement is void, never that the defect is absent. A zero
        // that would be good news has to prove the thing producing it actually ran.
        const shellPresent = await page.evaluate(() => Boolean(document.querySelector('.te-shell')));
        const valid = shellPresent && r.journeyPresent;
        if (valid) signedIn = true;
        findings.push({ width, route: route.name, valid, shellPresent, ...r });

        console.log(`\n${'='.repeat(78)}`);
        console.log(`${route.name} @ ${width}px`
          + `${valid ? '' : '   *** NOT MEASURED: the page did not render ***'}`);
        console.log('='.repeat(78));
        if (!valid) {
          console.log(`  .te-shell present: ${shellPresent ? 'yes' : 'NO'}`);
          console.log(`  "Your level journey" present: ${r.journeyPresent ? 'yes' : 'NO'}`);
          console.log('  Treating this as VOID, not as "no overflow". Most likely an expired token.');
          continue;
        }
        console.log(`  document.scrollWidth ${r.documentScrollWidth} vs viewport ${r.viewportWidth}`
          + `  -> ${r.pageOverflows ? 'PAGE OVERFLOWS' : 'fits'}`);
        console.log(`  "Your level journey" present: ${r.journeyPresent ? 'yes' : 'NO'}`);
        if (!r.offenders.length) {
          console.log('  no element is wider than the viewport');
        } else {
          console.log(`\n  widest offenders:`);
          for (const o of r.offenders) {
            console.log(`    +${String(o.overflowPx).padStart(5)}px  ${o.selector.padEnd(44)}`
              + ` scrollW=${String(o.scrollWidth).padEnd(5)} overflow-x=${o.overflowX}`
              + `${o.isScrollContainer ? '  (scroll container, fine)' : ''}`);
          }
          console.log(`\n  ancestor chain of the worst non-scrolling offender:`);
          for (const a of r.worstAncestorChain) {
            console.log(`    ${a.selector.padEnd(44)} min-width=${String(a.minWidth).padEnd(8)}`
              + ` overflow-x=${String(a.overflowX).padEnd(8)} scrollW=${a.scrollWidth}`
              + (a.gridTemplateColumns && a.gridTemplateColumns !== 'none'
                ? `\n      grid-template-columns: ${a.gridTemplateColumns}` : ''));
          }
        }
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
  }

  if (!signedIn) {
    console.error('\nNOTHING WAS MEASURED. No route rendered both the portal shell and the');
    console.error('level-journey heading, which means the page never loaded as a signed-in user.');
    console.error('The token in scripts/.ali_jwt.txt is almost certainly expired.');
    console.error('\nThis is NOT a clean result. Refresh the token and re-run.\n');
    process.exit(2);
  }

  const measured = findings.filter((f) => f.valid);
  const voided = findings.filter((f) => !f.valid);
  if (voided.length) {
    console.log(`\n  NOTE: ${voided.length} route/width combination(s) did not render and were`
      + ' excluded, so coverage is incomplete:');
    for (const v of voided) console.log(`    ${v.route} @ ${v.width}px`);
  }
  const overflowing = measured.filter((f) => f.pageOverflows);
  console.log(`\n${'='.repeat(78)}\nSUMMARY\n${'='.repeat(78)}`);
  console.log(`  measured ${measured.length} route/width combinations`);
  console.log(`  page overflows horizontally in ${overflowing.length} of them`);
  for (const f of overflowing) {
    const worst = f.offenders.find((o) => !o.isScrollContainer);
    console.log(`    ${f.route} @ ${f.width}px  worst: ${worst ? worst.selector : '(none non-scrolling)'}`);
  }
  console.log(overflowing.length
    ? '\n  Aim the fix at the ancestor chains printed above.'
    : '\n  No horizontal overflow found at these widths. If Ruth still sees it, get her'
      + '\n  viewport width and re-run with --widths <that>.');

  process.exit(0);
})().catch((e) => {
  console.error(`FAILED: ${e && e.message ? e.message : e}`);
  process.exit(1);
});
