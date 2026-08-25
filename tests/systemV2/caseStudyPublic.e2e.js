/**
 * caseStudyPublic.e2e.js — browser proof for the public Case Study surface
 * (`/stories` and `/stories/:slug`). Spec §42, plan T022 AC3, AC4b, AC6.
 *
 * SHAPE. Raw Playwright driven by `node`, exactly like the four scripts that
 * already live in this directory. There is no `@playwright/test` in this repo,
 * no `playwright.config.*`, and adding either would mean these files could not
 * be executed the way every other script here is. The module is resolved the
 * way `v2-page-health.js` resolves it:
 *
 *     PW_PATH=playwright node tests/systemV2/caseStudyPublic.e2e.js
 *
 * `PW_PATH` is the *module specifier* passed to `require`. `playwright` is a
 * dependency of the ROOT package.json (^1.58.2) and is hoisted to
 * `<repo>/node_modules/playwright`, so the bare specifier resolves from this
 * file. An absolute path to that directory works too. The fallback below means
 * the script still runs if the variable is unset — a missing env var must not
 * look like a product failure.
 *
 * BOTH WAYS, ALWAYS. Every public route is visited by direct load AND by
 * client-side navigation. `v2-page-health.js`'s header records why: the V2
 * reveal bug only appeared on client-side navigation, and a direct-load-only
 * check missed it completely.
 *
 * IT MUST BE ABLE TO FAIL. A browser check that goes green against a dead
 * server is worse than no check. So:
 *   - a reachability preflight runs first and is itself a scored check;
 *   - a failed `page.goto` is caught, recorded as a failed check, and the
 *     probe still runs, so every DOM assertion for that route goes red too
 *     rather than the run aborting on one stack trace;
 *   - nothing is counted as a pass unless the assertion actually evaluated.
 * Prove it any time with:
 *     BASE_URL=http://localhost:59999 API_URL=http://localhost:59998 \
 *       PW_PATH=playwright node tests/systemV2/caseStudyPublic.e2e.js
 *   -> "cannot reach", every check red, exit 1.
 *
 * DATA-DEPENDENT CHECKS ARE NEVER SILENTLY SKIPPED. Cards, badges, filters and
 * the detail route need at least one published record. When the API reports
 * zero, those checks are reported as SKIPPED with the reason and the run ends
 * FAIL-INCOMPLETE, never PASS — an empty library must not be able to make this
 * script look successful.
 *
 * Usage:
 *   PW_PATH=playwright node tests/systemV2/caseStudyPublic.e2e.js
 *   BASE_URL=http://localhost:3000 API_URL=http://localhost:3101 ... (defaults)
 *   SHOT_DIR=<dir>   where screenshots land
 * Exit 0 = every check passed and none were skipped. Exit 1 otherwise.
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require(process.env.PW_PATH || 'playwright');
const { safeScreenshot, writeCaptureSummary } = require('../../scripts/captureHelpers');

const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const API = (process.env.API_URL || 'http://localhost:3101').replace(/\/$/, '');
const SHOT_DIR = process.env.SHOT_DIR
  || path.resolve(__dirname, '../../.loop-architect/runs/20260822-casestudy-os/t022/screenshots');

/**
 * An optional query applied to BOTH the API read and the `/stories` page, so the
 * suite measures one index rather than two.
 *
 * Why it exists: the enterprise surface's default filter is
 * `verificationClass: ['verified','anonymized']` (spec §14), so a published
 * record whose proof is repository-only is `illustrative` and never appears on
 * the default index — leaving cards, badges, facets, URL filter state and card
 * navigation with no record to exercise. Spec §14 also says such a record stays
 * reachable by an explicit `?verification=illustrative`, which is a real public
 * URL, so running the suite a second time with
 * `INDEX_QUERY=verification=illustrative` proves those controls against a real
 * record instead of skipping them. It never invents a verified claim.
 */
const rawQuery = (process.env.INDEX_QUERY || '').replace(/^\?/, '');
const INDEX_QUERY = rawQuery ? `?${rawQuery}` : '';

const DESKTOP = { width: 1440, height: 1000 };
const MOBILE = { width: 390, height: 844 };
const NARROW = { width: 320, height: 800 };

/* ------------------------------------------------------------- scoring --- */

let failures = 0;
let skipped = 0;
const shots = [];

function pass(name, detail) {
  console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`);
}
function fail(name, detail) {
  console.error(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`);
  failures += 1;
}
function check(name, ok, detail) {
  if (ok) pass(name, detail);
  else fail(name, detail);
  return Boolean(ok);
}
function skip(name, reason) {
  console.error(`  SKIP  ${name} — ${reason}`);
  skipped += 1;
}
function section(title) {
  console.log(`\n== ${title}`);
}

/**
 * EVERY assertion about a page goes through here, and NONE of them may be
 * evaluated unless the app actually rendered.
 *
 * This exists because the first dead-port run of this script produced nine
 * GREEN checks against `about:blank`: "no broken images (0 broken)", "no
 * horizontal overflow (320 vs 320)", "no console errors", "every .cbv2-rv
 * revealed (0 hidden)". Every one of those is an ABSENCE assertion, and an
 * absence assertion is trivially true of a page that does not exist — so each
 * was a check that could not fail, which is worth less than no check at all.
 * `d.loaded` is the guard: no React root with children means the page never
 * rendered, and every assertion about it is a FAILURE, never a pass.
 */
function checkOn(d, name, ok, detail) {
  if (!d || !d.loaded) return fail(name, 'the page never rendered, so this assertion is not evaluated');
  return check(name, ok, detail);
}

/* ------------------------------------------------------------- preflight --- */

async function reachable(label, url) {
  try {
    const res = await fetch(url, { redirect: 'manual' });
    return { ok: res.status < 500, status: res.status };
  } catch (err) {
    return { ok: false, status: 0, error: `cannot reach ${url} (${err && err.message ? err.message : err})`, label };
  }
}

/* ---------------------------------------------------------------- probe --- */

/**
 * The DOM facts this site actually fails on, plus the Case Study specifics
 * spec §42 names. Deliberately one `page.evaluate` so the numbers describe one
 * moment rather than a sequence of them.
 */
async function probe(page) {
  /**
   * SETTLE, DON'T GUESS. This used to be a flat `waitForTimeout(2500)`, and on a
   * loaded machine that was enough at one viewport and not at the next: the same
   * URL reported 1 card at 1440px and 0 cards at 390px, which reads as a
   * responsive-layout defect and is really a stopwatch. Wait for the page's own
   * loading state to clear instead, and let a genuine hang fail the checks below
   * rather than throw here.
   */
  try {
    await page.waitForFunction(() => {
      const root = document.getElementById('root');
      if (!root || root.children.length === 0) return false;
      return !document.querySelector('[data-testid="stories-loading"], [data-testid="story-loading"]');
    }, { timeout: 20000 });
  } catch (_e) { /* reported by the assertions, never swallowed into a pass */ }
  await page.waitForTimeout(600);
  return page.evaluate(() => {
    const q = (sel) => Array.from(document.querySelectorAll(sel));
    const rv = q('.cbv2-rv');
    const main = document.querySelector('main');
    const sections = q('main section');
    const el = (sel) => document.querySelector(sel);
    const text = (sel) => { const n = el(sel); return n ? (n.textContent || '').trim() : null; };
    const count = document.querySelector('[data-testid="stories-result-count"]');
    const root = document.getElementById('root');
    return {
      // The single precondition every other fact here is worthless without.
      loaded: Boolean(root && root.children.length > 0 && (document.body.innerText || '').trim().length > 0),
      url: window.location.pathname + window.location.search,
      h1: Boolean(el('h1')),
      h1Text: text('h1'),
      sections: sections.length,
      rvHidden: rv.filter((e) => parseFloat(getComputedStyle(e).opacity) < 0.99).length,
      belowHeroPx: Math.round(sections.slice(1).reduce((a, s) => a + s.getBoundingClientRect().height, 0)),
      textLen: ((main && main.innerText) || '').replace(/\s+/g, ' ').trim().length,
      imgsBroken: Array.from(document.images).filter((i) => i.complete && i.naturalWidth === 0).length,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      navLinks: q('header a[href]').length,
      // index specifics
      ledgerItems: q('[data-ledger-field]').length,
      filterGroups: q('.cbv2-cs-filters__group').length,
      filterInputs: q('.cbv2-cs-filters__options input[type="checkbox"]').length,
      cards: q('[data-case-study]').length,
      cardLinks: q('[data-case-study] a[href]').length,
      badges: q('[class*="cbv2-cs-verify"]').length,
      countText: count ? (count.textContent || '').trim() : null,
      countLive: count ? count.getAttribute('aria-live') : null,
      loadingShown: Boolean(el('[data-testid="stories-loading"], [data-testid="story-loading"]')),
      failureShown: Boolean(el('[data-testid="stories-failure"], [data-testid="story-failure"]')),
      emptyKind: el('[data-testid="stories-empty"]') ? el('[data-testid="stories-empty"]').getAttribute('data-empty') : null,
      emptyText: text('[data-testid="stories-empty"]'),
      clearFilters: Boolean(el('[data-testid="stories-clear-filters"]')),
      // detail specifics
      storySections: q('[id^="cbv2-story-"]').length,
      hasCta: Boolean(el('.cbv2-cs-cta, [class*="cbv2-cs-cta"]')),
      /**
       * The ledger's rendered contrast, MEASURED.
       *
       * The DOM probe above passed the zero-data index while the desktop
       * screenshot showed the four ledger tiles almost unreadable, because
       * "element exists" and "a person can read it" are different questions and
       * only the first was being asked. `storiesV2.css` inverts the ledger type
       * for the dark masthead; this reports what the browser actually computed
       * so a broken inversion is a number rather than an opinion about a PNG.
       */
      ledgerContrast: (() => {
        const parse = (c) => {
          const m = String(c).match(/rgba?\(([^)]+)\)/);
          if (!m) return null;
          const p = m[1].split(',').map((v) => parseFloat(v));
          return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
        };
        const lum = (c) => {
          const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
          return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
        };
        // Walk up for the first opaque background, the way a reader's eye does.
        const bgOf = (node) => {
          let el = node;
          while (el) {
            const c = parse(getComputedStyle(el).backgroundColor);
            if (c && c.a >= 0.99) return c;
            el = el.parentElement;
          }
          return { r: 255, g: 255, b: 255, a: 1 };
        };
        const item = document.querySelector('.cbv2-cs-ledger__value');
        if (!item) return null;
        const fg = parse(getComputedStyle(item).color);
        if (!fg) return null;
        const bg = bgOf(item);
        const l1 = lum(fg); const l2 = lum(bg);
        const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        return {
          ratio: Math.round(ratio * 100) / 100,
          color: getComputedStyle(item).color,
          background: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`,
        };
      })(),
      // one-column check for mobile: are result cards stacked?
      cardColumns: (() => {
        const items = q('.cbv2-stories__result');
        if (items.length < 2) return items.length;
        const tops = new Set(items.map((i) => Math.round(i.getBoundingClientRect().top)));
        return items.length / tops.size;
      })(),
    };
  });
}

/**
 * Navigate and probe. A navigation failure is a recorded failure, and the probe
 * still runs against whatever the page is, so the DOM checks for this route go
 * red instead of the script dying on the first dead port.
 */
async function visit(page, label, url) {
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
    pass(`nav ${label}`, url.replace(BASE, '') || '/');
  } catch (err) {
    fail(`nav ${label}`, `cannot reach ${url} (${err && err.message ? String(err.message).split('\n')[0] : err})`);
  }
  return probe(page);
}

/** The shared page-health assertions, applied to any route at any viewport. */
function assertPageHealth(prefix, d, errs) {
  checkOn(d, `${prefix}: the app rendered`, d.loaded, `${d.textLen} chars of text`);
  checkOn(d, `${prefix}: has an h1`, d.h1, d.h1Text ? `"${String(d.h1Text).slice(0, 60)}"` : 'none');
  checkOn(d, `${prefix}: every .cbv2-rv element revealed`, d.rvHidden === 0, `${d.rvHidden} still hidden`);
  checkOn(d, `${prefix}: no broken images`, d.imgsBroken === 0, `${d.imgsBroken} broken`);
  checkOn(d, `${prefix}: no horizontal overflow`, !d.overflow, `scrollWidth ${d.scrollWidth} vs clientWidth ${d.clientWidth}`);
  checkOn(d, `${prefix}: content below the hero`, d.belowHeroPx >= 200, `${d.belowHeroPx}px`);
  checkOn(d, `${prefix}: no console/page errors`, errs.length === 0, errs.slice(0, 3).join(' | '));
}

/* ----------------------------------------------------------------- main --- */

(async () => {
  console.log(`caseStudyPublic.e2e.js\n  BASE=${BASE}\n  API=${API}\n  SHOT_DIR=${SHOT_DIR}`);
  fs.mkdirSync(SHOT_DIR, { recursive: true });

  section('preflight — the run is worthless if these are green against nothing');
  const feReach = await reachable('frontend', BASE + '/');
  check('frontend reachable', feReach.ok, feReach.error || `HTTP ${feReach.status}`);
  const apiReach = await reachable('api', `${API}/api/public/case-studies${INDEX_QUERY}`);
  check('public case-study API reachable', apiReach.ok, apiReach.error || `HTTP ${apiReach.status}`);

  let published = null;
  let slug = null;
  if (apiReach.ok) {
    try {
      // No `limit` — the schema REJECTS anything above MAX_PAGE_SIZE (48) rather
      // than clamping, so asking for 50 returns a 400 whose body has no `total`
      // and the whole run misreads it as "the API never answered". That was a
      // real defect in this harness, found by its own first live run.
      const res = await fetch(`${API}/api/public/case-studies${INDEX_QUERY}`);
      const body = await res.json();
      published = res.status === 200 && body && typeof body.total === 'number' ? body : null;
      slug = published && published.items && published.items[0] ? published.items[0].slug : null;
      check('API returns a case-study index payload', Boolean(published),
        published ? `total=${published.total}` : `HTTP ${res.status}, body had no total field`);

      /**
       * THE INDEX AND ITS OWN LEDGER CAN DISAGREE, and the difference is real.
       * `ledger` counts every publicly visible record; `items`/`total` also apply
       * the surface's DEFAULT filter, which for `enterprise` is
       * `verificationClass: ['verified','anonymized']` (spec §14 hides `pending`
       * and `illustrative`). So a published-but-unverified record makes the page
       * say "1 project" beside "no published projects to show". Reported, and
       * the empty state it produces is asserted below rather than assumed.
       */
      if (published && published.total === 0 && published.ledger && published.ledger.projects > 0) {
        console.log(`  note  the index ledger counts ${published.ledger.projects} published record(s) `
          + 'that the default verification filter excludes from the list');
      }
      // A record can be published, served at its own URL, and still absent from
      // the default index. Pass STORY_SLUG to exercise the detail route for one.
      if (!slug && process.env.STORY_SLUG) slug = process.env.STORY_SLUG;
    } catch (err) {
      fail('API returns a case-study index payload', String(err && err.message));
    }
  } else {
    fail('API returns a case-study index payload', 'API unreachable');
  }

  const browser = await chromium.launch();

  async function newPage(viewport) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push('JS: ' + String(e).slice(0, 120)));
    page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text().slice(0, 120)); });
    page.on('response', (r) => {
      if (r.status() >= 400 && !r.url().includes('gstatic') && !r.url().includes('favicon')) {
        errs.push(r.status() + ' ' + r.url().slice(0, 80));
      }
    });
    return { ctx, page, errs, reset: () => { errs.length = 0; } };
  }

  async function shot(page, name, viewport) {
    const out = path.join(SHOT_DIR, name);
    try {
      const r = await safeScreenshot(page, out, { fullPage: true });
      shots.push({ file: name, viewport: `${viewport.width}x${viewport.height}`, originalWidth: r.originalWidth, finalWidth: r.finalWidth, downscaled: r.downscaled });
      console.log(`  shot  ${out}`);
    } catch (err) {
      fail(`screenshot ${name}`, String(err && err.message));
    }
  }

  /* ------------------------------------------------ desktop, direct load --- */
  section(`desktop ${DESKTOP.width}x${DESKTOP.height} — /stories, direct load`);
  const desk = await newPage(DESKTOP);
  let d = await visit(desk.page, '/stories (direct)', BASE + '/stories' + INDEX_QUERY);
  assertPageHealth('/stories desktop', d, desk.errs);
  checkOn(d, '/stories desktop: site nav rendered', d.navLinks >= 3, `${d.navLinks} header links`);
  checkOn(d, '/stories desktop: masthead h1 present', d.h1, d.h1Text || 'none');
  checkOn(d, '/stories desktop: result count is an aria-live=polite region', d.countLive === 'polite',
    `aria-live=${d.countLive}`);
  checkOn(d, '/stories desktop: not stuck in the loading state', !d.loadingShown);
  checkOn(d, '/stories desktop: not in the failure state', !d.failureShown);
  // 3:1 is WCAG 2.1 AA for large text; the ledger figure is display-size type.
  checkOn(d, '/stories desktop: ledger figures are legible on the dark masthead',
    Boolean(d.ledgerContrast) && d.ledgerContrast.ratio >= 3,
    d.ledgerContrast
      ? `contrast ${d.ledgerContrast.ratio}:1 (${d.ledgerContrast.color} on ${d.ledgerContrast.background})`
      : 'no ledger figure found to measure');
  await shot(desk.page, 'stories-desktop-1440x1000.png', DESKTOP);

  const total = published ? published.total : 0;
  if (published && total > 0) {
    checkOn(d, '/stories desktop: ledger rendered', d.ledgerItems > 0, `${d.ledgerItems} ledger fields`);
    checkOn(d, '/stories desktop: filter groups rendered', d.filterGroups > 0, `${d.filterGroups} groups, ${d.filterInputs} options`);
    // The page asks for the API's default page size (12); a card per record on
    // the first page, never more and never a silently truncated list.
    checkOn(d, '/stories desktop: a card per published record on the first page',
      d.cards === Math.min(total, 12), `${d.cards} cards vs API total ${total}`);
    checkOn(d, '/stories desktop: verification badges rendered', d.badges > 0, `${d.badges} badges`);
    checkOn(d, '/stories desktop: no empty state while records exist', d.emptyKind === null, `data-empty=${d.emptyKind}`);
  } else if (published) {
    checkOn(d, '/stories desktop: truthful zero-data empty state', d.emptyKind === 'library',
      `data-empty=${d.emptyKind} text="${String(d.emptyText || '').slice(0, 80)}"`);
    checkOn(d, '/stories desktop: ledger still rendered at zero', d.ledgerItems > 0, `${d.ledgerItems} ledger fields`);
    skip('/stories desktop: cards, badges and filter facets', 'zero published records in this database');
    skip('/stories: filter URL state and card navigation', 'zero published records in this database');
  } else {
    // No API answer at all: nothing about the index is known, so nothing is claimed.
    fail('/stories desktop: index content', 'the API never answered, so no content assertion was evaluated');
    skip('/stories: filter URL state and card navigation', 'the API never answered');
  }

  /* -------------------------------------------------- filter + URL state --- */
  if (total > 0 && d.filterInputs > 0) {
    section('filters — the URL is the only place filter state lives');
    desk.reset();
    const box = desk.page.locator('.cbv2-cs-filters__options input[type="checkbox"]').first();
    await box.check().catch(() => {});
    await desk.page.waitForTimeout(1200);
    const filteredUrl = desk.page.url();
    check('filter click writes the facet into the URL', filteredUrl.includes('?'), filteredUrl.replace(BASE, ''));
    check('a clear-filters control appears once a facet is active',
      await desk.page.locator('[data-testid="stories-clear-filters"]').count() > 0);
    await desk.page.reload({ waitUntil: 'networkidle' });
    await desk.page.waitForTimeout(1200);
    check('filter state survives a reload', desk.page.url() === filteredUrl,
      `${desk.page.url().replace(BASE, '')} vs ${filteredUrl.replace(BASE, '')}`);
    await desk.page.goBack({ waitUntil: 'networkidle' }).catch(() => {});
    await desk.page.waitForTimeout(800);
    // Back to where this section STARTED, which is `/stories` plus whatever
    // INDEX_QUERY the run was given — not necessarily a bare path.
    check('back removes the facet again', desk.page.url() === `${BASE}/stories${INDEX_QUERY}`,
      `${desk.page.url().replace(BASE, '')} (expected /stories${INDEX_QUERY})`);
  } else if (total > 0) {
    // Never let this block vanish silently. Records exist but the server's
    // taxonomy offered no facet to click, which is itself worth reporting.
    skip('filters: URL state, reload and back',
      `${d.filterInputs} filter options were offered for ${total} published record(s)`);
  }

  /* ------------------------------------------ card navigation (client-side) --- */
  if (total > 0) {
    section('client-side navigation — the mode that hid the reveal bug');
    desk.reset();
    await desk.page.goto(BASE + '/stories' + INDEX_QUERY, { waitUntil: 'networkidle' }).catch(() => {});
    await desk.page.waitForTimeout(1500);
    const link = desk.page.locator('[data-case-study] a[href]').first();
    if (await link.count()) {
      await link.click().catch(() => {});
      await desk.page.waitForTimeout(1800);
      const after = await probe(desk.page);
      checkOn(after, 'card click navigates to /stories/:slug', /^\/stories\/[^/]+$/.test(after.url.split('?')[0]), after.url);
      assertPageHealth('/stories/:slug via card click', after, desk.errs);
      checkOn(after, '/stories/:slug via card click: story sections rendered', after.storySections > 0,
        `${after.storySections} sections`);
    } else {
      fail('card click navigates to /stories/:slug', 'no card link found although the API reported records');
    }
  }

  /* ------------------------------- footer link -> /stories (client-side) --- */
  section('client-side navigation — footer link into /stories');
  desk.reset();
  await desk.page.goto(BASE + '/', { waitUntil: 'networkidle' }).catch((e) => fail('nav / (direct)', String(e.message).split('\n')[0]));
  await desk.page.waitForTimeout(1200);
  const footerLink = desk.page.locator('footer a[href="/stories"]').first();
  if (await footerLink.count()) {
    await footerLink.click().catch(() => {});
    await desk.page.waitForTimeout(1800);
    const viaFooter = await probe(desk.page);
    checkOn(viaFooter, 'footer "Builder stories" reaches /stories client-side',
      viaFooter.url.startsWith('/stories'), viaFooter.url);
    assertPageHealth('/stories via footer click', viaFooter, desk.errs);
  } else {
    fail('footer "Builder stories" reaches /stories client-side', 'no footer link to /stories found');
  }

  /* --------------------------------------------- detail route, direct load --- */
  section('desktop — /stories/:slug, direct load');
  if (slug) {
    desk.reset();
    const det = await visit(desk.page, '/stories/:slug (direct)', `${BASE}/stories/${slug}`);
    assertPageHealth('/stories/:slug desktop', det, desk.errs);
    checkOn(det, '/stories/:slug desktop: sections rendered', det.storySections > 0, `${det.storySections} sections`);
    checkOn(det, '/stories/:slug desktop: enterprise CTA rendered', det.hasCta);
    checkOn(det, '/stories/:slug desktop: not in the failure state', !det.failureShown);
    await shot(desk.page, 'story-detail-desktop-1440x1000.png', DESKTOP);
  } else {
    skip('/stories/:slug desktop', 'no published record to open — the detail route cannot be exercised');
  }

  /* ------------------------------------------------------ unknown slug 404 --- */
  section('unknown slug — a miss is a treatment, not a crash');
  desk.reset();
  const miss = await visit(desk.page, '/stories/<unknown>', `${BASE}/stories/not-a-real-case-study-${Date.now()}`);
  checkOn(miss, 'unknown slug: renders an h1 rather than a blank page', miss.h1, miss.h1Text || 'none');
  checkOn(miss, 'unknown slug: no page crash', miss.textLen > 40, `${miss.textLen} chars of text`);
  checkOn(miss, 'unknown slug: no uncaught JS error',
    desk.errs.filter((e) => e.startsWith('JS:')).length === 0, desk.errs.slice(0, 2).join(' | '));

  await desk.ctx.close();

  /* ------------------------------------------------------------- mobile --- */
  section(`mobile ${MOBILE.width}x${MOBILE.height}`);
  const mob = await newPage(MOBILE);
  const mIndex = await visit(mob.page, '/stories (mobile)', BASE + '/stories' + INDEX_QUERY);
  assertPageHealth('/stories mobile', mIndex, mob.errs);
  if (total > 0) {
    checkOn(mIndex, '/stories mobile: filters reachable', mIndex.filterGroups > 0,
      `${mIndex.filterGroups} filter groups`);
    checkOn(mIndex, '/stories mobile: cards stack one per row',
      mIndex.cards > 0 && mIndex.cardColumns <= 1, `${mIndex.cards} cards, ${mIndex.cardColumns} per row`);
  } else {
    skip('/stories mobile: filters and one-column cards',
      published ? 'zero published records in this database' : 'the API never answered');
  }
  await shot(mob.page, 'stories-mobile-390x844.png', MOBILE);

  if (slug) {
    mob.reset();
    const mDet = await visit(mob.page, '/stories/:slug (mobile)', `${BASE}/stories/${slug}`);
    assertPageHealth('/stories/:slug mobile', mDet, mob.errs);
    checkOn(mDet, '/stories/:slug mobile: CTA reachable', mDet.hasCta);
    await shot(mob.page, 'story-detail-mobile-390x844.png', MOBILE);
  } else {
    skip('/stories/:slug mobile', 'no published record to open');
  }
  await mob.ctx.close();

  /* ------------------------------------------------- 320px overflow pass --- */
  section(`narrow ${NARROW.width}px — T017 AC7 overflow criterion`);
  const nar = await newPage(NARROW);
  const nIndex = await visit(nar.page, '/stories (320px)', BASE + '/stories' + INDEX_QUERY);
  checkOn(nIndex, '/stories at 320px: scrollWidth <= clientWidth', nIndex.scrollWidth <= nIndex.clientWidth,
    `${nIndex.scrollWidth} vs ${nIndex.clientWidth}`);
  await shot(nar.page, 'stories-narrow-320.png', NARROW);
  if (slug) {
    const nDet = await visit(nar.page, '/stories/:slug (320px)', `${BASE}/stories/${slug}`);
    checkOn(nDet, '/stories/:slug at 320px: scrollWidth <= clientWidth', nDet.scrollWidth <= nDet.clientWidth,
      `${nDet.scrollWidth} vs ${nDet.clientWidth}`);
    await shot(nar.page, 'story-detail-narrow-320.png', NARROW);
  } else {
    skip('/stories/:slug at 320px', 'no published record to open');
  }
  await nar.ctx.close();

  await browser.close();

  if (shots.length) writeCaptureSummary(SHOT_DIR, shots);

  console.log(`\nfailures: ${failures}`);
  console.log(`skipped:  ${skipped}`);
  const verdict = failures === 0 && skipped === 0 ? 'PASS'
    : failures > 0 ? 'FAIL' : 'FAIL-INCOMPLETE (checks were skipped; nothing here proves them)';
  console.log(`verdict:  ${verdict}`);
  process.exit(failures === 0 && skipped === 0 ? 0 : 1);
})().catch((err) => {
  console.error('\nFATAL — the harness itself failed, which is not a pass:', err && err.stack ? err.stack : err);
  process.exit(1);
});
