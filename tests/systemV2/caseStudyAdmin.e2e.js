/**
 * caseStudyAdmin.e2e.js — authenticated browser proof for the Case Study review
 * desk at `/admin/case-studies` (spec §18, §42; plan T022 AC2, AC4, AC6).
 *
 * SHAPE. Raw Playwright driven by `node`, like every other script in this
 * directory. No `@playwright/test`, no `playwright.config.*` — neither exists in
 * this repo and adding one would make this file unrunnable the way the others
 * are run. `PW_PATH` is the module specifier handed to `require`, exactly as in
 * `v2-page-health.js`:
 *
 *     PW_PATH=playwright node tests/systemV2/caseStudyAdmin.e2e.js
 *
 * AUTH. A JWT signed with the same secret the API verifies with
 * (`JWT_SECRET`, dev default `dev-secret-change-me`) and injected via
 * `addInitScript` into `localStorage.admin_token`, which is where
 * `AuthContext` and the axios client both read it from. `requireAdmin` verifies
 * the signature and the role and reads no database row, so no seeded admin user
 * is needed. THE TOKEN IS NEVER PRINTED.
 *
 * IT MUST BE ABLE TO FAIL. Reachability is a scored check, a failed navigation
 * is a scored failure rather than a thrown stack, and each workflow step asserts
 * a specific DOM consequence — never "the click did not throw". Prove it:
 *     BASE_URL=http://localhost:59999 API_URL=http://localhost:59998 \
 *       PW_PATH=playwright node tests/systemV2/caseStudyAdmin.e2e.js
 *   -> "cannot reach", every check red, exit 1.
 *
 * THE GATE IS NOT WORKED AROUND. If the publish gate refuses this record, the
 * refusal and its named reasons are REPORTED and the publish-dependent steps are
 * marked skipped. A green run is never bought by weakening a gate, and a skipped
 * step never counts as a pass.
 *
 * DEV DATA ONLY. `REPO_REFS` defaults to a public repository and the record is
 * created, published, unpublished and archived inside whatever database
 * `API_URL` is serving. Point this at production and it will write to
 * production; it is a development script (spec §42's closing line).
 *
 * Usage:
 *   PW_PATH=playwright node tests/systemV2/caseStudyAdmin.e2e.js
 * Env: BASE_URL (default http://localhost:3000), API_URL (default
 *   http://localhost:3101), JWT_SECRET, REPO_REFS, SHOT_DIR.
 * Exit 0 = every check passed and none were skipped. Exit 1 otherwise.
 */
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const { chromium } = require(process.env.PW_PATH || 'playwright');
const { safeScreenshot, writeCaptureSummary } = require('../../scripts/captureHelpers');

const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const API = (process.env.API_URL || 'http://localhost:3101').replace(/\/$/, '');
const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
/**
 * The development fixture repository. Spec §45 allows an ILLUSTRATIVE fixture in
 * development and Playwright only, and forbids it from ever becoming production
 * verified content. A large, unambiguously PUBLIC repository is used on purpose:
 * the analyzer's private-repo redaction is proven by the backend suites, and a
 * public one lets the browser walkthrough exercise the linkable-repo path
 * without any chance of an identity leak. Override with REPO_REFS.
 */
const REPO_REFS = process.env.REPO_REFS || 'https://github.com/expressjs/express';
const SHOT_DIR = process.env.SHOT_DIR
  || path.resolve(__dirname, '../../.loop-architect/runs/20260822-casestudy-os/t022/screenshots');

const VIEWPORT = { width: 1440, height: 1000 };
const TITLE = `T022 browser walkthrough ${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`;

/* ------------------------------------------------------------- scoring --- */

let failures = 0;
let skipped = 0;
const shots = [];

const pass = (n, d) => console.log(`  PASS  ${n}${d ? ' — ' + d : ''}`);
function fail(n, d) { console.error(`  FAIL  ${n}${d ? ' — ' + d : ''}`); failures += 1; }
function check(n, ok, d) { if (ok) pass(n, d); else fail(n, d); return Boolean(ok); }
function skip(n, why) { console.error(`  SKIP  ${n} — ${why}`); skipped += 1; }
const section = (t) => console.log(`\n== ${t}`);

/* ------------------------------------------------------------ helpers --- */

async function reachable(url, opts) {
  try {
    const res = await fetch(url, opts);
    return { ok: true, status: res.status, res };
  } catch (err) {
    return { ok: false, status: 0, error: `cannot reach ${url} (${err && err.message ? err.message : err})` };
  }
}

/**
 * Navigate; a navigation failure is a recorded failure, never a thrown stack.
 *
 * The timeout is generous because the FIRST navigation after a dev-server
 * restart waits on webpack compiling the admin chunk. A 25s limit failed the
 * very first hop of a run whose second hop to the same URL then succeeded,
 * which is a harness artifact reported as a product failure.
 */
async function go(page, label, url) {
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
    pass(`nav ${label}`, url.replace(BASE, '') || '/');
    return true;
  } catch (err) {
    fail(`nav ${label}`, `cannot reach ${url} (${String((err && err.message) || err).split('\n')[0]})`);
    return false;
  }
}

/**
 * Did the SPA actually render? Every absence-style assertion below is gated on
 * this. The first dead-port run of the sibling public script produced nine green
 * checks against `about:blank` — "no broken images", "no console errors", "no
 * overflow" — because an absence assertion is trivially true of a page that does
 * not exist. Those are checks that cannot fail, which is worse than no check.
 */
const appLoaded = (page) => page.evaluate(() => {
  const root = document.getElementById('root');
  return Boolean(root && root.children.length > 0 && (document.body.innerText || '').trim().length > 0);
}).catch(() => false);

const visible = async (page, testid) => (await page.locator(`[data-testid="${testid}"]`).count()) > 0;
const textOf = async (page, testid) => {
  const l = page.locator(`[data-testid="${testid}"]`).first();
  return (await l.count()) ? ((await l.textContent()) || '').trim() : null;
};

/** Click a control by its data-testid. Reports whether the control existed. */
async function clickControl(page, testid, label) {
  const l = page.locator(`[data-testid="${testid}"]`).first();
  if (!(await l.count())) { fail(label, `control [data-testid="${testid}"] is not on the page`); return false; }
  try {
    await l.click({ timeout: 10000 });
    await page.waitForTimeout(1500);
    return true;
  } catch (err) {
    fail(label, `click failed: ${String((err && err.message) || err).split('\n')[0]}`);
    return false;
  }
}

/* ----------------------------------------------------------------- main --- */

(async () => {
  console.log(`caseStudyAdmin.e2e.js\n  BASE=${BASE}\n  API=${API}\n  SHOT_DIR=${SHOT_DIR}`);
  fs.mkdirSync(SHOT_DIR, { recursive: true });

  section('preflight — nothing below is worth anything if these are green against nothing');
  const fe = await reachable(BASE + '/');
  check('frontend reachable', fe.ok && fe.status < 500, fe.error || `HTTP ${fe.status}`);

  const token = jwt.sign(
    { sub: 't022-browser-proof', email: 't022@colaberry-test.local', role: 'admin' },
    SECRET,
    { expiresIn: '2h' },
  );

  const anon = await reachable(`${API}/api/admin/case-studies?limit=1`);
  check('admin API rejects an unauthenticated request with 401',
    anon.ok && anon.status === 401, anon.error || `HTTP ${anon.status}`);

  const authed = await reachable(`${API}/api/admin/case-studies?limit=1`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  check('admin API accepts the signed admin token', authed.ok && authed.status === 200,
    authed.error || `HTTP ${authed.status}`);

  const browser = await chromium.launch();

  async function newPage(withToken) {
    const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    if (withToken) {
      await ctx.addInitScript((t) => {
        try { window.localStorage.setItem('admin_token', t); } catch (_e) { /* no storage */ }
      }, token);
    }
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push('JS: ' + String(e).slice(0, 120)));
    page.on('response', (r) => {
      if (r.status() >= 500) errs.push(r.status() + ' ' + r.url().slice(0, 80));
    });
    // ARCHIVE AND DETACH ARE BEHIND `window.confirm`. Playwright AUTO-DISMISSES
    // dialogs, so without this the click is silently cancelled, the record is
    // never archived, and the run reports a product failure that is really a
    // harness one — which is exactly what the first live run of this script did.
    page.on('dialog', (d) => { d.accept().catch(() => {}); });
    // The created record's id, taken from the create response rather than from
    // "the first row in the table". Row order is the API's, not this script's,
    // and assuming the newest sorts first is how a run ends up driving somebody
    // else's record — this database is shared with concurrent work.
    const created = { id: null };
    page.on('response', async (r) => {
      if (!/\/api\/admin\/case-studies\/from-(repositories|project)$/.test(r.url())) return;
      try {
        const body = await r.json();
        if (body && body.caseStudy && body.caseStudy.id) created.id = body.caseStudy.id;
      } catch (_e) { /* a non-JSON body is reported by the create check itself */ }
    });
    return { ctx, page, errs, created, reset: () => { errs.length = 0; } };
  }

  async function shot(page, name) {
    const out = path.join(SHOT_DIR, name);
    try {
      const r = await safeScreenshot(page, out, { fullPage: true });
      shots.push({ file: name, viewport: `${VIEWPORT.width}x${VIEWPORT.height}`, originalWidth: r.originalWidth, finalWidth: r.finalWidth, downscaled: r.downscaled });
      console.log(`  shot  ${out}`);
    } catch (err) { fail(`screenshot ${name}`, String(err && err.message)); }
  }

  /* -------------------------------------------------- the guard actually guards --- */
  section('the admin surface is guarded');
  const guest = await newPage(false);
  await go(guest.page, '/admin/case-studies (no token)', BASE + '/admin/case-studies');
  await guest.page.waitForTimeout(1500);
  const guestLoaded = await appLoaded(guest.page);
  check('an unauthenticated browser is bounced to /admin/login',
    guestLoaded && guest.page.url().includes('/admin/login'),
    guestLoaded ? guest.page.url().replace(BASE, '') : 'the app never rendered, so this is not evaluated');
  await guest.ctx.close();

  /* ------------------------------------------------------------- the desk --- */
  section('the review desk');
  const a = await newPage(true);
  const navOk = await go(a.page, '/admin/case-studies', BASE + '/admin/case-studies');
  await a.page.waitForTimeout(2500);
  const deskLoaded = await appLoaded(a.page);
  const deskOk = check('the admin SPA rendered', navOk && deskLoaded,
    deskLoaded ? '' : 'no #root content — nothing below this line could be evaluated honestly');
  check('the desk is not bounced to login with a valid admin token',
    deskLoaded && !a.page.url().includes('/admin/login'),
    deskLoaded ? a.page.url().replace(BASE, '') : 'the app never rendered');
  check('dashboard renders', await visible(a.page, 'cs-dashboard'));
  check('candidate-state tabs render', await visible(a.page, 'cs-states'));
  check('create-from-Project control renders', await visible(a.page, 'cs-create-from-project'));
  check('create-from-repositories control renders', await visible(a.page, 'cs-create-from-repositories'));
  check('no uncaught JS error on the desk',
    deskLoaded && a.errs.filter((e) => e.startsWith('JS:')).length === 0,
    deskLoaded ? a.errs.slice(0, 2).join(' | ') : 'the app never rendered');
  await shot(a.page, 'admin-case-studies-desk.png');

  if (!deskOk) {
    console.log('\nThe desk never loaded, so the workflow below cannot be attempted.');
    for (const step of ['create', 'sync', 'provenance', 'readiness gaps', 'override', 'sync history',
      'published-vs-draft diff', 'preview', 'approve', 'publish', 'public confirm', 'unpublish',
      'public removal confirm', 'archive']) skip(`workflow: ${step}`, 'the admin desk did not load');
    await a.ctx.close();
    await browser.close();
    console.log(`\nfailures: ${failures}\nskipped:  ${skipped}\nverdict:  FAIL`);
    process.exit(1);
  }

  /* -------------------------------------------------------------- create --- */
  section('create a candidate from a repository collection');
  await a.page.fill('[data-testid="cs-repo-title"]', TITLE).catch(() => {});
  await a.page.fill('[data-testid="cs-repo-refs"]', REPO_REFS).catch(() => {});
  await clickControl(a.page, 'cs-create-from-repositories', 'workflow: create');
  await a.page.waitForTimeout(3000);
  const createError = await textOf(a.page, 'cs-create-error');
  const createResult = await textOf(a.page, 'cs-create-result');
  const created = check('workflow: create — a draft candidate is created',
    Boolean(createResult) && !createError,
    createError ? `create refused: ${createError}` : String(createResult || '').slice(0, 140));
  await shot(a.page, 'admin-case-study-created.png');

  let recordId = a.created.id;
  if (created) {
    check('workflow: the create response identified the new record', Boolean(recordId),
      recordId ? `id ${recordId}` : 'no id in the create response');
    if (recordId) {
      // The desk must list it, by its own id — not "whatever sorts first".
      await a.page.reload({ waitUntil: 'networkidle' }).catch(() => {});
      await a.page.waitForTimeout(2500);
      const row = a.page.locator(`[data-testid="cs-row-${recordId}"]`).first();
      check('workflow: the new record appears on the desk', (await row.count()) > 0);
      const link = row.locator('a[href*="/admin/case-studies/"]').first();
      if (await link.count()) await link.click().catch(() => {});
      else await go(a.page, 'record detail', `${BASE}/admin/case-studies/${recordId}`);
      await a.page.waitForTimeout(3000);
    }
    check('workflow: open the record',
      Boolean(recordId) && a.page.url().endsWith(`/admin/case-studies/${recordId}`),
      a.page.url().replace(BASE, ''));
  }

  const workflowSteps = ['sync', 'inspect provenance', 'readiness gaps', 'edit an override',
    'sync history', 'published-vs-draft diff', 'preview', 'approve', 'publish',
    'confirm public', 'unpublish', 'confirm public removal', 'archive'];

  if (!recordId || !a.page.url().endsWith(`/admin/case-studies/${recordId}`)) {
    for (const s of workflowSteps) skip(`workflow: ${s}`, 'no record was created, so the workflow cannot run');
    await a.ctx.close();
    await browser.close();
    if (shots.length) writeCaptureSummary(SHOT_DIR, shots);
    console.log(`\nfailures: ${failures}\nskipped:  ${skipped}\nverdict:  ${failures > 0 ? 'FAIL' : 'FAIL-INCOMPLETE'}`);
    process.exit(1);
  }

  /* ---------------------------------------------------------------- sync --- */
  section('sync, provenance, readiness, override');
  await clickControl(a.page, 'cs-sync', 'workflow: sync');
  await a.page.waitForTimeout(6000);
  const syncStamp = await textOf(a.page, 'cs-last-sync');
  const syncError = await textOf(a.page, 'cs-action-error');
  check('workflow: sync — the record records a sync outcome',
    Boolean(syncStamp) || Boolean(syncError),
    syncError ? `sync reported: ${String(syncError).slice(0, 160)}` : `last sync: ${syncStamp}`);
  await shot(a.page, 'admin-case-study-after-sync.png');

  /* ---------------------------------------------------------- provenance --- */
  const provOk = await visible(a.page, 'cs-provenance-version');
  check('workflow: inspect provenance — the version selector renders', provOk);
  if (provOk) {
    const rows = await a.page.locator('[data-testid^="cs-provenance-"]').count();
    const empty = await visible(a.page, 'cs-provenance-empty');
    check('workflow: provenance panel answers (rows or a stated empty)', rows > 0 || empty,
      `${rows} provenance elements, empty=${empty}`);
  }

  /* ------------------------------------------------------------ readiness --- */
  await clickControl(a.page, 'cs-readiness-recheck', 'workflow: readiness gaps');
  await a.page.waitForTimeout(2500);
  const gaps = await a.page.locator('[data-testid^="cs-readiness-gap-"]').count();
  const noReadiness = await visible(a.page, 'cs-readiness-none');
  check('workflow: readiness gaps — named gaps or a stated absence',
    gaps > 0 || noReadiness, `${gaps} named gaps, none-state=${noReadiness}`);
  await shot(a.page, 'admin-case-study-readiness.png');

  /* ------------------------------------------------------------- override --- */
  const overrideInput = a.page.locator('[data-testid="cs-narrative-override-input"]').first();
  if (await overrideInput.count()) {
    await overrideInput.fill('Reviewed in the T022 browser walkthrough.').catch(() => {});
    await a.page.waitForTimeout(500);
    const saved = await clickControl(a.page, 'cs-narrative-override', 'workflow: edit an override');
    const noSnapshot = await visible(a.page, 'cs-narrative-no-snapshot');
    check('workflow: edit an override — the edit is accepted', saved && !noSnapshot,
      noSnapshot ? 'no snapshot exists to override' : 'override submitted');
  } else {
    const noSnapshot = await visible(a.page, 'cs-narrative-no-snapshot');
    skip('workflow: edit an override',
      noSnapshot ? 'the narrative panel states there is no snapshot to override yet'
        : 'no narrative override control rendered');
  }

  /* --------------------------------------------------- history / diff / preview --- */
  section('history, diff, preview');
  await clickControl(a.page, 'cs-sync-history', 'workflow: sync history');
  await a.page.waitForTimeout(2000);
  const runs = await a.page.locator('[data-testid^="cs-sync-run-"]').count();
  const runsEmpty = await visible(a.page, 'cs-sync-runs-empty');
  const runsError = await textOf(a.page, 'cs-sync-runs-error');
  check('workflow: sync history — runs listed, or a stated empty', (runs > 0 || runsEmpty) && !runsError,
    runsError ? `error: ${runsError}` : `${runs} runs, empty=${runsEmpty}`);

  const diffControl = a.page.locator('[data-testid="cs-published-draft-diff"]').first();
  if (await diffControl.count()) {
    const disabled = await diffControl.isDisabled().catch(() => false);
    if (disabled) {
      check('workflow: published-vs-draft diff — control present, correctly inert before first publish',
        true, 'nothing published yet, so there is no published version to diff against');
    } else {
      await clickControl(a.page, 'cs-published-draft-diff', 'workflow: published-vs-draft diff');
      await a.page.waitForTimeout(2500);
      check('workflow: published-vs-draft diff — a diff table renders',
        await visible(a.page, 'cs-diff-table'), await textOf(a.page, 'cs-diff-error') || '');
    }
  } else {
    fail('workflow: published-vs-draft diff', 'control [data-testid="cs-published-draft-diff"] is not on the page');
  }

  await clickControl(a.page, 'cs-preview', 'workflow: preview');
  await a.page.waitForTimeout(3500);
  const previewError = await textOf(a.page, 'cs-preview-error');
  check('workflow: preview — the Enterprise projection renders beside the raw snapshot',
    (await visible(a.page, 'cs-preview-projection-heading')) && (await visible(a.page, 'cs-preview-raw-heading'))
      && !previewError,
    previewError ? `preview error: ${previewError}` : '');
  await shot(a.page, 'admin-case-study-preview.png');

  /* -------------------------------------------------------- gate + publish --- */
  section('the publish gate, then publish / unpublish / archive');
  const gateBlockers = await a.page.locator('[data-testid^="cs-publish-blocker-"]').count();
  console.log(`  note  the gate currently reports ${gateBlockers} blocker(s) for this record`);
  for (let i = 0; i < Math.min(gateBlockers, 12); i += 1) {
    const t = await a.page.locator(`[data-testid="cs-publish-blocker-${i}"]`).textContent().catch(() => null);
    if (t) console.log(`        - ${t.replace(/\s+/g, ' ').trim().slice(0, 180)}`);
  }

  await clickControl(a.page, 'cs-approve', 'workflow: approve');
  await a.page.waitForTimeout(2500);
  const approveError = await textOf(a.page, 'cs-action-error');
  const approveNote = await textOf(a.page, 'cs-action-note');
  const approved = check('workflow: approve — the latest snapshot is approved',
    Boolean(approveNote) && !approveError,
    approveError ? `refused: ${String(approveError).slice(0, 160)}` : String(approveNote || '').slice(0, 120));

  let publicSlug = null;
  let published = false;
  if (approved) {
    await clickControl(a.page, 'cs-publish', 'workflow: publish');
    await a.page.waitForTimeout(3000);
    const publishError = await textOf(a.page, 'cs-action-error');
    const state = await textOf(a.page, 'cs-publication-state');
    published = Boolean(state) && /published/i.test(state) && !publishError;
    if (published) {
      check('workflow: publish — the Enterprise publication is live', true, state);
    } else {
      const blockers = await a.page.locator('[data-testid^="cs-publish-blocker-"]').count();
      const reasons = [];
      for (let i = 0; i < Math.min(blockers, 12); i += 1) {
        const t = await a.page.locator(`[data-testid="cs-publish-blocker-${i}"]`).textContent().catch(() => null);
        if (t) reasons.push(t.replace(/\s+/g, ' ').trim().slice(0, 160));
      }
      // The gate refusing is CORRECT behaviour for a record that does not earn
      // publication. It is reported, never worked around, and the steps that
      // depend on a live record are skipped rather than faked.
      check('workflow: publish — a refusal names every reason', blockers > 0,
        blockers > 0 ? `refused with ${blockers} named reason(s): ${reasons.join(' | ')}`
          : `refused with NO named reason (that is the defect): ${publishError || state}`);
    }
    await shot(a.page, 'admin-case-study-publish-attempt.png');
  } else {
    skip('workflow: publish', 'the snapshot could not be approved, so publish cannot be attempted');
  }

  if (published) {
    const detail = await reachable(`${API}/api/admin/case-studies/${recordId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (detail.ok && detail.status === 200) {
      const body = await detail.res.json().catch(() => null);
      publicSlug = body && body.caseStudy ? body.caseStudy.slug : null;
    }
    if (publicSlug) {
      const live = await reachable(`${API}/api/public/case-studies/${publicSlug}`);
      check('workflow: confirm public — the published record is served publicly',
        live.ok && live.status === 200, live.error || `HTTP ${live.status}`);
      const pageOk = await go(a.page, `/stories/${publicSlug}`, `${BASE}/stories/${publicSlug}`);
      await a.page.waitForTimeout(2500);
      check('workflow: confirm public — /stories/:slug renders the record', pageOk
        && (await a.page.locator('h1').count()) > 0);
      await shot(a.page, 'public-story-detail-after-publish.png');
      await go(a.page, 'record detail', `${BASE}/admin/case-studies/${recordId}`);
      await a.page.waitForTimeout(2500);
    } else {
      skip('workflow: confirm public', 'the record slug could not be read back from the admin API');
    }

    await clickControl(a.page, 'cs-unpublish', 'workflow: unpublish');
    await a.page.waitForTimeout(2500);
    const stateAfter = await textOf(a.page, 'cs-publication-state');
    check('workflow: unpublish — the publication is no longer live',
      Boolean(stateAfter) && !/^published/i.test(stateAfter), stateAfter);
    if (publicSlug) {
      const gone = await reachable(`${API}/api/public/case-studies/${publicSlug}`);
      check('workflow: confirm public removal — the public API stops serving it',
        gone.ok && gone.status === 404, gone.error || `HTTP ${gone.status}`);
    } else {
      skip('workflow: confirm public removal', 'no slug to re-check');
    }
  } else {
    skip('workflow: confirm public', 'the record was never published');
    skip('workflow: unpublish', 'the record was never published');
    skip('workflow: confirm public removal', 'the record was never published');
  }

  await clickControl(a.page, 'cs-archive', 'workflow: archive');
  await a.page.waitForTimeout(3000);
  const archiveError = await textOf(a.page, 'cs-action-error');
  // Read the SERVER's state, not a badge: a badge can lag a request, and a
  // dismissed confirm dialog leaves the badge looking exactly like a refusal.
  const after = await reachable(`${API}/api/admin/case-studies/${recordId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  let archivedStatus = null;
  if (after.ok && after.status === 200) {
    const body = await after.res.json().catch(() => null);
    archivedStatus = body && body.caseStudy ? body.caseStudy.status : null;
  }
  check('workflow: archive — the record reports an archived state',
    archivedStatus === 'archived' && !archiveError,
    archiveError ? `refused: ${String(archiveError).slice(0, 160)}` : `status=${archivedStatus}`);
  await shot(a.page, 'admin-case-study-archived.png');

  await a.ctx.close();
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
