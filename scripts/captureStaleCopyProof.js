#!/usr/bin/env node
/**
 * captureStaleCopyProof.js — AF2.9 acceptance criterion 3, against production.
 *
 * WHY THIS SCRIPT EXISTS
 *
 * AF2.9's third acceptance criterion is that the stale-copy notice is proved
 * "against a real domain project with the pull forced to fail, NOT a fixture."
 * The unit suites (projectSync.staleCopy, projectFreshness,
 * projectHydrate.contentAdoption) pin the behaviour, but a unit test cannot
 * satisfy that criterion by construction: it asserts against a fixture, which
 * is the one thing the criterion excludes.
 *
 * So this drives the real deployed SPA, signed in as a real participant, on a
 * real domain project, with the pull forced to fail at the network layer.
 *
 * THE CONTROL THAT MAKES THE SCREENSHOT WORTH ANYTHING
 *
 * A screenshot of a banner proves the banner can render. It does NOT prove the
 * banner means what it says — a banner that is ALWAYS up would photograph
 * identically. So step C loads the same project with the pull ALLOWED and
 * requires the banner to be ABSENT. Only then does step D's forced failure
 * prove the banner tracks the pull rather than the page.
 *
 * That is the same both-ways rule this repo learned the hard way elsewhere: a
 * control validated in one direction is not a control.
 *
 * USAGE
 *   CAPTURE_TOKEN=<production participant JWT> node scripts/captureStaleCopyProof.js
 *
 *   PROJECT_ID=<uuid>   pin the project instead of taking the active one
 *   BASE_URL=...        default https://enterprise.colaberry.ai
 *   HEADED=1            watch it happen
 *
 * RUN IT FROM THE MAIN CHECKOUT, not a worktree. The worktrees' node_modules is a
 * junction that carries `sharp` but not `playwright`, and npm install must not be
 * run through that junction.
 *
 * The token must be a PRODUCTION participant token. A token signed with any
 * other jwtSecret answers 401 on every route regardless of its expiry, which
 * is how an earlier attempt at this proof was lost: `requireParticipant` runs
 * `jwt.verify(token, env.jwtSecret)`, so a local-dev token looks perfectly
 * valid on inspection and is rejected on arrival. Step A refuses to continue
 * on a 401 rather than photographing a login redirect.
 *
 * NOTHING IS WRITTEN TO PRODUCTION. Every request this makes is a GET, except
 * the recovery button in step E, which GETs one project by id. No completion
 * is ticked, no project is activated, no email is sent.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createSafeContext, safeScreenshot, writeCaptureSummary } = require('./captureHelpers');

let chromium;
try {
  // eslint-disable-next-line global-require
  ({ chromium } = require('playwright'));
} catch (err) {
  console.error('[proof] playwright is not resolvable from here. Run this from the main '
    + 'checkout; a worktree\'s junctioned node_modules does not carry it.');
  process.exit(1);
}

const BASE_URL = (process.env.BASE_URL || 'https://enterprise.colaberry.ai').replace(/\/$/, '');
const TOKEN = process.env.CAPTURE_TOKEN
  || (fs.existsSync(path.join(__dirname, '.ali_jwt.txt'))
    ? fs.readFileSync(path.join(__dirname, '.ali_jwt.txt'), 'utf8').trim()
    : null);

/** The string the banner's recovery button carries. Also the deploy marker. */
const MARKER = 'Get the current version';

/**
 * The banner, found by its HEADLINE rather than its button.
 *
 * Not by the button, because the button's label becomes "Getting the current
 * version…" while a recovery is in flight — so a button-based selector would
 * report the banner ABSENT mid-click, and step E's absence check would pass for
 * the wrong reason. Both headlines are stable through that.
 *
 * Not by role=status alone either: ProjectDriftBanner is also a status region
 * and sits in the same column.
 */
const bannerOf = (page) => page.locator('div[role="status"]')
  .filter({ hasText: /saved copy|could not save the newer version/i });

const stamp = new Date().toISOString().slice(0, 10);
const OUT_DIR = process.env.OUT_DIR
  || path.join(__dirname, '..', 'docs', 'screenshots', `${stamp}-af2.9-stale-copy`);

const shots = [];
const verdict = { ran_at: new Date().toISOString(), base_url: BASE_URL, steps: {} };

function fail(step, message) {
  verdict.steps[step] = { pass: false, detail: message };
  verdict.outcome = 'FAILED';
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'verdict.json'), JSON.stringify(verdict, null, 2));
  console.error(`\n[proof] ${step} FAILED: ${message}`);
  console.error('[proof] No claim is made. verdict.json written.');
  process.exit(1);
}

function pass(step, detail) {
  verdict.steps[step] = { pass: true, detail };
  console.log(`[proof] ${step} ok — ${detail}`);
}

async function api(route) {
  const res = await fetch(`${BASE_URL}${route}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    signal: AbortSignal.timeout(30000),
  });
  return { status: res.status, body: res.status === 200 ? await res.json() : null };
}

async function main() {
  if (!TOKEN) fail('A_token', 'No CAPTURE_TOKEN and no scripts/.ali_jwt.txt.');
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // ── A. The token is a PRODUCTION participant token ────────────────────────
  const inventory = await api('/api/portal/projects');
  if (inventory.status === 401) {
    fail('A_token', 'Production answered 401. The token is signed with a different '
      + 'jwtSecret (or is expired) — it is not a production participant token. Mint one '
      + 'from an admin view-as session; do not photograph the login page.');
  }
  if (inventory.status !== 200) fail('A_token', `/api/portal/projects -> ${inventory.status}`);
  pass('A_token', `authenticated; ${(inventory.body.projects || []).length} project row(s)`);

  // ── B. The subject is a REAL project with a REAL plan, not a fixture ──────
  const tree = (await api('/api/portal/projects/active')).body;
  if (!tree || !Array.isArray(tree.lists)) fail('B_subject', 'No active project tree returned.');

  const stories = tree.lists.flatMap((l) => (Array.isArray(l.tasks) ? l.tasks : []));
  const withPrompt = stories.filter((t) => t.build && String(t.build).trim().length > 0);
  if (stories.length === 0) {
    fail('B_subject', `Project ${tree.id} has a tree but ZERO stories — that is the planless `
      + 'case, which cannot exercise content adoption. Pin a project with a published plan '
      + 'via PROJECT_ID.');
  }
  if (withPrompt.length === 0) {
    fail('B_subject', `Project ${tree.id} has ${stories.length} stories but none carry a prompt. `
      + 'The proof needs server-authored content to be visible.');
  }

  const projectId = process.env.PROJECT_ID || tree.id;
  const subject = stories.find((t) => t.build && t.story_id) || stories[0];
  const taskId = subject.story_id;
  const row = (inventory.body.projects || []).find((p) => p.id === projectId) || null;

  verdict.subject = {
    project_id: projectId,
    project_name: tree.name,
    organization_name: tree.organization_name,
    story_count: stories.length,
    stories_with_a_prompt: withPrompt.length,
    story_under_test: taskId,
    prompt_length: String(subject.build || '').length,
    project_stage: row ? row.project_stage : null,
  };
  pass('B_subject', `${tree.name} (${projectId}) · ${stories.length} stories, `
    + `${withPrompt.length} with prompts · testing ${taskId}`);

  const url = `${BASE_URL}/portal/projects/workspace/${projectId}/${encodeURIComponent(taskId)}`;

  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const ctx = await createSafeContext(browser, { token: TOKEN, label: 'safe' });
  const page = await ctx.newPage();

  try {
    // ── The deploy preflight, so a missing banner cannot be misread as a bug ─
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 60000 });
    await page.waitForTimeout(1500);

    /*
     * THE DEPLOY PREFLIGHT, AND WHY IT READS LOADED RESOURCES RATHER THAN <script> TAGS.
     *
     * ProjectWorkspacePage is `lazy(() => import(...))`, so the banner is NOT in
     * main.<hash>.js — it is in a code-split chunk. An earlier version of this
     * check scanned `document.querySelectorAll('script[src]')` immediately after
     * `goto`, which on 2026-10-28 reported the marker ABSENT from a build that
     * was in fact correctly deployed: main.js genuinely does not contain it, and
     * the chunk that does had not been requested yet.
     *
     * `performance.getEntriesByType('resource')` after networkidle lists what the
     * page ACTUALLY fetched, lazy chunks included, which is the only honest
     * question here. Same-origin only, so d3 from the CDN is not scanned.
     */
    const bundleHasMarker = await page.evaluate(async (marker) => {
      const urls = performance.getEntriesByType('resource')
        .map((e) => e.name)
        .filter((n) => /\.js(\?|$)/.test(n) && n.startsWith(window.location.origin));
      for (const u of urls) {
        // eslint-disable-next-line no-await-in-loop
        const text = await (await fetch(u)).text();
        if (text.includes(marker)) return true;
      }
      return false;
    }, MARKER);
    if (!bundleHasMarker) {
      fail('B_deployed', `The served bundle does not contain "${MARKER}". The frontend `
        + 'carrying AF2.9 is NOT deployed (CRA is baked into the nginx image, so a backend-only '
        + 'deploy leaves it stale). Deploy nginx, then re-run. This is not a code failure.');
    }
    pass('B_deployed', 'the served bundle carries the AF2.9 banner code');

    // ── C. THE CONTROL: a healthy pull shows NO banner ────────────────────────

    if (await bannerOf(page).count() !== 0) {
      fail('C_control', 'The banner is up on a HEALTHY pull. Either the pull failed for an '
        + 'unrelated reason, or the notice does not track the pull. Until this passes, a '
        + 'banner screenshot in step D proves nothing.');
    }
    const storyVisible = await page.locator(`text=${taskId}`).count() > 0;
    const s1 = await safeScreenshot(page, path.join(OUT_DIR, '01-healthy-pull-no-banner.png'), { fullPage: false });
    shots.push({ file: '01-healthy-pull-no-banner.png', ...s1 });
    pass('C_control', `no banner while the pull succeeds (story ${storyVisible ? 'rendered' : 'NOT rendered'})`);

    // ── D. The pull forced to fail. The device already holds the project now. ─
    let blocked = 0;
    await page.route('**/api/portal/projects/active*', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      blocked += 1;
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'forced failure — AF2.9 proof' }),
      });
    });

    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 60000 });
    await page.waitForTimeout(1500);

    if (blocked === 0) fail('D_stale', 'The pull was never attempted, so nothing was forced to fail.');
    if (await bannerOf(page).count() === 0) {
      fail('D_stale', `The pull failed ${blocked}x and NO banner appeared. This is the bug `
        + 'AF2.9 reported, still live.');
    }

    const bannerText = (await bannerOf(page).first().innerText()).replace(/\s+/g, ' ').trim();
    // The fail-soft fallback must still be intact: a notice that costs the student
    // their work would be worse than the silence it replaces.
    const contentSurvived = await page.locator(`text=${taskId}`).count() > 0;
    if (!contentSurvived) {
      fail('D_stale', 'The banner is up but the story is gone. The notice must sit ON TOP of '
        + 'the saved copy, not replace it.');
    }

    const s2 = await safeScreenshot(page, path.join(OUT_DIR, '02-pull-failed-banner.png'), { fullPage: false });
    shots.push({ file: '02-pull-failed-banner.png', ...s2 });
    verdict.banner_text = bannerText;
    pass('D_stale', `banner shown after ${blocked} forced 503(s), story still rendered`);

    // ── E. The recovery, which is what the incognito window did, as a button ──
    const button = page.locator(`button:has-text("${MARKER}")`);
    if (await button.count() === 0) fail('E_recover', 'No recovery button in the banner.');

    await button.first().click();
    await page.waitForTimeout(4000);

    if (await bannerOf(page).count() !== 0) {
      const after = (await bannerOf(page).first().innerText()).replace(/\s+/g, ' ').trim();
      fail('E_recover', `The banner is still up after recovery: "${after}"`);
    }
    if (await page.locator(`text=${taskId}`).count() === 0) {
      fail('E_recover', 'Recovery cleared the banner and the story with it.');
    }

    const s3 = await safeScreenshot(page, path.join(OUT_DIR, '03-recovered.png'), { fullPage: false });
    shots.push({ file: '03-recovered.png', ...s3 });
    pass('E_recover', 'the button fetched the current version and the notice cleared');

    verdict.outcome = 'PROVED';
    fs.writeFileSync(path.join(OUT_DIR, 'verdict.json'), JSON.stringify(verdict, null, 2));
    writeCaptureSummary(OUT_DIR, shots);
    console.log(`\n[proof] PROVED. ${OUT_DIR}`);
  } finally {
    await ctx.close();
    await browser.close();
  }
}

main().catch((err) => {
  fail('unexpected', err && err.stack ? err.stack : String(err));
});
