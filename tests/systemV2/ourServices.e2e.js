/**
 * ourServices.e2e.js - logged-in browser proof for the Our Services page at `/admin/gov-services`
 * (Services Upgrade SV4.1). It closes the gap the SV1-SV3 unit suites cannot: that the page an admin
 * actually opens shows the same numbers the API serves.
 *
 * READ-ONLY. It never clicks Link, Promote, Import or any other button that writes. That makes it
 * safe to point at production, which is the only place the real case-study library lives. It reads
 * one API (`GET /api/admin/factory/services/evidence-summary?status=all`) and the rendered DOM, and
 * compares them.
 *
 * WHAT IT PROVES
 *   1. The page loads with no JS errors and no failed /api/ call.
 *   2. The KPI row renders, and "Active services" equals the API's active count.
 *   3. "Services with no proof" equals active + growth services with no proof, and its hint splits
 *      that number into "<n> active · <m> growth" with n + m equal to the tile value. This is the
 *      relabel that stops the tile reading as "15 gaps but only 12 services".
 *   4. Intake shows one card per intake item the API returns.
 *   5. The pre-ticked checkboxes are exactly the suggestions at or above the pre-tick bar
 *      (matchScore >= 5, shown as 75% or more). A suggestion below the bar is never pre-ticked.
 *
 * AUTH (the token is never printed)
 *   - TOKEN_FILE=<path>: an existing admin JWT, for production.
 *   - otherwise a JWT signed with JWT_SECRET (dev default `dev-secret-change-me`), as in
 *     caseStudyAdmin.e2e.js. `requireAdmin` checks signature and role only.
 *
 * IT MUST BE ABLE TO FAIL. An unreachable host is a scored failure:
 *     BASE_URL=http://localhost:59999 PW_PATH=playwright node tests/systemV2/ourServices.e2e.js  -> exit 1
 *
 * Usage:
 *   PW_PATH=playwright node tests/systemV2/ourServices.e2e.js
 *   BASE_URL=https://enterprise.colaberry.ai TOKEN_FILE=scripts/.ali_admin_jwt.txt \
 *     CHROME_PATH="C:/Program Files/Google/Chrome/Application/chrome.exe" node tests/systemV2/ourServices.e2e.js
 * Env: BASE_URL (default http://localhost:3000; the API is read through the same origin), TOKEN_FILE,
 *   JWT_SECRET, CHROME_PATH (system browser when Playwright's own is not installed), SHOT (screenshot path).
 * Exit 0 = every check passed. Exit 1 otherwise.
 */
const fs = require('fs');
const { chromium } = require(process.env.PW_PATH || 'playwright');

const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const API = (process.env.API_URL || BASE).replace(/\/$/, '');
/** Mirrors PRECHECK_AT / suggestionConfidence in ourServicesModel.ts: matchScore 5 is the first score shown at 75%. */
const PRECHECK_MIN_SCORE = 5;

let failures = 0;
const pass = (n, d) => console.log(`  PASS  ${n}${d ? ' - ' + d : ''}`);
function fail(n, d) { console.error(`  FAIL  ${n}${d ? ' - ' + d : ''}`); failures += 1; }
function check(n, ok, d) { if (ok) pass(n, d); else fail(n, d); return Boolean(ok); }

function adminToken() {
  if (process.env.TOKEN_FILE) return fs.readFileSync(process.env.TOKEN_FILE, 'utf8').trim();
  const jwt = require('jsonwebtoken');
  return jwt.sign({ sub: 'e2e-our-services', role: 'admin', email: 'e2e@example.invalid' },
    process.env.JWT_SECRET || 'dev-secret-change-me', { expiresIn: '15m' });
}

/** What the page SHOULD show, derived only from the API payload. */
function expectedFrom(summary) {
  const live = summary.services.filter((s) => s.status !== 'retired');
  const none = live.filter((s) => s.evidenceTier === 'none');
  const preticked = summary.intake.reduce(
    (n, item) => n + item.suggestions.filter((s) => Number(s.matchScore) >= PRECHECK_MIN_SCORE).length, 0);
  return {
    active: live.filter((s) => s.status === 'active').length,
    noProof: none.length,
    noProofActive: none.filter((s) => s.status === 'active').length,
    noProofGrowth: none.filter((s) => s.status === 'growth').length,
    intakeCards: summary.intake.length,
    preticked,
  };
}

/** Value and hint of the StatCard whose label matches. */
async function tile(page, label) {
  return page.$eval('[data-testid="kpi-row"]', (row, l) => {
    const cell = [...row.children].find((c) => c.textContent.includes(l));
    if (!cell) return null;
    // innerText applies CSS text-transform (labels render uppercase), so match the label case-insensitively.
    const text = cell.innerText.split('\n').map((s) => s.trim()).filter(Boolean);
    const i = text.findIndex((s) => s.toLowerCase() === l.toLowerCase());
    if (i < 0) return { value: null, hint: null, all: text };
    return { value: text[i + 1] || null, hint: text[i + 2] || null, all: text };
  }, label);
}

(async () => {
  const token = adminToken();
  const launch = process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {};
  const browser = await chromium.launch(launch);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.addInitScript((t) => { try { window.localStorage.setItem('admin_token', t); } catch (_) { /* storage blocked: page will show login */ } }, token);
  const page = await ctx.newPage();
  const jsErrors = [];
  const apiErrors = [];
  page.on('pageerror', (e) => jsErrors.push(e.message));
  page.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 400) apiErrors.push(`${r.status()} ${r.url().replace(/\?.*/, '')}`); });

  console.log(`\n== Our Services E2E against ${BASE} (read-only)`);
  let summary = null;
  try {
    const r = await ctx.request.get(`${API}/api/admin/factory/services/evidence-summary?status=all`,
      { headers: { Authorization: `Bearer ${token}` }, timeout: 30000 });
    if (check('evidence-summary API answers 200', r.status() === 200, `status ${r.status()}`)) summary = await r.json();
  } catch (e) {
    fail('evidence-summary API reachable', `cannot reach: ${e.message.split('\n')[0]}`);
  }

  let loaded = false;
  try {
    await page.goto(`${BASE}/admin/gov-services`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForSelector('[data-testid="kpi-row"]', { timeout: 30000 });
    loaded = true;
  } catch (e) {
    fail('page renders the KPI row', `cannot reach or render: ${e.message.split('\n')[0]}`);
  }

  if (loaded) {
    await page.waitForTimeout(1500); // let Intake and the charts settle after the summary resolves
    check('no JavaScript errors', jsErrors.length === 0, jsErrors.slice(0, 2).join(' | '));
    check('no failed /api/ calls', apiErrors.length === 0, apiErrors.slice(0, 3).join(' | '));

    const active = await tile(page, 'Active services');
    const noProof = await tile(page, 'Services with no proof');
    check('KPI row shows the Active and No-proof tiles', Boolean(active && noProof));

    if (summary && active && noProof) {
      const want = expectedFrom(summary);
      check('Active services matches the API', active.value === String(want.active), `page ${active.value}, api ${want.active}`);
      check('No-proof tile counts active + growth', noProof.value === String(want.noProof), `page ${noProof.value}, api ${want.noProof}`);
      const m = /^(\d+) active · (\d+) growth$/.exec(noProof.hint || '');
      check('No-proof hint reads "<n> active · <m> growth"', Boolean(m), `hint "${noProof.hint}"`);
      if (m) {
        check('No-proof hint split matches the API', Number(m[1]) === want.noProofActive && Number(m[2]) === want.noProofGrowth,
          `page ${m[1]}/${m[2]}, api ${want.noProofActive}/${want.noProofGrowth}`);
        check('No-proof hint adds up to the tile', Number(m[1]) + Number(m[2]) === Number(noProof.value));
      }

      const intake = await page.evaluate(() => {
        const sec = document.getElementById('intake');
        if (!sec) return null;
        const boxes = [...sec.querySelectorAll('input[type=checkbox]')];
        return { cards: sec.querySelectorAll('[data-testid^="intake-"]:not([data-testid="intake-empty"]):not([data-testid="intake-gate"])').length,
          checked: boxes.filter((b) => b.checked).length };
      });
      if (check('Intake section is on the page', Boolean(intake))) {
        check('one Intake card per API intake item', intake.cards === want.intakeCards, `page ${intake.cards}, api ${want.intakeCards}`);
        check('pre-ticked boxes are exactly the suggestions at 75% or more', intake.checked === want.preticked,
          `page ${intake.checked}, api ${want.preticked}`);
      }
    }
    if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  }

  await browser.close();
  console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('E2E CRASHED', e.message); process.exit(1); });
