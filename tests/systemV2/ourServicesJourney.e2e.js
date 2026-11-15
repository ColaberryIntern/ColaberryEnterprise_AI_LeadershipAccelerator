/**
 * ourServicesJourney.e2e.js - SV4.1: the WRITE journey on Our Services, end to end, against a staging stack.
 *
 *   import the AgTech whitepaper -> it waits in Intake (Blocked +1) -> a person ticks the service and clicks Link
 *   -> it leaves Intake (Blocked -1) and the service gains its proof.
 *
 * ourServices.e2e.js is the READ-ONLY sibling that is safe on production. This one WRITES, so it is fenced:
 *   - BASE_URL and PG_URL must be plain localhost / 127.0.0.1 (reach a remote staging stack through an SSH tunnel),
 *     and the database name must contain "preview" or "staging". Anything else exits 2 before a single request.
 *   - Every row it creates is a fixture: the service is named "[e2e] ..." and the case study comes from the AgTech
 *     fixture PDF. Leftovers from an earlier run are removed FIRST (so a crashed run cannot poison the next), and
 *     everything is removed again in a `finally`, failure or not. The last check proves zero fixture rows remain.
 *   - The Link click is the human action under test. The fixture suggestion scores below the pre-tick bar, so the
 *     spec has to tick it, exactly as a person would; nothing is auto-confirmed.
 *
 * Checks cover the four mandatory kinds: happy path (the journey), failure (no auth, wrong file type, empty upload,
 * bad decision), boundary (unknown link id, a suggestion below the pre-tick bar), idempotency (re-import, re-suggest,
 * re-confirm all change nothing).
 *
 * Staging: tests/systemV2/ourServicesStaging/README.md stands one up (production images, empty database) and tears it
 * down. Usage:
 *   JWT_SECRET=<staging secret> CHROME_PATH="C:/Program Files/Google/Chrome/Application/chrome.exe" \
 *     node tests/systemV2/ourServicesJourney.e2e.js
 * Env: BASE_URL (default http://127.0.0.1:10441), PG_URL (default postgres://accelerator:accelerator@127.0.0.1:15441/
 *   accelerator_preview), JWT_SECRET (default dev-secret-change-me), CHROME_PATH, PW_PATH, SHOT_DIR.
 * Exit 0 = all checks pass · 1 = a check failed · 2 = refused (not a local staging target) or could not set up.
 */
const fs = require('fs');
const path = require('path');
const { checkLocalUrl, LOCAL_HOSTS } = require('./lib/localOnly');

const BASE = (process.env.BASE_URL || 'http://127.0.0.1:10441').replace(/\/$/, '');
const PG_URL = process.env.PG_URL || 'postgres://accelerator:accelerator@127.0.0.1:15441/accelerator_preview';
const FIXTURE = path.join(__dirname, '..', '..', 'backend', 'src', 'services', 'caseStudy', '__tests__', 'fixtures',
  'outside-case-studies', 'AgTech_-_Advanced_Econometric_Pricing_Model.pdf');
const FIXTURE_NAME = path.basename(FIXTURE);
const SERVICE_NAME = '[e2e] Agricultural Pricing Analytics';
const SHOT_DIR = process.env.SHOT_DIR || path.join(require('os').tmpdir(), 'our-services-journey');
const API = `${BASE}/api/admin/factory`;

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' - ' + detail : ''}`);
  if (!ok) failures += 1;
  return Boolean(ok);
};
const refuse = (reason) => { console.error(JSON.stringify({ event: 'our_services_journey_refused', outcome: 'failure', error_class: 'ValidationError', reason })); process.exit(2); };

/* ---------------------------------------------------------------- guards --- */
const base = checkLocalUrl(BASE);
if (!base.ok) refuse(`BASE_URL: ${base.reason}`);
let pgTarget;
try { pgTarget = new URL(PG_URL); } catch { refuse('PG_URL is not a valid URL'); }
if (!LOCAL_HOSTS.includes(pgTarget.hostname)) refuse(`PG_URL host ${pgTarget.hostname} is not local`);
if (!/(preview|staging)/i.test(pgTarget.pathname)) refuse(`database ${pgTarget.pathname.slice(1)} is not a staging database`);

const jwt = require('jsonwebtoken');
const { Client } = require('pg');
const { chromium } = require(process.env.PW_PATH || 'playwright');
const token = jwt.sign({ sub: 'e2e-our-services-journey', role: 'admin', email: 'e2e@example.invalid' },
  process.env.JWT_SECRET || 'dev-secret-change-me', { expiresIn: '20m' });
const AUTH = { Authorization: `Bearer ${token}` };

async function call(method, url, { body, form, auth = true } = {}) {
  const headers = { ...(auth ? AUTH : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) };
  const res = await fetch(url, { method, headers, body: form || (body ? JSON.stringify(body) : undefined), signal: AbortSignal.timeout(60000) });
  const text = await res.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON error page */ }
  return { status: res.status, json };
}
const upload = (name, bytes, type, auth = true) => {
  const form = new FormData();
  if (bytes) form.append('files', new Blob([bytes], { type }), name);
  return call('POST', `${API}/case-studies/external`, { form, auth });
};
const summary = async () => (await call('GET', `${API}/services/evidence-summary?status=all`)).json;

/* --------------------------------------------------------------- cleanup --- */
/** Every table that holds a fixture row, children first. Returns how many fixture rows were left before deleting. */
const CHILD_TABLES = ['case_study_service_links', 'case_study_external_imports', 'case_study_repo_collections', 'case_study_snapshots',
  'case_study_metrics', 'case_study_evidence', 'case_study_artifacts', 'case_study_publications', 'case_study_sync_runs'];
async function fixtureIds(db) {
  const cs = await db.query('SELECT DISTINCT case_study_id AS id FROM case_study_external_imports WHERE original_filename = $1 AND case_study_id IS NOT NULL', [FIXTURE_NAME]);
  const sv = await db.query("SELECT id FROM service_offerings WHERE name LIKE '[e2e]%'");
  return { caseStudies: cs.rows.map((r) => r.id), services: sv.rows.map((r) => r.id) };
}
async function cleanup(db) {
  const ids = await fixtureIds(db);
  await db.query('BEGIN');
  try {
    if (ids.caseStudies.length) {
      for (const t of CHILD_TABLES) await db.query(`DELETE FROM ${t} WHERE case_study_id = ANY($1::uuid[])`, [ids.caseStudies]);
      await db.query('DELETE FROM case_studies WHERE id = ANY($1::uuid[])', [ids.caseStudies]);
    }
    if (ids.services.length) {
      await db.query('DELETE FROM case_study_service_links WHERE service_offering_id = ANY($1::uuid[])', [ids.services]);
      await db.query('DELETE FROM service_offerings WHERE id = ANY($1::uuid[])', [ids.services]);
    }
    await db.query('COMMIT');
  } catch (err) { await db.query('ROLLBACK'); throw err; }
  return ids.caseStudies.length + ids.services.length;
}

/** Value of the KPI tile whose label matches (labels render uppercase, so match case-insensitively). */
const tile = (page, label) => page.$eval('[data-testid="kpi-row"]', (row, l) => {
  const cell = [...row.children].find((c) => c.textContent.toLowerCase().includes(l.toLowerCase()));
  if (!cell) return null;
  const lines = cell.innerText.split('\n').map((s) => s.trim()).filter(Boolean);
  const i = lines.findIndex((s) => s.toLowerCase() === l.toLowerCase());
  return i < 0 ? null : Number(lines[i + 1]);
}, label);

/* ------------------------------------------------------------------ main --- */
(async () => {
  const db = new Client({ connectionString: PG_URL, connectionTimeoutMillis: 10000, statement_timeout: 30000 });
  let browser = null;
  try { await db.connect(); } catch (err) { console.error(`cannot reach the staging database: ${err.message}`); process.exit(2); }
  console.log(`\n== Our Services WRITE journey against ${BASE} (staging)`);
  try {
    const stale = await cleanup(db);
    console.log(`  setup: removed ${stale} leftover fixture row(s) from an earlier run`);

    console.log('\n-- preflight');
    check('evidence summary refuses a request with no token', (await call('GET', `${API}/services/evidence-summary`, { auth: false })).status === 401);
    const before = await summary();
    if (!check('evidence summary answers with the admin token', before && Array.isArray(before.intake))) throw new Error('no summary');

    const svc = await call('POST', `${API}/services`, { body: {
      name: SERVICE_NAME, category: 'Analytics', status: 'active',
      description: 'Econometric pricing models that set prices for agricultural products from market data.',
      keywords: ['pricing', 'econometric', 'agriculture', 'agtech'] } });
    const serviceId = svc.json && svc.json.service && svc.json.service.id;
    if (!check('fixture service created', svc.status === 201 && serviceId, `HTTP ${svc.status}`)) throw new Error('no fixture service');

    console.log('\n-- import (happy path, failure, idempotency)');
    const pdf = fs.readFileSync(FIXTURE);
    check('import with no token is refused', (await upload(FIXTURE_NAME, pdf, 'application/pdf', false)).status === 401);
    check('a .txt file is refused with 400', (await upload('notes.txt', Buffer.from('hello'), 'text/plain')).status === 400);
    check('an empty upload is refused with 400', (await upload(null, null)).status === 400);
    const first = await upload(FIXTURE_NAME, pdf, 'application/pdf');
    const caseStudyId = first.json && first.json.results && first.json.results[0] && first.json.results[0].caseStudyId;
    if (!check('the AgTech whitepaper imports', first.status === 200 && first.json.summary.created === 1 && caseStudyId, `HTTP ${first.status}`)) throw new Error('import failed');
    const again = await upload(FIXTURE_NAME, pdf, 'application/pdf');
    check('re-importing the same file creates nothing', again.status === 200 && again.json.summary.created === 0
      && again.json.summary.alreadyImported === 1 && again.json.results[0].caseStudyId === caseStudyId);

    const sug = await call('POST', `${API}/case-studies/${caseStudyId}/service-links/suggest`);
    const link = sug.json && (sug.json.links || []).find((l) => l.serviceOfferingId === serviceId || l.serviceId === serviceId);
    // The import already runs the suggester, so this explicit pass usually finds the row present rather than new.
    check('the fixture service is suggested (not confirmed)', sug.status === 200 && link && link.state === 'suggested',
      `import inserted ${first.json.results[0].suggestionsInserted}, explicit pass inserted ${sug.json && sug.json.inserted}`);
    const sug2 = await call('POST', `${API}/case-studies/${caseStudyId}/service-links/suggest`);
    check('suggesting again inserts nothing', sug2.status === 200 && sug2.json.inserted === 0);
    if (!link) throw new Error('no suggestion to link');

    const mid = await summary();
    const card = mid.intake.find((i) => i.id === caseStudyId);
    check('the case study waits in Intake', Boolean(card));
    check('Intake grew by exactly one', mid.intake.length === before.intake.length + 1, `${before.intake.length} -> ${mid.intake.length}`);
    check('the suggestion is below the pre-tick bar, so a person must tick it', card && card.suggestions.some((s) => s.linkId === link.id && Number(s.matchScore) < 5));

    console.log('\n-- the person links it in the browser');
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await ctx.addInitScript((t) => { try { window.localStorage.setItem('admin_token', t); } catch (_) { /* page shows login */ } }, token);
    const page = await ctx.newPage();
    const jsErrors = [];
    page.on('pageerror', (e) => jsErrors.push(e.message));
    await page.goto(`${BASE}/admin/gov-services`, { waitUntil: 'networkidle', timeout: 60000 });
    const cardEl = page.locator(`[data-testid="intake-${caseStudyId}"]`);
    await cardEl.waitFor({ timeout: 30000 });
    check('the Intake card is on the page', true);
    const blockedBefore = await tile(page, 'Blocked case studies');
    check('Blocked case studies tile counts it', blockedBefore === mid.intake.length, `tile ${blockedBefore}, api ${mid.intake.length}`);
    const box = cardEl.getByRole('checkbox', { name: SERVICE_NAME });
    check('its fixture-service box is NOT pre-ticked', !(await box.isChecked()));
    const linkBtn = cardEl.getByRole('button', { name: 'Link (internal only)' });
    check('Link stays disabled until a service is ticked', await linkBtn.isDisabled());
    await box.check();
    await cardEl.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(SHOT_DIR, 'journey-1-ticked.png') });
    await linkBtn.click();
    await cardEl.waitFor({ state: 'detached', timeout: 30000 }).catch(() => {});
    check('after Link the card leaves Intake', (await cardEl.count()) === 0);
    await page.waitForFunction((n) => {
      const row = document.querySelector('[data-testid="kpi-row"]');
      return row && [...row.children].some((c) => /blocked case studies/i.test(c.textContent) && c.innerText.includes(String(n)));
    }, blockedBefore - 1, { timeout: 15000 }).catch(() => {});
    const blockedAfter = await tile(page, 'Blocked case studies');
    check('Blocked case studies tile drops by one', blockedAfter === blockedBefore - 1, `${blockedBefore} -> ${blockedAfter}`);
    await page.screenshot({ path: path.join(SHOT_DIR, 'journey-2-linked.png') });
    check('no JavaScript errors on the page', jsErrors.length === 0, jsErrors.slice(0, 2).join(' | '));

    console.log('\n-- read-back, boundaries, idempotency');
    const after = await summary();
    const svcAfter = after.services.find((s) => s.id === serviceId);
    check('the API no longer lists it in Intake', !after.intake.some((i) => i.id === caseStudyId));
    check('the service now carries it as proof', svcAfter && (svcAfter.caseStudies || []).some((c) => c.id === caseStudyId));
    check('the service is no longer "no proof"', svcAfter && svcAfter.evidenceTier !== 'none', svcAfter && svcAfter.evidenceTier);
    const links = await call('GET', `${API}/case-studies/${caseStudyId}/service-links`);
    const decided = links.json && links.json.links.find((l) => l.id === link.id);
    check('the link is confirmed', decided && decided.state === 'confirmed');
    const re = await call('POST', `${API}/service-links/${link.id}/decide`, { body: { state: 'confirmed' } });
    const linksAgain = await call('GET', `${API}/case-studies/${caseStudyId}/service-links`);
    check('confirming again changes nothing', re.status === 200 && linksAgain.json.links.length === links.json.links.length
      && linksAgain.json.links.find((l) => l.id === link.id).state === 'confirmed', `HTTP ${re.status}`);
    check('"suggested" is not a decision (400)', (await call('POST', `${API}/service-links/${link.id}/decide`, { body: { state: 'suggested' } })).status === 400);
    check('an unknown link id is 404', (await call('POST', `${API}/service-links/00000000-0000-4000-8000-000000000000/decide`, { body: { state: 'confirmed' } })).status === 404);
  } catch (err) {
    check('journey ran to the end', false, err.message);
  } finally {
    if (browser) await browser.close().catch(() => {});
    try {
      await cleanup(db);
      const left = await fixtureIds(db);
      check('cleanup leaves no fixture rows', left.caseStudies.length + left.services.length === 0,
        `${left.caseStudies.length} case studies, ${left.services.length} services`);
    } catch (err) { check('cleanup leaves no fixture rows', false, err.message); }
    await db.end().catch(() => {});
  }
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
