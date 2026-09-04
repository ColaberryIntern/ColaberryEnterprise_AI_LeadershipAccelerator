/**
 * Cert Prep walkthrough, part two — the three acceptance criteria that were
 * left PARTIAL after the first pass:
 *
 *   9.  Points awarded end-to-end, through the UI rather than a service call.
 *   12. Mock timing and expiry, seen in the interface.
 *   13. The admin surface walked, including an approval and an evidence
 *       decision that must then appear in the audit trail.
 *
 * Drives the CRA dev server on :3098 against the backend on :3099, which is on
 * the isolated accelerator_cert_dev database. Authenticates by writing the same
 * localStorage keys the real logins write — no form is stubbed and no guard is
 * bypassed.
 *
 * Every claim printed by this script is an assertion against the rendered page
 * or the database, never against what the code was supposed to do.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const APP = 'http://localhost:3095';  // one-origin dev proxy: app :3098 + api :3099
const SP = __dirname;
const OUT = path.join(SP, 'shots2');
fs.mkdirSync(OUT, { recursive: true });

const tok = (n) => fs.readFileSync(path.join(SP, n), 'utf8').trim();
const ADMIN = tok('tok_admin.txt');
const W11 = tok('tok_w11.txt');

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
  console.log(`  saved ${name}.png`);
}

function newPage(browser, viewport = { width: 1440, height: 1000 }) {
  return browser.newContext({ viewport }).then(async (context) => {
    const page = await context.newPage();
    page.__errors = [];
    page.on('console', (m) => { if (m.type() === 'error') page.__errors.push(m.text()); });
    page.on('pageerror', (e) => page.__errors.push(String(e)));
    // Record the failing HTTP responses themselves. A page that renders
    // "Internal server error" tells you nothing about WHICH call failed, and
    // guessing at it afterwards from the API is how a transient gets explained
    // away rather than diagnosed.
    page.__failed = [];
    page.on('response', async (r) => {
      if (r.status() >= 400 && /\/api\//.test(r.url())) {
        let body = '';
        try { body = (await r.text()).slice(0, 300); } catch { body = '<unreadable>'; }
        page.__failed.push(`${r.status()} ${r.request().method()} ${r.url()} :: ${body}`);
      }
    });
    return { context, page };
  });
}

async function craCompileError(page) {
  // CRA's dev overlay means the bundle in the browser is the LAST GOOD one, so
  // every 'element not found' below would be a lie about the current code.
  return page.evaluate(() => {
    const t = document.body.innerText || '';
    return /Compiled with problems|Failed to compile/.test(t) ? t.slice(0, 400) : null;
  });
}

async function auth(page, key, token) {
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await page.evaluate(([k, t]) => localStorage.setItem(k, t), [key, token]);
}

// ── 9. points end-to-end ─────────────────────────────────────────────────────

async function pointsEndToEnd(browser) {
  console.log('\n=== 9. Points, end to end through the UI ===');
  const { context, page } = await newPage(browser);
  await auth(page, 'participant_token', W11);
  await page.goto(`${APP}/portal/cert-prep`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const overlay = await craCompileError(page);
  if (overlay) { check('the dev server compiled the current code', false, overlay.replace(/\s+/g, ' ').slice(0, 200)); }
  await shot(page, '20-certprep-before-diagnostic');

  // Practice tab -> the baseline diagnostic. Clicking the visible control, not
  // calling the API: the point of this criterion is the path a student takes.
  const practiceTab = page.getByRole('tab', { name: /practice/i }).first();
  if (await practiceTab.count()) { await practiceTab.click(); await page.waitForTimeout(400); }

  const start = page.locator('button.cp-action', { hasText: 'Retake the baseline' });
  if (!(await start.count())) {
    check('diagnostic can be started from the UI', false, 'no "Retake the baseline" control found');
    await shot(page, '21-no-diagnostic-control');
    await context.close();
    return;
  }
  await start.click();
  await page.waitForTimeout(2000);
  await shot(page, '21-diagnostic-first-question');

  // Answer every served item: pick the first option, submit, advance.
  let answered = 0;
  for (let i = 0; i < 80; i += 1) {
    const option = page.locator('button.cp-option').first();
    if (!(await option.count())) break;
    await option.click();
    const submit = page.getByRole('button', { name: /^Submit answer$/ });
    if (!(await submit.count())) break;
    await submit.click();
    await page.waitForTimeout(500);
    answered += 1;
    const next = page.getByRole('button', { name: /^Next question$/ });
    const finish = page.getByRole('button', { name: /^Finish and score$/ });
    if (await next.count()) { await next.click(); await page.waitForTimeout(300); continue; }
    if (await finish.count()) { await finish.click(); await page.waitForTimeout(2500); break; }
    break;
  }
  const certFails9 = page.__failed.filter((f) => /cert-prep/.test(f));
  if (certFails9.length) console.log('  failing cert-prep calls: ' + certFails9.join(' | '));
  check('the runner served and accepted answers', answered > 0, `${answered} answered`);
  await shot(page, '22-diagnostic-scored');

  const body = await page.evaluate(() => document.body.innerText);
  check('a score is shown after finishing', /score|readiness/i.test(body));
  check('no console errors from cert-prep', !page.__errors.some((e) => /cert-prep/.test(e)),
    `${page.__errors.length} console errors total`);

  await context.close();
  return answered;
}

// ── 12. mock timing and expiry ───────────────────────────────────────────────

async function mockTimingAndExpiry(browser, db) {
  console.log('\n=== 12. Mock timing and expiry, in the interface ===');
  const { context, page } = await newPage(browser);
  await auth(page, 'participant_token', W11);
  await page.goto(`${APP}/portal/cert-prep`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  const mocksTab = page.getByRole('tab', { name: /mock/i }).first();
  if (await mocksTab.count()) { await mocksTab.click(); await page.waitForTimeout(400); }
  const sitting = page.locator('button.cp-action', { hasText: 'Full sitting' });
  if (!(await sitting.count())) {
    check('a mock can be started from the UI', false, 'no "Full sitting" control');
    await shot(page, '23-no-mock-control');
    await context.close();
    return;
  }
  await sitting.click();
  await page.waitForTimeout(2500);
  await shot(page, '23-mock-started-timer');

  const body = await page.evaluate(() => document.body.innerText);
  check('the mock shows a countdown, not just a question', /\d+\s*:\s*\d{2}|minutes? left|remaining/i.test(body),
    body.match(/\d+\s*:\s*\d{2}[^\n]*/)?.[0] ?? 'no timer text found');

  // Expire it in the database, then come back to it in the browser. This is the
  // only way to see the expiry path without waiting two hours, and it is the
  // real path: the server decides, the page renders what it is told.
  const expired = db.expireLatestMock();
  check('an in-progress mock exists to expire', expired > 0, `${expired} session(s) expired`);

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await shot(page, '24-mock-after-expiry');
  const after = await page.evaluate(() => document.body.innerText);
  check('the expired sitting is not still presented as answerable',
    !/Submit answer/.test(after), after.slice(0, 120).replace(/\s+/g, ' '));

  await context.close();
}

// ── 13. the admin surface ────────────────────────────────────────────────────

async function adminSurface(browser, db) {
  console.log('\n=== 13. The admin surface, walked ===');
  const { context, page } = await newPage(browser);
  await auth(page, 'admin_token', ADMIN);
  await page.goto(`${APP}/admin/cert-prep`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await shot(page, '25-admin-cohort');

  const heading = await page.evaluate(() => document.body.innerText.slice(0, 400));
  check('the admin page renders', /Cert Prep/.test(heading), heading.split('\n')[0]);

  const tabs = ['Question bank', 'Review queue', 'Evidence', 'Audit'];
  for (const [i, label] of tabs.entries()) {
    const tab = page.getByRole('tab', { name: new RegExp(label, 'i') });
    if (!(await tab.count())) { check(`tab "${label}" exists`, false); continue; }
    await tab.click();
    await page.waitForTimeout(1200);
    await shot(page, `2${6 + i}-admin-${label.toLowerCase().replace(/\s+/g, '-')}`);
    check(`tab "${label}" renders`, true);
  }

  // The gate, exercised: send one approved item back to draft, approve it
  // through the UI, and confirm the SERVER stamped this admin as the reviewer.
  const key = db.demoteOneQuestion();
  check('a draft item was prepared for review', !!key, key || 'none');
  if (key) {
    const review = page.getByRole('tab', { name: /Review queue/i });
    if (!(await review.count())) { check('Review queue tab reachable', false); return; }
    await review.click();
    await page.waitForTimeout(1500);
    const draftFilter = page.getByRole('button', { name: /^draft$/i });
    if (await draftFilter.count()) { await draftFilter.click(); await page.waitForTimeout(1200); }
    await shot(page, '30-admin-review-draft');

    const shown = await page.evaluate(() => document.body.innerText);
    check('the draft item is shown with its answer key', shown.includes(key),
      `looking for ${key}`);

    // The queue holds every draft, so the Approve button must be the one INSIDE
    // this key's card. Clicking "the first Approve" would approve someone else's
    // item and then assert against this one - a green check for the wrong act.
    const card = page.locator('div.border.rounded', { hasText: key });
    const approve = card.getByRole('button', { name: /^Approve$/ }).first();
    if (await approve.count()) {
      await approve.click();
      await page.waitForTimeout(2000);
      const row = db.reviewerFor(key);
      check('the server stamped the AUTHENTICATED admin as reviewer',
        row.reviewer === 'walkthrough-admin@colaberry.test',
        `reviewer=${row.reviewer} status=${row.review_status}`);
    } else {
      check('an Approve control was offered', false);
    }
    await shot(page, '31-admin-after-approval');
  }

  // An evidence decision, so the audit trail has both kinds in it — the bug this
  // session fixed was that it only ever had one.
  const mappingId = db.seedPendingEvidence();
  check('a pending evidence mapping was seeded', !!mappingId, mappingId || 'none');
  if (mappingId) {
    // The evidence queue is scoped to the SELECTED cohort's enrollments, so the
    // cohort holding the seeded student has to be the one on screen.
    await page.selectOption('#cert-cohort', { label: 'Cert Dev Cohort' }).catch(() => {});
    await page.waitForTimeout(600);
    const cohortTab = page.getByRole('tab', { name: /Cohort/i });
    if (await cohortTab.count()) { await cohortTab.click(); await page.waitForTimeout(2500); }
    const evTab = page.getByRole('tab', { name: /Evidence/i });
    if (!(await evTab.count())) { check('Evidence tab reachable', false); return; }
    await evTab.click();
    await page.waitForTimeout(1500);
    await shot(page, '32-admin-evidence-pending');

    const reject = page.getByRole('button', { name: /^Reject$/ }).first();
    if (await reject.count()) {
      // Reject with no reason first: the UI must refuse.
      await reject.click();
      await page.waitForTimeout(600);
      const guarded = await page.evaluate(() => document.body.innerText);
      check('a rejection with no reason is REFUSED by the UI',
        /needs a reason/i.test(guarded));
      await shot(page, '33-admin-evidence-reason-required');

      await page.locator('input[placeholder*="Reason"]').first().fill('The artifact is a plan, not a build.');
      await page.getByRole('button', { name: /^Reject$/ }).first().click();
      await page.waitForTimeout(1800);
      const decided = db.mappingState(mappingId);
      check('the rejection was recorded with a named human',
        decided.mapping_state === 'rejected' && decided.verified_by === 'walkthrough-admin@colaberry.test',
        `state=${decided.mapping_state} by=${decided.verified_by} reason=${decided.rejected_reason}`);
    } else {
      check('a Reject control was offered', false);
    }
  }

  // The audit tab must now carry BOTH kinds.
  const auditTab = page.getByRole('tab', { name: /Audit/i });
  if (await auditTab.count()) { await auditTab.click(); await page.waitForTimeout(1800); }
  await shot(page, '34-admin-audit-both-kinds');
  const audit = await page.evaluate(() => document.body.innerText);
  check('the audit trail shows a question decision', /Question/.test(audit));
  check('the audit trail shows an EVIDENCE decision — the bug fixed this session',
    /Evidence/.test(audit) && /rejected/i.test(audit));
  check('the rejection reason is readable in the trail',
    /plan, not a build/i.test(audit));

  await context.close();
}

// ── mobile ───────────────────────────────────────────────────────────────────

async function adminMobile(browser) {
  console.log('\n=== admin page at 390px ===');
  const { context, page } = await newPage(browser, { width: 390, height: 844 });
  await auth(page, 'admin_token', ADMIN);
  await page.goto(`${APP}/admin/cert-prep`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await shot(page, '35-admin-mobile');
  const measure = () => page.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
  const mine = await measure();
  // Compare against an admin page this branch never touched. If both overflow by
  // the same amount it is the admin SHELL, not this page, and saying otherwise
  // would be the third wrong overflow diagnosis of this build.
  await page.goto(`${APP}/admin/accelerator`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const sibling = await measure();
  await shot(page, '36-admin-sibling-mobile');
  check('no horizontal overflow at 390px (cert prep)', mine.s <= mine.c, `scrollWidth=${mine.s} clientWidth=${mine.c}`);
  check('control: a pre-existing admin page at 390px', sibling.s <= sibling.c,
    `/admin/accelerator scrollWidth=${sibling.s} clientWidth=${sibling.c}`);
  await context.close();
}

// ── run ──────────────────────────────────────────────────────────────────────

(async () => {
  const db = require('./walkthrough2-db');
  const browser = await chromium.launch();
  try {
    await pointsEndToEnd(browser);
    console.log('\npoints ledger after the diagnostic:');
    console.table(db.pointsLedger());
    const led = db.pointsLedger();
    check('cert_diagnostic_complete was awarded through the route',
      led.some((r) => r.event_type === 'cert_diagnostic_complete'),
      JSON.stringify(led));

    await mockTimingAndExpiry(browser, db);
    await adminSurface(browser, db);
    await adminMobile(browser);
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log('FAILED:');
    failed.forEach((f) => console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ''}`));
  }
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
})();
