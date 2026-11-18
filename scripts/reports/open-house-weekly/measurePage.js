#!/usr/bin/env node
/**
 * C125: measure the ad landing page's own geometry, so recorded clicks and scroll depths can be
 * drawn at the place on the page where they actually happened.
 *
 *   node measurePage.js <out.json> [--url <lp url>] [--width 390] [--height 844]
 *
 * WHY THIS SCRIPT EXISTS. `page_events` records WHAT was clicked (an element label) and HOW FAR
 * someone scrolled (one of five thresholds). It records no coordinate of any kind - verified on
 * production 18 Nov 2026: zero rows in the whole table carry x, y, offset or viewport keys. So a
 * recorded click cannot be placed on the page from the data alone. What CAN be done is to render
 * the page as a visitor's phone renders it and ask each clickable element where it sits; a click
 * on that element is then known to have happened at that depth. That is a measured position for
 * the element, NOT a recorded position for the click, and the report must say so.
 *
 * The page is operator-supplied JSON rendered by backend/src/services/marketing/
 * landingPageRenderer.ts, so its section order and length change whenever the content row is
 * edited. Reading a hardcoded map would therefore go stale silently. This measures the live page.
 *
 * LABELS MATCH THE TRACKER EXACTLY. `frontend/public/v1/track.js` resolves a CTA's identity as
 * `data-track || data-track-cta` and its text as `textContent.trim().slice(0, 120)`. The same two
 * expressions are used here, because the join between a click row and a position is on that
 * label. Changing either side alone silently drops every click to "unplaced".
 *
 * NO VISIT IS RECORDED. Every /api/ call, pixel and analytics host is aborted, the same block
 * list captureShots.js uses, so measuring the page never counts as a visitor in the funnel the
 * report measures.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const LP = 'https://www.refactored.ai/lp/colaberry-training/ai-learning-platform';
// 95% of landing-page visitors since launch are on a phone (359 mobile / 17 desktop / 4 tablet),
// so the phone render is the one whose geometry describes where people actually clicked.
const WIDTH = 390;
const HEIGHT = 844;
const BLOCK = /\/api\/|facebook|fbcdn|google-analytics|googletagmanager|doubleclick|clarity\.ms|hotjar/i;
const ALLOW = /\/api\/v1\/open-house\/event(\?|$)/;

/** Runs inside the page. Returns the page's height, its bands and every clickable element's depth. */
function probe() {
  const doc = document.documentElement;
  const scrollHeight = doc.scrollHeight;
  const clientHeight = doc.clientHeight;
  // The tracker's own number: depth = scrollY / (scrollHeight - clientHeight) * 100. An element's
  // comparable depth is therefore its distance down that same scrollable range, which is why
  // `scrollable` and not `scrollHeight` is the denominator. They differ by one viewport, which on
  // this page is about 10% of its length - enough to put a hero CTA in the wrong band.
  const scrollable = Math.max(1, scrollHeight - clientHeight);
  const topOf = (el) => {
    const r = el.getBoundingClientRect();
    return r.top + window.scrollY;
  };
  const depthOf = (el) => Math.round((topOf(el) / scrollable) * 1000) / 10;
  const text = (el) => (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120);

  const bands = Array.from(document.querySelectorAll('section.band')).map((el, i) => {
    const eyebrow = el.querySelector('.eyebrow, [class*="eyebrow"]');
    const head = el.querySelector('h1, h2, h3');
    const r = el.getBoundingClientRect();
    return {
      index: i,
      type: (Array.from(el.classList).find((c) => c.indexOf('s-') === 0) || '').slice(2) || null,
      eyebrow: eyebrow ? text(eyebrow) : null,
      heading: head ? text(head) : null,
      top_px: Math.round(r.top + window.scrollY),
      height_px: Math.round(r.height),
      depth_from: depthOf(el),
      depth_to: Math.round(((topOf(el) + r.height) / scrollable) * 1000) / 10,
    };
  });

  // The tracker's two selector groups, in its own order of precedence.
  const CTA = '.btn-primary, .btn-secondary, .btn-outline-primary, .cta, [data-track-cta], [data-track]';
  const INTERACTIVE = 'a[href], button, [role="button"]';
  const seen = new Set();
  const targets = [];
  for (const [kind, sel] of [['cta_click', CTA], ['click', INTERACTIVE]]) {
    for (const el of Array.from(document.querySelectorAll(sel))) {
      if (seen.has(el)) continue;
      seen.add(el);
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue; // never rendered, so never clickable
      const anchor = el.tagName === 'A' ? el : el.closest('a');
      // STICKY MATTERS MORE THAN POSITION DOES. An element inside a sticky or fixed ancestor is
      // on screen at EVERY scroll depth, so a click on it says nothing about how far the person
      // read. The landing page's header is `position: sticky` and holds a copy of the main CTA,
      // which is why a click on "Save my seat" cannot be read as "they got to the hero".
      // Without this flag the heat map would place those clicks at the top of the page and imply
      // the opposite of what is true.
      let sticky = false;
      for (let a = el; a && a !== document.body; a = a.parentElement) {
        const p = getComputedStyle(a).position;
        if (p === 'sticky' || p === 'fixed') { sticky = true; break; }
      }
      targets.push({
        event_type: kind,
        data_track: el.getAttribute('data-track') || el.getAttribute('data-track-cta') || null,
        element_text: text(el),
        element_tag: (el.tagName || '').toLowerCase(),
        href: (el.getAttribute && el.getAttribute('href')) || (anchor && anchor.getAttribute('href')) || null,
        depth: depthOf(el),
        top_px: Math.round(r.top + window.scrollY),
        sticky,
      });
    }
  }
  return { scrollHeight, clientHeight, scrollable, bands, targets, title: document.title };
}

(async () => {
  const out = process.argv[2];
  if (!out) { console.error('usage: node measurePage.js <out.json> [--url u] [--width n] [--height n]'); process.exit(2); }
  const arg = (f, d) => { const i = process.argv.indexOf(f); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
  const url = arg('--url', LP);
  const width = Number(arg('--width', WIDTH));
  const height = Number(arg('--height', HEIGHT));

  // Repo root is three levels up when this file sits in scripts/reports/open-house-weekly/.
  // REPO_ROOT overrides it, which is what lets the script be run from a scratch copy.
  const root = process.env.REPO_ROOT || path.join(__dirname, '..', '..', '..');
  const { chromium } = require(path.join(root, 'node_modules', 'playwright'));
  // THREE LAUNCH OPTIONS, TRIED IN ORDER, because the two machines this runs on disagree about
  // which browser exists. The prod host has Playwright's own cached Chromium and no Edge; the
  // Windows dev machine has Edge and application control that BLOCKS the bundled Chromium. One
  // hardcoded choice therefore fails on one of the two, and it fails at the browser launch,
  // which reads like the page is unreachable rather than like the browser is missing.
  const options = [
    ...(process.env.ARTIFACT_CHROMIUM ? [{ executablePath: process.env.ARTIFACT_CHROMIUM }] : []),
    {},                      // Playwright's bundled Chromium (the prod host)
    { channel: 'msedge' },   // an installed Edge (the dev machine)
  ];
  let browser = null;
  const tried = [];
  for (const o of options) {
    try { browser = await chromium.launch(o); break; } catch (e) { tried.push(`${JSON.stringify(o)}: ${e.message.split('\n')[0]}`); }
  }
  if (!browser) throw new Error(`no browser could be launched. Tried:\n  ${tried.join('\n  ')}`);
  try {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route('**/*', (r) => {
      const u = r.request().url();
      return BLOCK.test(u) && !(ALLOW.test(u) && r.request().method() === 'GET') ? r.abort() : r.continue();
    });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => page.waitForTimeout(3000));
    await page.waitForTimeout(1500);
    // Scroll the whole page once so anything lazy or animated into place has its final geometry.
    await page.evaluate(async () => {
      const step = window.innerHeight;
      for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
      window.scrollTo(0, 0);
      await new Promise((r) => setTimeout(r, 300));
    });
    const m = await page.evaluate(probe);
    m.measured_at = new Date().toISOString();
    m.url = url;
    m.viewport = { width, height };
    fs.writeFileSync(out, JSON.stringify(m, null, 2));
    console.log(`MEASURED ${url}`);
    console.log(`  page ${m.scrollHeight}px tall, viewport ${width}x${height}, scrollable ${m.scrollable}px (${(m.scrollHeight / height).toFixed(1)} screens)`);
    console.log(`  ${m.bands.length} bands, ${m.targets.length} clickable elements`);
    for (const b of m.bands) console.log(`   band ${String(b.index).padStart(2)}  ${String(b.depth_from).padStart(5)}% - ${String(b.depth_to).padStart(5)}%  ${b.type || '?'}  ${(b.eyebrow ? b.eyebrow + ' / ' : '') + (b.heading || '')}`.slice(0, 150));
    for (const t of m.targets) console.log(`   target  ${String(t.top_px).padStart(5)}px ${String(t.depth).padStart(6)}%  [${t.event_type}]${t.sticky ? ' STICKY' : '       '} ${t.data_track || '(none)'} :: ${t.element_text.slice(0, 44)}`);
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error('ERR', (e && e.message ? e.message : e).toString().slice(0, 400)); process.exit(1); });
