/**
 * exerciseStoryStudioProduction.js — drive every Story Studio tab against the
 * LIVE enterprise.colaberry.ai admin surface, use each control, and write down
 * what actually happened.
 *
 * THIS IS NOT A TEST AND MUST NOT BECOME ONE. `tests/CLAUDE.md` forbids any
 * test from touching production, so this lives in `scripts/` beside
 * `captureProductionScreenshots.js`, which is the established shape for driving
 * the live app with an admin token and capturing what it looks like.
 *
 * WHAT IT WRITES TO PRODUCTION, EXHAUSTIVELY:
 *   - a storyline on the pilot record (editorial direction; stored outside the
 *     snapshot, unpublishable by construction)
 *   - a re-save of the pilot's consent fields with the values already on them
 *   - one repository attached and then detached, checked back to the record it
 *     started from
 *   - one manual sync
 *   - one draft generation, followed by rejecting every draft it produced
 *   - one chart (unapproved, therefore not rendered publicly)
 *   - one throwaway record, created and then archived
 * It NEVER unpublishes, archives or overrides the pilot record, and it never
 * clicks Publish on any record the gate would not refuse.
 *
 * PROVE IT CAN FAIL BEFORE TRUSTING IT:
 *   STORY_STUDIO_BASE=http://localhost:59999 node scripts/exerciseStoryStudioProduction.js
 * must print a red preflight and exit 1 without opening a browser.
 *
 * Usage:
 *   STORY_STUDIO_TOKEN_FILE=<path> node scripts/exerciseStoryStudioProduction.js
 * Env: STORY_STUDIO_BASE, STORY_STUDIO_RECORD, STORY_STUDIO_OUT,
 *      STORY_STUDIO_TOKEN / STORY_STUDIO_TOKEN_FILE, PW_PATH, SKIP_THROWAWAY.
 * Exit 0 only when every check passed.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PW_PATH || 'playwright');
const P = require('./storyStudioProbe');
const T = require('./storyStudioTabExercises');
const { writeCaptureSummary } = require('./captureHelpers');

const REPO_ROOT = path.resolve(__dirname, '..');
const BASE = (process.env.STORY_STUDIO_BASE || 'https://enterprise.colaberry.ai').replace(/\/$/, '');
const RECORD = process.env.STORY_STUDIO_RECORD || '268c5050-7f83-4b5d-ac39-cd44dbe433e2';
const OUT_DIR = process.env.STORY_STUDIO_OUT
  || path.join(REPO_ROOT, 'docs', 'screenshots', `${new Date().toISOString().slice(0, 10)}-story-studio`);
const VIEWPORT = { width: 1440, height: 1000 };
const STAMP = new Date().toISOString().slice(0, 16).replace('T', ' ');

const TABS = [
  ['truth', 'TRUTH', T.truth],
  ['sources', 'SOURCES', T.sources],
  ['story', 'STORY', T.story],
  ['visuals', 'VISUALS', T.visuals],
  ['surfaces', 'SURFACES', T.surfaces],
  ['preview', 'PREVIEW', T.preview],
  ['publish', 'PUBLISH', T.publish],
];

(async () => {
  const rec = new P.Recorder();
  const shots = [];
  const token = P.readToken();

  console.log(`exerciseStoryStudioProduction\n  BASE=${BASE}\n  RECORD=${RECORD}\n  OUT=${OUT_DIR}`);
  console.log(`  token: ${token ? `present (${token.length} chars)` : 'ABSENT'}`);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  /* ------------------------------------------------------------ preflight --- */
  rec.tab('preflight', 'PREFLIGHT — nothing below is worth anything if these are green against nothing');
  const auth = { headers: { Authorization: `Bearer ${token || 'none'}` } };
  const api = async (suffix) => {
    const r = await P.reachable(`${BASE}/api/admin/case-studies/${RECORD}${suffix}`, auth);
    if (!r.ok) return { status: 0, body: null, error: r.error };
    const body = await r.res.json().catch(() => null);
    return { status: r.status, body };
  };

  const origin = await P.reachable(`${BASE}/`);
  const originOk = rec.check('the origin is reachable', origin.ok && origin.status < 500,
    origin.error || `HTTP ${origin.status}`);
  const anon = await P.reachable(`${BASE}/api/admin/case-studies?limit=1`);
  const anonOk = rec.check('the admin API refuses an anonymous caller with 401',
    anon.ok && anon.status === 401, anon.error || `HTTP ${anon.status}`);
  const authed = await P.reachable(`${BASE}/api/admin/case-studies?limit=1`, auth);
  const authOk = rec.check('the admin API accepts this token',
    Boolean(token) && authed.ok && authed.status === 200, authed.error || `HTTP ${authed.status}`);
  const detail = await api('');
  const recordOk = rec.check('the pilot record is readable',
    detail.status === 200 && Boolean(detail.body && detail.body.caseStudy),
    detail.error || `HTTP ${detail.status}`);

  if (!(originOk && anonOk && authOk && recordOk)) {
    console.log('\nPreflight failed. The browser is not opened, because a green check against an '
      + 'unreachable origin is worse than no check.');
    fs.writeFileSync(path.join(OUT_DIR, '_findings.json'),
      JSON.stringify({ base: BASE, record: RECORD, generatedAt: new Date().toISOString(), preflightFailed: true, tabs: rec.tabs }, null, 2));
    process.exit(1);
  }

  const record = detail.body.caseStudy;
  console.log(`\n  pilot: "${record.title}" — status=${record.status}, slug=${record.slug}`);

  /* -------------------------------------------------------------- browser --- */
  const browser = await chromium.launch();
  const { ctx, page } = await P.newAdminPage(browser, token, VIEWPORT);
  const diag = P.attachDiagnostics(page);

  rec.tab('load', 'THE RECORD LOADS');
  const nav = await P.go(page, `${BASE}/admin/case-studies/${RECORD}`, 90000);
  await page.waitForTimeout(4000);
  const loaded = await P.appLoaded(page);
  const onLogin = page.url().includes('/admin/login');
  const spaOk = rec.check('the admin SPA rendered the record',
    nav.ok && loaded && !onLogin,
    nav.ok ? (onLogin ? 'bounced to /admin/login — the token was not accepted by the browser'
      : (loaded ? '' : 'no #root content')) : nav.error);
  rec.check('the seven-tab strip renders', (await P.count(page, 'cs-studio-tabs')) > 0);
  const tabButtons = await P.countPrefix(page, 'cs-studio-tab-');
  rec.check('all seven tabs are present', tabButtons >= 7, `${tabButtons} tab elements`);
  rec.check('the publish gate band renders above the tab strip',
    (await P.count(page, 'cs-gate-band')) > 0,
    (await P.text(page, 'cs-gate-band-count')) || 'no gate band count rendered');
  await P.shot(page, OUT_DIR, '00-record-loaded.png', shots);
  rec.tabs[rec.tabs.length - 1].diagnostics = P.drainDiagnostics(diag);

  if (process.env.ONLY_THROWAWAY) {
    for (const [, label] of TABS) rec.skip(`${label}: every check`, 'ONLY_THROWAWAY was set');
  } else if (!spaOk) {
    for (const [, label] of TABS) rec.skip(`${label}: every check`, 'the record page never rendered');
  } else {
    const opts = {
      stamp: STAMP,
      throwawayRepo: 'https://github.com/expressjs/express',
      analyzeOwner: 'expressjs',
      analyzeRepo: 'express',
    };
    for (let i = 0; i < TABS.length; i += 1) {
      const [key, label, fn] = TABS[i];
      rec.tab(key, label);
      try {
        await fn(page, rec, api, opts);
      } catch (err) {
        rec.check(`${label}: the tab could be exercised without the harness throwing`, false,
          String((err && err.message) || err).split('\n')[0]);
      }
      const file = `${String(i + 1).padStart(2, '0')}-${key}.png`;
      const saved = await P.shot(page, OUT_DIR, file, shots);
      if (saved) rec.tabs[rec.tabs.length - 1].shots.push(saved);
      rec.tabs[rec.tabs.length - 1].diagnostics = P.drainDiagnostics(diag);
    }
  }

  /* ---------------------------------------------------- the public surface --- */
  rec.tab('public', 'THE PUBLIC PAGE THIS RECORD PUBLISHES TO');
  if (process.env.ONLY_THROWAWAY) {
    rec.skip('the public page', 'ONLY_THROWAWAY was set');
  } else {
    const pub = await P.go(page, `${BASE}/stories/${record.slug}`, 60000);
    await page.waitForTimeout(6000);
    const pubLoaded = await P.appLoaded(page);
    rec.check('the published story page renders', pub.ok && pubLoaded, pub.ok ? '' : pub.error);
    const h1 = await page.locator('h1').first().textContent().catch(() => null);
    rec.check('the public page carries the record\'s headline', Boolean(h1), (h1 || '').trim().slice(0, 120));
    const diagram = await page.locator('[data-testid="story-diagram"]').count().catch(() => 0);
    const svg = diagram ? await page.locator('[data-testid="story-diagram"] svg').count().catch(() => 0) : 0;
    const placeholder = diagram
      ? await page.locator('[data-testid="story-diagram"] .cb-mermaid__placeholder').count().catch(() => 0) : 0;
    rec.check('the architecture diagram either renders or is absent by design',
      diagram === 0 || svg > 0 || placeholder > 0,
      `diagram blocks=${diagram}, rendered svg=${svg}, placeholder=${placeholder}`);
    if (diagram === 0) {
      rec.note('empty-state', 'this record carries no architecture diagram source, so StoryDiagram '
        + 'renders nothing at all — no heading, no empty frame. That is its documented behaviour.');
    }
    await P.shot(page, OUT_DIR, '08-public-story.png', shots);
  }
  rec.tabs[rec.tabs.length - 1].diagnostics = P.drainDiagnostics(diag);

  /* --------------------------------------------------- the throwaway record --- */
  if (!process.env.SKIP_THROWAWAY) {
    rec.tab('throwaway', 'A THROWAWAY RECORD — the lifecycle acts the live record must not receive');
    await runThrowaway(page, rec, shots, token, auth);
    rec.tabs[rec.tabs.length - 1].diagnostics = P.drainDiagnostics(diag);
  } else {
    rec.tab('throwaway', 'A THROWAWAY RECORD');
    rec.skip('the lifecycle acts', 'SKIP_THROWAWAY was set');
  }

  await ctx.close();
  await browser.close();

  /* --------------------------------------------------------------- output --- */
  if (shots.length) writeCaptureSummary(OUT_DIR, shots);
  const findings = {
    base: BASE, record: RECORD, slug: record.slug, generatedAt: new Date().toISOString(),
    failures: rec.failures, skips: rec.skips, tabs: rec.tabs,
  };
  fs.writeFileSync(path.join(OUT_DIR, '_findings.json'), JSON.stringify(findings, null, 2));
  console.log(`\n[findings] ${path.join(OUT_DIR, '_findings.json')}`);
  console.log(`\nfailures: ${rec.failures}`);
  console.log(`skipped:  ${rec.skips}`);
  console.log(`verdict:  ${rec.failures === 0 ? 'PASS' : 'FAIL'}`);
  process.exit(rec.failures === 0 ? 0 : 1);
})().catch((err) => {
  console.error('\nFATAL — the harness itself failed, which is not a pass:',
    err && err.stack ? err.stack : err);
  process.exit(1);
});

/**
 * Create a record, exercise the acts that must never touch the pilot, archive it.
 *
 * Publish is clicked ONLY when the gate has already named at least one refusal,
 * so the refusal path is exercised and a successful publish to the live public
 * site is impossible by construction rather than by intention.
 */
async function runThrowaway(page, rec, shots, token, auth) {
  const title = `ZZ throwaway — Story Studio walkthrough ${STAMP}`;
  const nav = await P.go(page, `${BASE}/admin/case-studies`, 60000);
  await page.waitForTimeout(3500);
  if (!nav.ok || !(await P.appLoaded(page))) {
    rec.check('the review desk loads', false, nav.error || 'no #root content');
    return;
  }
  rec.check('the review desk loads', true);

  await P.fill(page, 'cs-repo-title', title);
  await P.fill(page, 'cs-repo-refs', 'https://github.com/expressjs/express');
  const created = await P.click(page, 'cs-create-from-repositories', 8000);
  await page.waitForTimeout(12000);
  const createErr = await P.text(page, 'cs-create-error');
  const createRes = await P.text(page, 'cs-create-result');
  if (!created.ok || createErr || !createRes) {
    rec.check('a throwaway candidate can be created from a repository collection', false,
      createErr || created.why || 'no create result rendered');
    return;
  }
  rec.check('a throwaway candidate can be created from a repository collection', true,
    createRes.slice(0, 140));

  const list = await P.reachable(`${BASE}/api/admin/case-studies?limit=25&search=${encodeURIComponent('ZZ throwaway')}`, auth);
  const body = list.ok ? await list.res.json().catch(() => null) : null;
  const row = body && Array.isArray(body.items) ? body.items.find((i) => i.title === title) : null;
  if (!row) {
    rec.check('the created record can be identified by its own title', false,
      'the list endpoint did not return a row matching the title this run created');
    return;
  }
  rec.check('the created record can be identified by its own title', true, `id ${row.id}`);

  const detailUrl = `${BASE}/admin/case-studies/${row.id}`;
  await P.go(page, detailUrl, 60000);
  await page.waitForTimeout(4000);

  /* an override — the act deliberately withheld from the pilot */
  await T.openTab(page, rec, 'story', 'THROWAWAY/STORY');
  const overrideInput = page.locator('[data-testid="cs-narrative-override-input"]').first();
  if (await overrideInput.count()) {
    const noSnapshot = (await P.count(page, 'cs-narrative-no-snapshot')) > 0;
    const before = await P.reachable(`${BASE}/api/admin/case-studies/${row.id}`, auth);
    const beforeBody = before.ok ? await before.res.json().catch(() => null) : null;
    const beforeVersion = beforeBody && beforeBody.latestSnapshot ? beforeBody.latestSnapshot.version : null;

    await overrideInput.fill(`Reviewed in the Story Studio walkthrough ${STAMP}.`).catch(() => {});
    const applied = await P.click(page, 'cs-narrative-override', 4000);
    await page.waitForTimeout(3000);

    // A click that resolved is not an override that landed. The version is read
    // back from the server, because the panel's own success banner renders on a
    // different tab and cannot be seen from here.
    const after = await P.reachable(`${BASE}/api/admin/case-studies/${row.id}`, auth);
    const afterBody = after.ok ? await after.res.json().catch(() => null) : null;
    const afterVersion = afterBody && afterBody.latestSnapshot ? afterBody.latestSnapshot.version : null;
    rec.check('applying an override actually mints a new snapshot version',
      applied.ok && afterVersion !== null && afterVersion !== beforeVersion,
      `snapshot version ${beforeVersion} -> ${afterVersion}${applied.ok ? '' : ' (' + applied.why + ')'}`);
    rec.check('the override control is withheld when the panel says there is no snapshot to override',
      !noSnapshot,
      noSnapshot
        ? 'the panel renders "no snapshot yet, there is nothing to review" AND three enabled '
          + 'Apply-override buttons; pressing one 404s with the message "this override not found."'
        : '');
  } else {
    rec.skip('apply an override', (await P.count(page, 'cs-narrative-no-snapshot')) > 0
      ? 'the narrative panel states there is no snapshot to override yet'
      : 'no narrative override input rendered');
  }

  /* the gate, then the lifecycle */
  await T.openTab(page, rec, 'publish', 'THROWAWAY/PUBLISH');
  const approved = await P.click(page, 'cs-approve', 4000);
  const approveErr = await P.text(page, 'cs-action-error');
  const approveNote = await P.text(page, 'cs-action-note');
  rec.check('approve reports its outcome on the publish tab', approved.ok && Boolean(approveNote || approveErr),
    approveErr ? `refused: ${approveErr.slice(0, 180)}` : (approveNote || approved.why || '').slice(0, 180));

  // The preview response names the gate verdict `decision`, NOT `gate`. An
  // earlier revision of this script read `gate.blockers`, found `undefined`,
  // and reported "the gate names 0 refusals" for a record the gate refuses
  // three times over — which would have skipped the refusal path on a false
  // premise. Reading the wrong key is indistinguishable from a clean gate
  // unless the shape is checked, so it is checked.
  const gate = await P.reachable(`${BASE}/api/admin/case-studies/${row.id}/preview`, auth);
  const gateBody = gate.ok ? await gate.res.json().catch(() => null) : null;
  const decision = gateBody ? gateBody.decision : null;
  rec.check('the preview endpoint returns a gate decision in the shape this script reads',
    Boolean(decision) && Array.isArray(decision.blockers) && typeof decision.allowed === 'boolean',
    decision ? `allowed=${decision.allowed}` : `no decision key; body keys: ${gateBody ? Object.keys(gateBody).join(',') : 'none'}`);
  const blockers = decision && Array.isArray(decision.blockers) ? decision.blockers : [];
  rec.note('observation', `the gate names ${blockers.length} refusal(s) for a fresh record: `
    + blockers.map((b) => b.code).slice(0, 8).join(', '));

  if (blockers.length > 0) {
    const pressed = await P.click(page, 'cs-publish', 5000);
    await page.waitForTimeout(2500);
    const named = await P.countPrefix(page, 'cs-publish-blocker-');
    const err = await P.text(page, 'cs-action-error');
    rec.check('a refused publish names every reason on screen', pressed.ok && named > 0,
      named > 0 ? `${named} named reasons; banner: ${(err || '').slice(0, 120)}`
        : 'the publish was refused with NO named reason, which is the defect');
    await P.shot(page, OUT_DIR, '09-throwaway-gate-refusal.png', shots);
  } else {
    rec.skip('press Publish on the throwaway',
      'the gate named no refusal, so pressing Publish could have put content on the live public '
      + 'site; it was not pressed');
  }

  const archived = await P.click(page, 'cs-archive', 5000);
  await page.waitForTimeout(3000);
  const after = await P.reachable(`${BASE}/api/admin/case-studies/${row.id}`, auth);
  const afterBody = after.ok ? await after.res.json().catch(() => null) : null;
  const status = afterBody && afterBody.caseStudy ? afterBody.caseStudy.status : null;
  rec.check('the throwaway record is archived, leaving no debris on the desk',
    status === 'archived', archived.ok ? `status=${status}` : archived.why);
  void token;
}
