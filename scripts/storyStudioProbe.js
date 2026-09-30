/**
 * storyStudioProbe.js — the instrumentation half of the Story Studio
 * production walkthrough.
 *
 * WHY THIS IS IN `scripts/` AND NOT `tests/systemV2/`.
 * `tests/CLAUDE.md` carries a hard rule: "Tests must NEVER touch production."
 * This walkthrough deliberately drives the live enterprise.colaberry.ai admin
 * surface, so it is not a test and must not sit in the test tree. It is an
 * operator capture script, which is exactly what `scripts/` is for and where
 * `captureProductionScreenshots.js` already establishes the pattern. It is run
 * the same way the `.e2e.js` scripts are run — raw Playwright under `node`,
 * with `PW_PATH` honoured — so the shape is familiar even though the location
 * is different.
 *
 * IT MUST BE ABLE TO FAIL. Every absence-style assertion in the runner is
 * gated on `appLoaded()`. A prior dead-port run of a sibling script produced
 * nine green checks against `about:blank` — "no broken images", "no console
 * errors" — because an absence assertion is trivially true of a page that does
 * not exist. Preflight is a scored gate: if the origin is unreachable, or the
 * admin API does not reject an anonymous caller, or the token is not accepted,
 * the run stops before the browser opens.
 *
 * THE TOKEN IS NEVER PRINTED. Not at any log level, not in an error, not in
 * the findings JSON. It is read from `STORY_STUDIO_TOKEN`, or from the file
 * named by `STORY_STUDIO_TOKEN_FILE`, and only its length is ever reported.
 */
const fs = require('fs');
const path = require('path');
const { safeScreenshot } = require('./captureHelpers');

/* ------------------------------------------------------------------ token --- */

function readToken() {
  if (process.env.STORY_STUDIO_TOKEN) return process.env.STORY_STUDIO_TOKEN.trim();
  const file = process.env.STORY_STUDIO_TOKEN_FILE;
  if (file && fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  return null;
}

/* --------------------------------------------------------------- recorder --- */

/**
 * Collects per-tab verdicts. A check is PASS, FAIL or SKIP and nothing else —
 * there is no "probably" state, because a walkthrough that reports ambiguity
 * as success is worse than one that reports nothing.
 */
class Recorder {
  constructor() {
    this.tabs = [];
    this.current = null;
    this.failures = 0;
    this.skips = 0;
  }

  tab(key, label) {
    this.current = { key, label, checks: [], notes: [], shots: [], diagnostics: null };
    this.tabs.push(this.current);
    console.log(`\n=== ${label}`);
    return this.current;
  }

  check(name, ok, detail) {
    const entry = { name, verdict: ok ? 'PASS' : 'FAIL', detail: detail || '' };
    if (!ok) this.failures += 1;
    (this.current ? this.current.checks : []).push(entry);
    console.log(`  ${entry.verdict}  ${name}${detail ? ' — ' + detail : ''}`);
    return Boolean(ok);
  }

  skip(name, why) {
    this.skips += 1;
    (this.current ? this.current.checks : []).push({ name, verdict: 'SKIP', detail: why });
    console.log(`  SKIP  ${name} — ${why}`);
  }

  /** An observation that is not a pass/fail: an empty state, a confusion, a gap. */
  note(kind, text) {
    (this.current ? this.current.notes : []).push({ kind, text });
    console.log(`  note  [${kind}] ${text}`);
  }
}

/* ------------------------------------------------------------ diagnostics --- */

/**
 * Console errors are findings, so they are collected per page and attributed to
 * whichever tab was open when they fired. 4xx and 5xx are kept apart: a 404 on
 * an optional sub-resource is a different fact from a 500 in a handler.
 */
function attachDiagnostics(page) {
  const bucket = { pageErrors: [], consoleErrors: [], consoleWarnings: [], http4xx: [], http5xx: [], requestFailures: [] };
  page.on('pageerror', (err) => {
    bucket.pageErrors.push(String((err && err.message) || err).slice(0, 300));
  });
  page.on('console', (msg) => {
    const line = `${msg.text()}`.slice(0, 300);
    if (msg.type() === 'error') bucket.consoleErrors.push(line);
    else if (msg.type() === 'warning') bucket.consoleWarnings.push(line);
  });
  page.on('requestfailed', (req) => {
    const failure = req.failure();
    bucket.requestFailures.push(`${req.method()} ${req.url().slice(0, 160)} — ${failure ? failure.errorText : 'unknown'}`);
  });
  page.on('response', (res) => {
    const status = res.status();
    if (status < 400) return;
    const line = `${status} ${res.request().method()} ${res.url().slice(0, 160)}`;
    if (status >= 500) bucket.http5xx.push(line);
    else bucket.http4xx.push(line);
  });
  return bucket;
}

/** Snapshot the diagnostics accumulated so far and clear them for the next tab. */
function drainDiagnostics(bucket) {
  const out = JSON.parse(JSON.stringify(bucket));
  for (const key of Object.keys(bucket)) bucket[key].length = 0;
  return out;
}

/* -------------------------------------------------------------- navigation --- */

async function newAdminPage(browser, token, viewport) {
  const ctx = await browser.newContext({
    viewport, deviceScaleFactor: 1, ignoreHTTPSErrors: false,
  });
  if (token) {
    await ctx.addInitScript((t) => {
      try { window.localStorage.setItem('admin_token', t); } catch (_e) { /* no storage */ }
    }, token);
  }
  const page = await ctx.newPage();
  // Detach and archive sit behind `window.confirm`. Playwright AUTO-DISMISSES
  // dialogs, so without this the click is silently cancelled and the run
  // reports a product failure that is really a harness one.
  page.on('dialog', (d) => { d.accept().catch(() => {}); });
  return { ctx, page };
}

/**
 * Did the SPA actually render? Every absence assertion must be gated on this.
 */
const appLoaded = (page) => page.evaluate(() => {
  const root = document.getElementById('root');
  return Boolean(root && root.children.length > 0 && (document.body.innerText || '').trim().length > 0);
}).catch(() => false);

async function go(page, url, timeout) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeout || 60000 });
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err).split('\n')[0] };
  }
}

async function reachable(url, opts) {
  try {
    const res = await fetch(url, opts);
    return { ok: true, status: res.status, res };
  } catch (err) {
    return { ok: false, status: 0, error: `cannot reach ${url} (${(err && err.message) || err})` };
  }
}

/* ----------------------------------------------------------------- locators --- */

const sel = (testid) => `[data-testid="${testid}"]`;
const count = (page, testid) => page.locator(sel(testid)).count();
const countPrefix = (page, prefix) => page.locator(`[data-testid^="${prefix}"]`).count();

async function text(page, testid) {
  const l = page.locator(sel(testid)).first();
  if (!(await l.count())) return null;
  return ((await l.textContent()) || '').replace(/\s+/g, ' ').trim();
}

async function textsPrefix(page, prefix, limit) {
  const l = page.locator(`[data-testid^="${prefix}"]`);
  const n = Math.min(await l.count(), limit || 12);
  const out = [];
  for (let i = 0; i < n; i += 1) {
    out.push(((await l.nth(i).textContent()) || '').replace(/\s+/g, ' ').trim().slice(0, 200));
  }
  return out;
}

/**
 * Click a control by testid. Returns a reason string on failure rather than
 * throwing, so a missing control is a recorded finding and not a dead run.
 */
async function click(page, testid, settleMs) {
  const l = page.locator(sel(testid)).first();
  if (!(await l.count())) return { ok: false, why: `no element carries data-testid="${testid}"` };
  try {
    await l.click({ timeout: 15000 });
    await page.waitForTimeout(settleMs || 1500);
    return { ok: true };
  } catch (err) {
    return { ok: false, why: `click failed: ${String((err && err.message) || err).split('\n')[0]}` };
  }
}

async function fill(page, testid, value) {
  const l = page.locator(sel(testid)).first();
  if (!(await l.count())) return { ok: false, why: `no element carries data-testid="${testid}"` };
  try {
    await l.fill(value, { timeout: 10000 });
    return { ok: true };
  } catch (err) {
    return { ok: false, why: String((err && err.message) || err).split('\n')[0] };
  }
}

/* -------------------------------------------------------------- screenshot --- */

async function shot(page, dir, name, shots) {
  const out = path.join(dir, name);
  try {
    const r = await safeScreenshot(page, out, { fullPage: true });
    shots.push({
      file: name,
      originalWidth: r.originalWidth,
      finalWidth: r.finalWidth,
      downscaled: r.downscaled,
    });
    console.log(`  shot  ${name} (${r.finalWidth}px)`);
    return name;
  } catch (err) {
    console.error(`  shot  FAILED ${name}: ${String((err && err.message) || err)}`);
    return null;
  }
}

/* ------------------------------------------------------------ measurement --- */

/**
 * Horizontal overflow of the whole document, measured rather than argued.
 *
 * The PREVIEW defect was a `<pre>` that WIDENED its column instead of scrolling
 * inside it, so the page itself grew: `scrollWidth` 7745 against a 1440
 * viewport. Reading both numbers is the point — `scrollWidth` alone says
 * nothing without the viewport it is being compared to.
 */
const overflow = (page) => page.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth,
})).catch(() => ({ scrollWidth: -1, clientWidth: -1 }));

/**
 * Read the Provenance table as {field, source, detail} triples straight off the
 * rendered DOM.
 *
 * WHY OFF THE DOM AND NOT OFF THE API. The defect being re-checked was entirely
 * in the READER: the server's payload always carried the tier, the actor and the
 * commit sha, and the panel still printed `unknown` fourteen times. Asserting
 * against the API payload would have passed while the operator looked at a wall
 * of `unknown`, so the only measurement that means anything is the one taken
 * from the cells a human actually reads.
 */
const provenanceRows = (page) => page.evaluate(() => {
  const out = [];
  document.querySelectorAll('[data-testid^="cs-provenance-"]').forEach((el) => {
    if (el.tagName !== 'TR') return;
    const cells = el.querySelectorAll('td');
    if (cells.length < 2) return;
    out.push({
      field: (cells[0].textContent || '').trim(),
      source: (cells[1].textContent || '').trim(),
      detail: ((cells[2] && cells[2].textContent) || '').trim(),
    });
  });
  return out;
}).catch(() => []);

/**
 * Force one API call to fail, in the browser, without touching production.
 *
 * "Action feedback works" cannot be proved by a write that succeeds — success
 * and failure rendered through different branches, and it was the FAILURE
 * branch that was invisible. The honest way to see a failure is to cause one,
 * and the only safe way to cause one on a live record is to stop the request at
 * the browser and answer it with a 500 myself. Nothing reaches the server, so
 * the pilot's consent cannot be changed by this check even in principle.
 */
async function withForcedFailure(page, urlPattern, fn, method) {
  const handler = async (route) => {
    // A URL pattern cannot express a method, and the record endpoint serves GET
    // as well. Letting a GET through matters: intercepting the reload that
    // follows the write would leave the panel showing stale data and the check
    // would be measuring the wrong thing.
    if (method && route.request().method() !== method) {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Forced by the walkthrough to see the failure path render.' }),
    });
  };
  await page.route(urlPattern, handler);
  try {
    return await fn();
  } finally {
    await page.unroute(urlPattern, handler).catch(() => {});
  }
}

module.exports = {
  readToken, Recorder, attachDiagnostics, drainDiagnostics, newAdminPage,
  appLoaded, go, reachable, sel, count, countPrefix, text, textsPrefix, click, fill, shot,
  overflow, provenanceRows, withForcedFailure,
};
